export interface SyncMetadata {
  version: 1;
  gistId: string;
  orgFileName: string;
  configFileName?: string;
  lastSyncedAt: string;
  lastSyncedETag: string | null;
  includeConfig: boolean;
}

export interface SyncPreferences {
  githubPersonalAccessToken?: string;
  orgFilePath: string;
  configFilePath?: string;
}

export interface PushResult {
  kind: "created" | "updated";
  gistId: string;
  gistUrl: string;
}

export interface PullResult {
  kind: "up-to-date" | "updated" | "skipped";
  gistId: string;
  remoteUpdatedAt: string;
}

export interface SyncStatus {
  configured: boolean;
  gistId: string | null;
  gistUrl: string | null;
  lastSyncedAt: string | null;
  localFileExists: boolean;
  remoteUpdatedAt: string | null;
  includeConfig: boolean;
  pendingChanges: boolean;
  error: string | null;
}

export interface GistFile {
  filename: string;
  content: string;
}

export interface GistResponse {
  id: string;
  html_url: string;
  updated_at: string;
  files: Record<string, { filename: string; content?: string }>;
}

export class GistAuthError extends Error {
  constructor(message = "GitHub token is invalid or lacks gist scope") {
    super(message);
    this.name = "GistAuthError";
  }
}

export class GistNotFoundError extends Error {
  constructor(gistId: string) {
    super(`Gist ${gistId} not found — it may have been deleted`);
    this.name = "GistNotFoundError";
  }
}

export class GistRateLimitError extends Error {
  constructor(message = "GitHub API rate limit exceeded — try again later") {
    super(message);
    this.name = "GistRateLimitError";
  }
}

export class GistNetworkError extends Error {
  constructor(message: string) {
    super(`Network error: ${message}`);
    this.name = "GistNetworkError";
  }
}
