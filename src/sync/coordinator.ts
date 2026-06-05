import { pushToGist, getSyncStatus } from "./sync-service";

let syncTimer: ReturnType<typeof setInterval> | undefined;
let dirty = false;
let consecutiveFailures = 0;
let lastPushAttempt = 0;

const SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours
const MAX_SILENT_FAILURES = 3;

export function resetSyncState(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = undefined;
  }
  dirty = false;
  consecutiveFailures = 0;
}

export function markDirty(): void {
  dirty = true;
  ensureTimerRunning();
}

export function isDirty(): boolean {
  return dirty;
}

export function getLastPushAttemptTime(): number {
  return lastPushAttempt;
}

export function getSyncIntervalMs(): number {
  return SYNC_INTERVAL_MS;
}

function ensureTimerRunning(): void {
  if (syncTimer) {
    return; // Already running
  }

  // Check if a push is overdue on start (e.g., after process restart)
  scheduleNextCheck();
}

function scheduleNextCheck(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
  }

  // Check immediately if we're overdue
  const now = Date.now();
  const elapsed = now - lastPushAttempt;
  const initialDelay =
    lastPushAttempt === 0 || elapsed >= SYNC_INTERVAL_MS
      ? 1000 // Check 1s after start if never checked or overdue
      : SYNC_INTERVAL_MS - elapsed;

  syncTimer = setInterval(
    () => {
      doPeriodicPush();
    },
    SYNC_INTERVAL_MS,
  );

  // Schedule first check after initialDelay
  if (initialDelay < SYNC_INTERVAL_MS) {
    setTimeout(() => {
      doPeriodicPush();
      // Then reset to regular interval
      if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = setInterval(() => {
          doPeriodicPush();
        }, SYNC_INTERVAL_MS);
      }
    }, initialDelay);
  }
}

async function doPeriodicPush(): Promise<void> {
  lastPushAttempt = Date.now();

  if (!dirty) {
    return; // Skip — no local changes since last push
  }

  // Verify sync is configured before attempting push
  try {
    const status = await getSyncStatus();
    if (!status.configured) {
      return;
    }
  } catch {
    return;
  }

  try {
    await pushToGist();
    dirty = false;
    // Reset failure counter on success
    if (consecutiveFailures > 0) {
      consecutiveFailures = 0;
    }
  } catch (error) {
    consecutiveFailures += 1;

    if (consecutiveFailures >= MAX_SILENT_FAILURES) {
      try {
        const { showToast, Toast } = await import("@raycast/api");
        await showToast({
          style: Toast.Style.Failure,
          title: "Gist sync failing",
          message:
            error instanceof Error
              ? error.message
              : "Check your token or open Sync Gist to investigate",
        });
      } catch {
        // Toast API unavailable (e.g., in tests) — ignore
      }
      consecutiveFailures = 0;
    }
  }
}

// Start timer on module import (happens when any command loads that imports storage)
ensureTimerRunning();
