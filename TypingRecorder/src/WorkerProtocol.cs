// Shared, dependency-free line codec for the parent <-> field-worker stdio IPC.
//
// One record per line. Records are tab-delimited; the only free-text field
// (a captured field snapshot) is Base64(UTF-8), so arbitrary multi-line text can
// never contain a tab or a newline and therefore can never break line framing.
// This removes any need for a JSON serializer: no System.Web.Extensions, no
// System.Runtime.Serialization, no reflection, no anonymous types. Base64 is just
// System.Convert in mscorlib.
//
// Record grammar (each Encode* returns ONE bare record with NO trailing newline;
// the transport writer appends a single '\n', and BoundedLineReader strips the
// '\n' and any trailing '\r', so TryDecode(reader.ReadLine()) round-trips Encode*):
//     READY
//     HB
//     PING
//     GAP\t<code>                                  <code> in the fixed gap allow-set
//     START\t<pid>\t<startTicks>                    pid>0, ticks a signed long
//     SNAP\t<source>\t<fieldId>\t<base64(utf8 text)>
//           source  : ^[a-z0-9][a-z0-9._-]{0,63}\.exe$
//           fieldId : Guid "D" form
//           text    : decodes to a non-blank string of <= 50000 UTF-16 chars
//
// Consumed by both the worker (FieldWorkerHost) and the parent (FieldSnapshotClient).
// This module applies NO process-eligibility policy: validating the source exe
// pattern is as far as the codec goes. The parent re-applies FocusedFieldReader
// eligibility after a successful decode if it wants to, exactly as the old
// MonitoringCapture.RunParent did.
//
// Compatible with .NET Framework 4.7.2 / C# 5 (csc.exe from Framework v4.0.30319).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace TypingRecorder {

    /// <summary>
    /// Stateless encoder/decoder for the private parent/worker stdio protocol,
    /// plus the bounded line reader both sides use to frame it.
    /// </summary>
    internal static class WorkerProtocol {

        // Big enough for the largest SNAP line: a 50000-char snapshot is at most
        // ~200 KB UTF-8, ~267 KB Base64, plus a ~115-byte header -> well under this.
        internal const int MaxLineBytes = 350000;

        // Upper bound on a decoded snapshot, in UTF-16 chars (matches the producer).
        const int MaxTextChars = 50000;

        // Strict UTF-8: throwOnInvalidBytes = true, so a malformed decode is a
        // protocol violation rather than silent U+FFFD replacement.
        static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);

        // A process exe name never contains a tab or newline; lower-cased by the
        // producer before it is placed on the wire.
        static readonly Regex SourceName =
            new Regex("^[a-z0-9][a-z0-9._-]{0,63}\\.exe$", RegexOptions.CultureInvariant);

        // The only gap codes carried by the worker stdio protocol. (Keyboard-side
        // gaps such as COPY_EVENT / PASTE_EVENT / IME_COMPOSING travel a different
        // in-process path and never appear here.)
        static readonly HashSet<string> GapCodes = new HashSet<string>(StringComparer.Ordinal) {
            "FIELD_UNSUPPORTED", "SOURCE_LIMIT", "SOURCE_UNAVAILABLE", "SAVE_FAILED",
            "WORKER_START_FAILED", "WORKER_HEARTBEAT_TIMEOUT", "WORKER_PROTOCOL",
            "WORKER_EXITED", "WORKER_BACKPRESSURE"
        };

        const string TagReady = "READY";
        const string TagHeartbeat = "HB";
        const string TagPing = "PING";
        const string TagGap = "GAP";
        const string TagStart = "START";
        const string TagSnapshot = "SNAP";

        internal enum MsgKind { Ready, Heartbeat, Gap, Snapshot, Start, Ping, Unknown }

        /// <summary>A decoded record. Only the fields relevant to <see cref="Kind"/> are set.</summary>
        internal sealed class Msg {
            internal MsgKind Kind;
            internal string Code, Source, FieldId, Text;
            internal int Pid;
            internal long StartTicks;
        }

        // ---- Encoders ------------------------------------------------------
        // Each returns ONE bare record. The caller is responsible for framing:
        // write the returned string as UTF-8 followed by a single LF byte (never
        // Console.WriteLine, which would add CRLF and a console code page and
        // corrupt Base64 line framing).

        internal static string EncodeReady() { return TagReady; }

        internal static string EncodeHeartbeat() { return TagHeartbeat; }

        internal static string EncodePing() { return TagPing; }

        /// <summary>
        /// Encodes a gap. An unknown or malformed <paramref name="code"/> is coerced
        /// to SOURCE_UNAVAILABLE so the produced line always decodes (mirrors the old
        /// worker's GapCodes.Contains fallback). Pass a code from the fixed allow-set.
        /// </summary>
        internal static string EncodeGap(string code) {
            return TagGap + "\t" + (IsKnownGapCode(code) ? code : "SOURCE_UNAVAILABLE");
        }

        internal static string EncodeStart(int pid, long startTicks) {
            return TagStart + "\t" + pid.ToString(CultureInfo.InvariantCulture)
                            + "\t" + startTicks.ToString(CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Encodes a field snapshot. The text is Base64(UTF-8) so it can carry any
        /// characters, including tabs and newlines, without breaking line framing.
        /// </summary>
        internal static string EncodeSnapshot(string sourceExe, string fieldId, string text) {
            string payload = Convert.ToBase64String(Utf8.GetBytes(text == null ? "" : text));
            return TagSnapshot + "\t" + (sourceExe == null ? "" : sourceExe)
                               + "\t" + (fieldId == null ? "" : fieldId)
                               + "\t" + payload;
        }

        /// <summary>True if <paramref name="code"/> is one of the fixed worker-protocol gap codes.</summary>
        internal static bool IsKnownGapCode(string code) {
            return code != null && GapCodes.Contains(code);
        }

        // ---- Decoder -------------------------------------------------------

        /// <summary>
        /// Strictly decodes one line (as returned by <see cref="BoundedLineReader.ReadLine"/>,
        /// i.e. without its trailing newline). Returns false on anything malformed; on
        /// false, <paramref name="msg"/> is non-null with Kind = Unknown.
        /// </summary>
        internal static bool TryDecode(string line, out Msg msg) {
            msg = new Msg();
            msg.Kind = MsgKind.Unknown;
            if (string.IsNullOrEmpty(line)) return false;

            // Tag-only records: exact match, no leading/trailing noise tolerated.
            if (line == TagReady) { msg.Kind = MsgKind.Ready; return true; }
            if (line == TagHeartbeat) { msg.Kind = MsgKind.Heartbeat; return true; }
            if (line == TagPing) { msg.Kind = MsgKind.Ping; return true; }

            string[] parts = line.Split('\t');
            string tag = parts[0];

            if (tag == TagGap) {
                if (parts.Length != 2 || !IsKnownGapCode(parts[1])) return false;
                msg.Kind = MsgKind.Gap;
                msg.Code = parts[1];
                return true;
            }

            if (tag == TagSnapshot) {
                if (parts.Length != 4) return false;
                string source = parts[1];
                string fieldId = parts[2];
                if (!SourceName.IsMatch(source)) return false;
                Guid ignored;
                if (!Guid.TryParseExact(fieldId, "D", out ignored)) return false;
                string text;
                if (!TryDecodeText(parts[3], out text)) return false;
                if (string.IsNullOrWhiteSpace(text) || text.Length > MaxTextChars) return false;
                msg.Kind = MsgKind.Snapshot;
                msg.Source = source;
                msg.FieldId = fieldId;
                msg.Text = text;
                return true;
            }

            if (tag == TagStart) {
                if (parts.Length != 3) return false;
                int pid;
                long ticks;
                if (!int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out pid) || pid <= 0)
                    return false;
                if (!long.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out ticks))
                    return false;
                msg.Kind = MsgKind.Start;
                msg.Pid = pid;
                msg.StartTicks = ticks;
                return true;
            }

            return false;
        }

        // Base64 -> UTF-8 string, returning false (never throwing) on bad Base64 or
        // non-UTF-8 bytes. DecoderFallbackException derives from ArgumentException.
        static bool TryDecodeText(string base64, out string text) {
            text = null;
            try {
                byte[] bytes = Convert.FromBase64String(base64);
                text = Utf8.GetString(bytes);
                return true;
            } catch (FormatException) {
                return false;
            } catch (ArgumentException) {
                return false;
            }
        }

        // ---- Bounded line reader -------------------------------------------
        // Ported from MonitoringCapture.BoundedLineReader. Reads bytes, splits on
        // LF (10), strips a single trailing CR (13), and caps each line at 'max'
        // bytes. Returns null at a clean end of stream. Throws InvalidDataException
        // when a line exceeds the cap, when the stream ends mid-line, or when the
        // bytes are not valid UTF-8 (the original threw a MonitoringCapture-private
        // WorkerProblem, which this shared codec cannot reference). Callers should
        // treat null as WORKER_EXITED and any throw as WORKER_PROTOCOL.

        /// <summary>Reads length-bounded, LF-framed lines from a stream. Not thread-safe;
        /// one reader serves one stream from one consumer.</summary>
        internal sealed class BoundedLineReader {
            readonly Stream stream;
            readonly int maximum;
            readonly byte[] input = new byte[4096];
            int offset, length;

            internal BoundedLineReader(Stream s, int max) {
                stream = s;
                maximum = max;
            }

            internal async Task<string> ReadLine() {
                using (var line = new MemoryStream()) {
                    while (true) {
                        if (offset == length) {
                            length = await stream.ReadAsync(input, 0, input.Length);
                            offset = 0;
                            if (length == 0) {
                                if (line.Length == 0) return null;
                                throw new InvalidDataException("Worker stream ended in the middle of a line.");
                            }
                        }
                        int begin = offset;
                        while (offset < length && input[offset] != 10) offset++;
                        int count = offset - begin;
                        if (line.Length + count > maximum)
                            throw new InvalidDataException("Worker line exceeded the maximum length.");
                        line.Write(input, begin, count);
                        if (offset < length) {
                            offset++; // consume the LF
                            byte[] bytes = line.ToArray();
                            int end = bytes.Length;
                            if (end > 0 && bytes[end - 1] == 13) end--; // strip a trailing CR
                            try {
                                string decoded = WorkerProtocol.Utf8.GetString(bytes, 0, end);
                                // A redirected console stdin can surface a stray UTF-8 BOM on the
                                // very first line; strip a leading U+FEFF so the START (and any)
                                // protocol tag still matches. The Base64 payload is decoded
                                // separately, so this never touches captured content.
                                if (decoded.Length > 0 && decoded[0] == '﻿') decoded = decoded.Substring(1);
                                return decoded;
                            } catch (DecoderFallbackException ex) {
                                throw new InvalidDataException("Worker line was not valid UTF-8.", ex);
                            }
                        }
                    }
                }
            }
        }
    }
}
