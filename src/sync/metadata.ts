import { promises as fs } from "node:fs";
import * as path from "node:path";
import { SyncMetadata, SyncPreferences } from "./types";

interface ReadSyncMetadataOptions {
  getPreferences?: () => SyncPreferences;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
}

interface WriteSyncMetadataOptions {
  getPreferences?: () => SyncPreferences;
  writeFile?: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  mkdir?: (path: string, options?: { recursive?: boolean }) => Promise<string | undefined>;
}

function getSyncPreferences(): SyncPreferences {
  const { getPreferenceValues } = require("@raycast/api") as typeof import("@raycast/api");
  return getPreferenceValues<SyncPreferences>();
}

export function resolveMetadataPath(preferences: SyncPreferences): string {
  const orgPath = preferences.orgFilePath.trim();
  const dir = path.dirname(orgPath);
  const ext = path.extname(orgPath);
  const baseName = path.basename(orgPath, ext);
  return path.join(dir, `${baseName}.gist-sync.json`);
}

export async function readSyncMetadata(
  options: ReadSyncMetadataOptions = {},
): Promise<SyncMetadata | null> {
  const getPreferences =
    options.getPreferences ?? getSyncPreferences;
  const readFile = options.readFile ?? fs.readFile.bind(fs);
  const preferences = getPreferences();

  if (!preferences.orgFilePath?.trim()) {
    return null;
  }

  const filePath = resolveMetadataPath(preferences);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  return validateSyncMetadata(parsed);
}

export async function writeSyncMetadata(
  metadata: SyncMetadata,
  options: WriteSyncMetadataOptions = {},
): Promise<void> {
  const getPreferences =
    options.getPreferences ?? getSyncPreferences;
  const writeFile = options.writeFile ?? fs.writeFile.bind(fs);
  const mkdir = options.mkdir ?? fs.mkdir.bind(fs);
  const preferences = getPreferences();

  const filePath = resolveMetadataPath(preferences);
  const dir = path.dirname(filePath);

  await mkdir(dir, { recursive: true });
  await writeFile(filePath, JSON.stringify(metadata, null, 2) + "\n", "utf8");
}

export function validateSyncMetadata(value: unknown): SyncMetadata {
  const obj = value as Record<string, unknown>;

  if (!obj || typeof obj !== "object") {
    throw new Error("Sync metadata must be an object");
  }

  if (obj.version !== 1) {
    throw new Error("Sync metadata version must be 1");
  }

  if (typeof obj.gistId !== "string" || obj.gistId.trim().length === 0) {
    throw new Error("Sync metadata gistId must be a non-empty string");
  }

  if (typeof obj.orgFileName !== "string" || obj.orgFileName.trim().length === 0) {
    throw new Error("Sync metadata orgFileName must be a non-empty string");
  }

  if (typeof obj.lastSyncedAt !== "string" || obj.lastSyncedAt.trim().length === 0) {
    throw new Error("Sync metadata lastSyncedAt must be a non-empty string");
  }

  const metadata: SyncMetadata = {
    version: 1,
    gistId: obj.gistId.trim(),
    orgFileName: obj.orgFileName.trim(),
    lastSyncedAt: obj.lastSyncedAt.trim(),
    lastSyncedETag:
      typeof obj.lastSyncedETag === "string" ? obj.lastSyncedETag : null,
    includeConfig: obj.includeConfig === true,
  };

  if (
    obj.configFileName !== undefined &&
    typeof obj.configFileName === "string" &&
    obj.configFileName.trim().length > 0
  ) {
    metadata.configFileName = obj.configFileName.trim();
  }

  return metadata;
}
