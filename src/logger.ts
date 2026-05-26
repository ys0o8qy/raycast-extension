/**
 * Lightweight logger for AI-driven operations (auto-tag, tag-governance).
 *
 * Logs to stdout with timestamps and structured phase markers so users
 * can confirm that batch processing ran correctly.
 */

type LogPhase =
  | "auto-tag"
  | "tag-governance";

interface LogEntry {
  timestamp: string;
  phase: LogPhase;
  step: string;
  message: string;
  data?: unknown;
}

/** In-memory buffer so the UI can display recent logs. */
const logBuffer: LogEntry[] = [];
const MAX_BUFFER = 200;

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function log(
  phase: LogPhase,
  step: string,
  message: string,
  data?: unknown,
): void {
  const entry: LogEntry = {
    timestamp: timestamp(),
    phase,
    step,
    message,
    data,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER) {
    logBuffer.shift();
  }

  const dataStr = data ? ` | ${JSON.stringify(data)}` : "";
  console.log(`[${entry.timestamp}] [${phase.toUpperCase()}] step=${step} ${message}${dataStr}`);
}

/** Return the most recent log entries, newest first, optionally filtered by phase. */
export function getRecentLogs(phase?: LogPhase, limit = 50): LogEntry[] {
  const filtered = phase
    ? logBuffer.filter((e) => e.phase === phase)
    : logBuffer;

  return filtered.slice(-limit).reverse();
}

/** Clear the in-memory buffer. */
export function clearLogs(): void {
  logBuffer.length = 0;
}
