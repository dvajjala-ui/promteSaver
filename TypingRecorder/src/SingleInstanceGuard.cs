// Single-instance guard: one running TypingRecorder at a time, and a second launch
// brings the existing tray window to the front instead of showing an "already running"
// dialog. This replaces the inline Mutex + MessageBox in Program.Main.
//
// Mechanism (pure local process coordination -- no network, no disk I/O):
//   * A named Mutex ("TypingRecorder.SingleInstance.v1") decides the single owner. The
//     first process to create the named object is the owner; later launches see it
//     already exists and are non-owners.
//   * A named auto-reset EventWaitHandle ("TypingRecorder.Activate.v1") is the poke. The
//     owner runs a background thread that waits on it; a second launch opens it by name,
//     sets it, then exits. When poked, the owner raises ActivateRequested.
//
// IMPORTANT for the integrator: ActivateRequested is raised ON THE BACKGROUND WAIT
// THREAD. This guard deliberately does NOT capture a SynchronizationContext, because
// TryAcquire runs in Program.Main before the MainForm (and therefore before any UI
// context) exists. The subscriber -- MainForm -- is responsible for marshalling onto the
// UI thread itself, guarded by IsHandleCreated, e.g.:
//
//     guard.ActivateRequested += delegate {
//         if (IsHandleCreated) {
//             try { BeginInvoke((MethodInvoker)OpenWindow); } catch { }
//         }
//     };
//
// (Forcing the hidden window's handle to exist under --autostart is handled by MainForm /
// its SetVisibleCore override, a separate module.)
using System;
using System.Threading;

namespace TypingRecorder {

    internal sealed class SingleInstanceGuard {

        // Same names the inline mutex already uses, so this guard correctly detects an
        // instance started by either the old or the new code path.
        const string MutexName    = "TypingRecorder.SingleInstance.v1";
        const string ActivateName = "TypingRecorder.Activate.v1";

        // Kept alive for the whole process lifetime: holding the handle keeps the named
        // kernel object alive, which is what makes later launches see createdNew == false.
        // May be null if the OS refused to arbitrate (see TryAcquire).
        readonly Mutex mutex;

        EventWaitHandle activateEvent;    // named, auto-reset; created by the owner only
        ManualResetEvent shutdownSignal;  // local; releases the wait thread during Dispose
        Thread waitThread;

        readonly object gate = new object();
        bool disposed;

        // Raised (on a background thread) when another launch asks this instance to show
        // its window. Subscribers MUST marshal to the UI thread themselves.
        internal event Action ActivateRequested;

        SingleInstanceGuard(Mutex mutex) {
            this.mutex = mutex;
        }

        /// <summary>
        /// Tries to become the single running instance. Returns true with a running owner
        /// guard when this process is first. Returns false with a non-owner guard when
        /// another instance already holds the slot -- the caller then calls SignalExisting()
        /// to bring that instance forward, calls Dispose(), and exits.
        /// </summary>
        internal static bool TryAcquire(out SingleInstanceGuard guard) {
            bool createdNew;
            Mutex mutex;
            try {
                // initiallyOwned:false -- we never Wait or Release the mutex. We only read
                // createdNew for detection and keep the handle open to keep the named object
                // alive. This keeps Dispose() free of mutex thread-affinity (no ReleaseMutex
                // from a possibly-different thread, no AbandonedMutexException handling).
                mutex = new Mutex(false, MutexName, out createdNew);
            } catch (Exception) {
                // If the OS will not arbitrate (rare: session policy, name collision, resource
                // limits) fail OPEN and let this instance run rather than blocking the user.
                // Single-instance focus is a convenience, not a correctness requirement.
                mutex = null;
                createdNew = true;
            }

            SingleInstanceGuard g = new SingleInstanceGuard(mutex);
            if (createdNew) g.BecomeOwner();
            guard = g;
            return createdNew;
        }

        // Owner only: create the named activate event and start the background wait thread.
        void BecomeOwner() {
            try {
                bool createdEvent;
                activateEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ActivateName, out createdEvent);
            } catch (Exception) {
                activateEvent = null;
            }
            if (activateEvent == null) return; // no event means no focus-existing; the app still runs

            shutdownSignal = new ManualResetEvent(false);
            waitThread = new Thread(new ThreadStart(WaitLoop));
            waitThread.IsBackground = true;
            waitThread.Name = "TypingRecorder.SingleInstance";
            waitThread.Start();
        }

        void WaitLoop() {
            WaitHandle[] handles = new WaitHandle[] { activateEvent, shutdownSignal };
            while (true) {
                int which;
                try {
                    which = WaitHandle.WaitAny(handles);
                } catch (Exception) {
                    // A handle was disposed out from under us, or the wait failed: stop.
                    return;
                }
                if (which != 0) return; // index 1 (shutdownSignal) or anything unexpected: exit

                Action handler = ActivateRequested;
                if (handler != null) {
                    // A subscriber fault must never kill the wait thread.
                    try { handler(); } catch (Exception) { }
                }
            }
        }

        /// <summary>
        /// Called by a second launch (a non-owner guard) to poke the running instance so it
        /// brings its window forward. Best-effort: silently does nothing if no instance is up.
        /// </summary>
        internal void SignalExisting() {
            EventWaitHandle existing = null;
            try {
                existing = EventWaitHandle.OpenExisting(ActivateName);
                existing.Set();
            } catch (WaitHandleCannotBeOpenedException) {
                // No running instance has created the event; nothing to signal.
            } catch (Exception) {
                // Best-effort only -- never let a focus poke crash the second launch.
            } finally {
                if (existing != null) {
                    try { existing.Close(); } catch (Exception) { }
                }
            }
        }

        internal void Dispose() {
            lock (gate) {
                if (disposed) return;
                disposed = true;
            }

            // Release the wait thread BEFORE closing any handle it may be waiting on, so
            // Dispose() never races a blocked WaitAny() on a handle we are about to close.
            try { if (shutdownSignal != null) shutdownSignal.Set(); } catch (Exception) { }
            try {
                Thread t = waitThread;
                if (t != null) t.Join(2000);
            } catch (Exception) { }

            try { if (activateEvent != null) activateEvent.Close(); } catch (Exception) { }
            try { if (shutdownSignal != null) shutdownSignal.Close(); } catch (Exception) { }
            try { if (mutex != null) mutex.Close(); } catch (Exception) { }
        }
    }
}
