import test from "node:test";
import assert from "node:assert/strict";
import {
  readSyncMetadata,
  writeSyncMetadata,
  validateSyncMetadata,
  resolveMetadataPath,
} from "../src/sync/metadata";
import { SyncMetadata, SyncPreferences } from "../src/sync/types";

function makePreferences(overrides: Partial<SyncPreferences> = {}): SyncPreferences {
  return {
    githubPersonalAccessToken: "test-token",
    orgFilePath: "/Users/test/library.org",
    ...overrides,
  };
}

test("resolveMetadataPath derives path from orgFilePath", () => {
  assert.equal(
    resolveMetadataPath(makePreferences({ orgFilePath: "/Users/test/library.org" })),
    "/Users/test/library.gist-sync.json",
  );
  assert.equal(
    resolveMetadataPath(makePreferences({ orgFilePath: "/tmp/notes.org" })),
    "/tmp/notes.gist-sync.json",
  );
  assert.equal(
    resolveMetadataPath(makePreferences({ orgFilePath: "/a/b/c/my data.org" })),
    "/a/b/c/my data.gist-sync.json",
  );
});

test("validateSyncMetadata accepts valid metadata", () => {
  const valid: SyncMetadata = {
    version: 1,
    gistId: "abc123",
    orgFileName: "library.org",
    lastSyncedAt: "2026-06-05T12:00:00.000Z",
    lastSyncedETag: null,
    includeConfig: false,
  };

  const result = validateSyncMetadata(valid);
  assert.equal(result.gistId, "abc123");
  assert.equal(result.orgFileName, "library.org");
  assert.equal(result.includeConfig, false);
  assert.equal(result.lastSyncedETag, null);
});

test("validateSyncMetadata accepts metadata with config file", () => {
  const valid = {
    version: 1,
    gistId: "abc123",
    orgFileName: "library.org",
    configFileName: "resource-library.config.json",
    lastSyncedAt: "2026-06-05T12:00:00.000Z",
    lastSyncedETag: "W/\"abc\"",
    includeConfig: true,
  };

  const result = validateSyncMetadata(valid);
  assert.equal(result.gistId, "abc123");
  assert.equal(result.configFileName, "resource-library.config.json");
  assert.equal(result.includeConfig, true);
  assert.equal(result.lastSyncedETag, "W/\"abc\"");
});

test("validateSyncMetadata rejects invalid version", () => {
  assert.throws(() => {
    validateSyncMetadata({ version: 2, gistId: "abc", orgFileName: "f", lastSyncedAt: "t" });
  }, /version must be 1/);
});

test("validateSyncMetadata rejects missing gistId", () => {
  assert.throws(() => {
    validateSyncMetadata({ version: 1, gistId: "", orgFileName: "f", lastSyncedAt: "t" });
  }, /gistId must be/);
});

test("validateSyncMetadata rejects missing orgFileName", () => {
  assert.throws(() => {
    validateSyncMetadata({ version: 1, gistId: "abc", orgFileName: "", lastSyncedAt: "t" });
  }, /orgFileName must be/);
});

test("validateSyncMetadata rejects missing lastSyncedAt", () => {
  assert.throws(() => {
    validateSyncMetadata({ version: 1, gistId: "abc", orgFileName: "f", lastSyncedAt: "" });
  }, /lastSyncedAt must be/);
});

test("readSyncMetadata returns null when file does not exist", async () => {
  const result = await readSyncMetadata({
    getPreferences: () => makePreferences(),
    readFile: async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    },
  });

  assert.equal(result, null);
});

test("readSyncMetadata returns null for empty orgFilePath", async () => {
  const result = await readSyncMetadata({
    getPreferences: () => makePreferences({ orgFilePath: "" }),
  });

  assert.equal(result, null);
});

test("readSyncMetadata returns parsed metadata", async () => {
  const metadata: SyncMetadata = {
    version: 1,
    gistId: "test-gist-id",
    orgFileName: "library.org",
    lastSyncedAt: "2026-06-05T12:00:00.000Z",
    lastSyncedETag: null,
    includeConfig: false,
  };

  const result = await readSyncMetadata({
    getPreferences: () => makePreferences(),
    readFile: async () => JSON.stringify(metadata),
  });

  assert.ok(result);
  assert.equal(result?.gistId, "test-gist-id");
  assert.equal(result?.orgFileName, "library.org");
});

test("readSyncMetadata returns null for invalid JSON", async () => {
  const result = await readSyncMetadata({
    getPreferences: () => makePreferences(),
    readFile: async () => "not valid json {{{",
  });

  assert.equal(result, null);
});

test("writeSyncMetadata writes valid JSON", async () => {
  let writtenPath = "";
  let writtenContent = "";

  const metadata: SyncMetadata = {
    version: 1,
    gistId: "test-gist-id",
    orgFileName: "library.org",
    lastSyncedAt: "2026-06-05T12:00:00.000Z",
    lastSyncedETag: null,
    includeConfig: false,
  };

  await writeSyncMetadata(metadata, {
    getPreferences: () => makePreferences(),
    writeFile: async (path, content) => {
      writtenPath = path;
      writtenContent = content;
    },
    mkdir: async () => undefined,
  });

  assert.ok(writtenPath.includes("library.gist-sync.json"));
  const parsed = JSON.parse(writtenContent);
  assert.equal(parsed.gistId, "test-gist-id");
  assert.equal(parsed.version, 1);
});
