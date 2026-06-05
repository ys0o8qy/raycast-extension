import { promises as fs } from "node:fs";
import * as path from "node:path";
import { getPreferenceValues } from "@raycast/api";
import { readSyncMetadata, writeSyncMetadata, resolveMetadataPath } from "./metadata";
import { createGist, getGist, updateGist, validateToken } from "./gist-client";
import {
  PullResult,
  PushResult,
  SyncMetadata,
  SyncPreferences,
  SyncStatus,
} from "./types";

interface SyncServiceOptions {
  getPreferences?: () => SyncPreferences;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile?: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  statFile?: (path: string) => Promise<{ mtimeMs: number }>;
}

function getSyncPreferences(): SyncPreferences {
  return getPreferenceValues<SyncPreferences>();
}

async function readLocalFile(
  filePath: string,
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>,
): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function getLocalMtime(
  filePath: string,
  statFile: (path: string) => Promise<{ mtimeMs: number }>,
): Promise<string | null> {
  try {
    const stat = await statFile(filePath);
    return new Date(stat.mtimeMs).toISOString();
  } catch {
    return null;
  }
}

export async function getSyncStatus(
  options: SyncServiceOptions = {},
): Promise<SyncStatus> {
  const getPreferences = options.getPreferences ?? getSyncPreferences;
  const readFile = options.readFile ?? fs.readFile.bind(fs);
  const preferences = getPreferences();

  const hasToken = Boolean(preferences.githubPersonalAccessToken?.trim());
  const orgPath = preferences.orgFilePath?.trim();

  if (!hasToken || !orgPath) {
    return {
      configured: false,
      gistId: null,
      gistUrl: null,
      lastSyncedAt: null,
      localFileExists: false,
      remoteUpdatedAt: null,
      includeConfig: false,
      pendingChanges: false,
      error: null,
    };
  }

  const metadata = await readSyncMetadata({
    getPreferences: () => preferences,
    readFile,
  });

  if (!metadata) {
    const localExists = (await readLocalFile(orgPath, readFile)) !== null;
    return {
      configured: false,
      gistId: null,
      gistUrl: null,
      lastSyncedAt: null,
      localFileExists: localExists,
      remoteUpdatedAt: null,
      includeConfig: false,
      pendingChanges: false,
      error: null,
    };
  }

  const localMtime = await getLocalMtime(orgPath, options.statFile ?? fs.stat.bind(fs));
  const gistUrl = `https://gist.github.com/${metadata.gistId}`;

  const pendingChanges = localMtime !== null && localMtime !== metadata.lastSyncedAt;

  return {
    configured: true,
    gistId: metadata.gistId,
    gistUrl,
    lastSyncedAt: metadata.lastSyncedAt,
    localFileExists: true,
    remoteUpdatedAt: null, // Populated on demand by checking remote
    includeConfig: metadata.includeConfig,
    pendingChanges,
    error: null,
  };
}

export async function pushToGist(
  options: SyncServiceOptions = {},
): Promise<PushResult> {
  const getPreferences = options.getPreferences ?? getSyncPreferences;
  const readFile = options.readFile ?? fs.readFile.bind(fs);
  const preferences = getPreferences();

  const orgPath = preferences.orgFilePath?.trim();
  if (!orgPath) {
    throw new Error("Org file path is not configured");
  }

  const orgContent = await readLocalFile(orgPath, readFile);
  if (orgContent === null) {
    throw new Error(`Org file not found at ${orgPath}`);
  }

  const orgFileName = path.basename(orgPath);
  let metadata = await readSyncMetadata({
    getPreferences: () => preferences,
    readFile,
  });

  const files: Record<string, { content: string }> = {
    [orgFileName]: { content: orgContent },
  };

  // Optionally include the config file
  if (metadata?.includeConfig && preferences.configFilePath?.trim()) {
    const configContent = await readLocalFile(preferences.configFilePath.trim(), readFile);
    if (configContent !== null && metadata?.configFileName) {
      files[metadata.configFileName] = { content: configContent };
    }
  }

  let gistId: string;
  let gistUrl: string;
  let kind: "created" | "updated";

  if (metadata) {
    const result = await updateGist(metadata.gistId, files, {
      getPreferences: () => preferences,
    });
    gistId = metadata.gistId;
    gistUrl = `https://gist.github.com/${gistId}`;
    kind = "updated";
  } else {
    // First push: create the Gist
    const result = await createGist(orgContent, orgFileName, {
      getPreferences: () => preferences,
    });
    gistId = result.gistId;
    gistUrl = result.gistUrl;
    kind = "created";

    metadata = {
      version: 1,
      gistId,
      orgFileName,
      lastSyncedAt: "",
      lastSyncedETag: null,
      includeConfig: false,
    };
  }

  // Update sync metadata with the current local mtime
  const localMtime = await getLocalMtime(orgPath, options.statFile ?? fs.stat.bind(fs));
  const now = localMtime ?? new Date().toISOString();

  await writeSyncMetadata(
    {
      ...metadata,
      lastSyncedAt: now,
      lastSyncedETag: null,
    },
    {
      getPreferences: () => preferences,
    },
  );

  return { kind, gistId, gistUrl };
}

export async function pullFromGist(
  options: SyncServiceOptions = {},
): Promise<PullResult> {
  const getPreferences = options.getPreferences ?? getSyncPreferences;
  const readFile = options.readFile ?? fs.readFile.bind(fs);
  const writeFile = options.writeFile ?? fs.writeFile.bind(fs);
  const preferences = getPreferences();

  const orgPath = preferences.orgFilePath?.trim();
  if (!orgPath) {
    throw new Error("Org file path is not configured");
  }

  const metadata = await readSyncMetadata({
    getPreferences: () => preferences,
    readFile,
  });

  if (!metadata) {
    throw new Error("Sync is not configured — create or connect a Gist first");
  }

  const gist = await getGist(metadata.gistId, {
    getPreferences: () => preferences,
  });

  const remoteUpdatedAt = gist.updatedAt;

  if (remoteUpdatedAt <= metadata.lastSyncedAt) {
    return {
      kind: "up-to-date" as const,
      gistId: metadata.gistId,
      remoteUpdatedAt,
    };
  }

  // Remote is newer — write to local
  const orgFile = gist.files[metadata.orgFileName];
  if (!orgFile) {
    throw new Error(
      `Gist does not contain file "${metadata.orgFileName}". Expected one of: ${Object.keys(gist.files).join(", ")}`,
    );
  }

  await writeFile(orgPath, orgFile.content, "utf8");

  // Also restore config if included
  if (
    metadata.includeConfig &&
    metadata.configFileName &&
    preferences.configFilePath?.trim()
  ) {
    const configFile = gist.files[metadata.configFileName];
    if (configFile) {
      await writeFile(preferences.configFilePath.trim(), configFile.content, "utf8");
    }
  }

  await writeSyncMetadata(
    {
      ...metadata,
      lastSyncedAt: remoteUpdatedAt,
      lastSyncedETag: gist.etag,
    },
    {
      getPreferences: () => preferences,
    },
  );

  return {
    kind: "updated",
    gistId: metadata.gistId,
    remoteUpdatedAt,
  };
}

export async function setupGist(
  includeConfig: boolean,
  options: SyncServiceOptions = {},
): Promise<PushResult> {
  const getPreferences = options.getPreferences ?? getSyncPreferences;
  const readFile = options.readFile ?? fs.readFile.bind(fs);
  const writeFile = options.writeFile ?? fs.writeFile.bind(fs);
  const preferences = getPreferences();

  const orgPath = preferences.orgFilePath?.trim();
  if (!orgPath) {
    throw new Error("Org file path is not configured");
  }

  const orgContent = await readLocalFile(orgPath, readFile);
  if (orgContent === null) {
    throw new Error(`Org file not found at ${orgPath}`);
  }

  const orgFileName = path.basename(orgPath);
  const configFileName = preferences.configFilePath?.trim()
    ? path.basename(preferences.configFilePath.trim())
    : undefined;

  const result = await createGist(orgContent, orgFileName, {
    getPreferences: () => preferences,
  });

  const metadata: SyncMetadata = {
    version: 1,
    gistId: result.gistId,
    orgFileName,
    lastSyncedAt: new Date().toISOString(),
    lastSyncedETag: null,
    includeConfig,
  };

  if (includeConfig && configFileName && preferences.configFilePath?.trim()) {
    metadata.configFileName = configFileName;

    // Push config file too
    const configContent = await readLocalFile(preferences.configFilePath.trim(), readFile);
    if (configContent !== null) {
      await updateGist(
        result.gistId,
        {
          [orgFileName]: { content: orgContent },
          [configFileName]: { content: configContent },
        },
        { getPreferences: () => preferences },
      );
    }
  }

  const localMtime = await getLocalMtime(orgPath, options.statFile ?? fs.stat.bind(fs));
  if (localMtime) {
    metadata.lastSyncedAt = localMtime;
  }

  await writeSyncMetadata(metadata, {
    getPreferences: () => preferences,
  });

  return { kind: "created", gistId: result.gistId, gistUrl: result.gistUrl };
}

export async function connectToGist(
  gistId: string,
  includeConfig: boolean,
  options: SyncServiceOptions = {},
): Promise<void> {
  const getPreferences = options.getPreferences ?? getSyncPreferences;
  const readFile = options.readFile ?? fs.readFile.bind(fs);
  const preferences = getPreferences();

  const orgPath = preferences.orgFilePath?.trim();
  if (!orgPath) {
    throw new Error("Org file path is not configured");
  }

  // Validate the Gist exists and is accessible
  const gist = await getGist(gistId, {
    getPreferences: () => preferences,
  });

  const orgFileName = path.basename(orgPath);
  const configFileName = preferences.configFilePath?.trim()
    ? path.basename(preferences.configFilePath.trim())
    : undefined;

  // If the Gist doesn't have our Org file, we'll add it on first push
  const metadata: SyncMetadata = {
    version: 1,
    gistId,
    orgFileName,
    lastSyncedAt: gist.updatedAt,
    lastSyncedETag: gist.etag,
    includeConfig,
  };

  if (includeConfig && configFileName) {
    metadata.configFileName = configFileName;
  }

  await writeSyncMetadata(metadata, {
    getPreferences: () => preferences,
  });
}

export async function disconnectGist(
  options: SyncServiceOptions = {},
): Promise<void> {
  const getPreferences = options.getPreferences ?? getSyncPreferences;
  const writeFile = options.writeFile ?? fs.writeFile.bind(fs);
  const preferences = getPreferences();

  const metadataPath = resolveMetadataPath(preferences);

  // Write an empty/cleared metadata file (or delete it entirely)
  try {
    await writeFile(metadataPath, "", "utf8");
  } catch {
    // If we can't write, the disconnect still "succeeds" — metadata is just stale
  }
}

export async function isTokenValid(
  options: SyncServiceOptions = {},
): Promise<boolean> {
  const getPreferences = options.getPreferences ?? getSyncPreferences;
  const preferences = getPreferences();
  return validateToken({ getPreferences: () => preferences });
}
