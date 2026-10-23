# Writing Studio — beta user guide

## Purpose

Create a **writing preference profile** based on examples you choose, then generate instructions you can edit and paste into another AI tool to help it follow that style. This is **not** a claim that the profile perfectly replicates you, and it is not identity verification, AI training or comprehensive grammar checking.

## Quick start

1. Run the normal local vault (`start-windows.ps1` or `start-mac.command`) on Node 24.16.x and unlock your vault.
2. Open **Writing Studio** in the left navigation. Give the profile a context label: e.g., *Project changelogs*, *Friendly emails*, or *Direct technical support*.
3. Paste your own sample text, using `---` on its own line to separate distinct examples. Do not paste secrets, credentials, coworkers' private messages, or writing you cannot use with permission.
4. Click **Analyze selected writing**. Check sentence/list statistics, inferred style tendencies, and the samples shown in the expanded review. These are simple measures that can be wrong on very small or unusual text.
5. Edit **tone**, **audience**, and **avoid phrases** as desired. **Retain sample excerpts** is unchecked by default. Leave unchecked to store the derived metrics without sample excerpts. Checking it stores excerpts encrypted in the vault.
6. Click **Save encrypted profile**. You may edit existing profiles, including stripping previously stored excerpts by unchecking retention and saving. Delete when the profile is no longer wanted.
7. In **Use your voice with an AI tool**, describe a concrete task, e.g., "Rewrite this release note in a concise friendly style without changing facts." Click **Generate instructions**. The app outputs a reviewable instruction block, *not an AI-generated rewrite*.
8. By default **no writing excerpts or learned phrases** are included in the generated instructions. If your encrypted profile retained examples and you explicitly opt in to including them, the instructions can include sensitive phrases; review before pasting into a third-party AI tool.
9. Copy, download, or save the reviewed instruction block as a normal prompt. **Export profile JSON** is an **unencrypted** file even when your vault was encrypted. Export only when needed, inspect content, and protect it before sharing.

## Review my writing

Paste text in **Local writing check**, click **Check writing**, review flagged issues, and click **Apply** only for specific corrections. A fresh check is required after an edit. This feature flags possible double spaces, duplicated English words, repeated punctuation, trailing whitespace, and sentences with more than 40 words. It cannot judge grammar, meaning, whether a repeated word is intentional, or factual accuracy. It never auto-edits other applications.

## Privacy notes

- No background recording, cloud model, API key, or periodic grammar checker runs in this release.
- Your raw pasted text briefly exists in the unlocked UI and transient HTTP request. When locking the vault, Writing Studio input fields and results are cleared from the browser DOM; ordinary OS swap/clipboard protection is not guaranteed.
- The sample analyzer attempts best-effort sensitive-token redaction before deriving the profile; do not rely on it for comprehensive confidential-data removal.
- Deleting a profile deletes its current encrypted database record, **not** every previously exported file, old encrypted backup, OS snapshot, or copy pasted into an AI service.
- Portable *vault* backups use the existing encrypted backup mechanism and now include saved writing profiles. Direct style `JSON` export is separate and plain text.

## Known limits

Up to 16 profiles, up to 12 examples per analysis with 10,000 UTF-16 characters per example, up to 12,000 characters per proofreading check. Windows/macOS native installer and browser-extension real-site testing are outstanding. Writing Studio supports English-oriented heuristics, not multilingual proofreading.
