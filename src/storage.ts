import { getPreferenceValues } from "@raycast/api";
import { promises as fs } from "node:fs";
import { appendEntryToOrg, createEntryInput } from "./org/serializer";
import { parseOrg, extractLibraryEntries } from "./org/parser";
import { loadResourceLibraryConfig } from "./config";
import {
  assertRuntimeTypeAvailableForUpdate,
  buildRuntimeRegistry,
  resolveRuntimeStorageInfo,
} from "./runtime";
import { LibraryEntry, NewEntryInput } from "./types";

interface Preferences {
  orgFilePath: string;
}

export function getOrgFilePath(): string {
  const preferences = getPreferenceValues<Preferences>();
  return preferences.orgFilePath;
}

export async function readOrgFile(): Promise<string> {
  const path = getOrgFilePath();
  return fs.readFile(path, "utf8");
}

export async function loadEntries(): Promise<LibraryEntry[]> {
  const content = await readOrgFile();
  const entries = extractLibraryEntries(parseOrg(content));
  // Sort newest-first by updatedAt timestamp
  return entries.sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function loadRuntimeRegistry() {
  const config = await loadResourceLibraryConfig();
  return buildRuntimeRegistry(config);
}

export async function saveEntry(input: NewEntryInput): Promise<string> {
  const path = getOrgFilePath();
  const runtimeRegistry = await loadRuntimeRegistry();
  let existingContent = "";
  const now = new Date().toISOString();

  try {
    existingContent = await fs.readFile(path, "utf8");
  } catch {
    // If the file does not exist yet, write a new normalized Org document.
  }

  const entryInput = createEntryInput({
    ...input,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  });
  const updated = appendEntryToOrg(
    existingContent,
    entryInput,
    resolveRuntimeStorageInfo(runtimeRegistry, entryInput.type),
  );
  await fs.writeFile(path, updated, "utf8");
  return entryInput.id;
}

export async function updateEntry(
  id: string,
  input: NewEntryInput,
): Promise<void> {
  const path = getOrgFilePath();
  const runtimeRegistry = await loadRuntimeRegistry();
  const existingContent = await fs.readFile(path, "utf8");
  const entries = extractLibraryEntries(parseOrg(existingContent));
  const entry = entries.find((candidate) => candidate.id === id);

  if (!entry) {
    throw new Error(`Could not find entry ${id}`);
  }

  assertRuntimeTypeAvailableForUpdate(runtimeRegistry, entry.type);

  const lines = existingContent.replace(/\r\n/g, "\n").split("\n");
  lines.splice(
    entry.sourceStartLine,
    entry.sourceEndLine - entry.sourceStartLine,
  );

  const withoutEntry = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  const now = new Date().toISOString();
  const updated = appendEntryToOrg(
    withoutEntry,
    {
      ...input,
      id,
      groupPath: [],
      createdAt: entry.createdAt,
      updatedAt: now,
    },
    resolveRuntimeStorageInfo(runtimeRegistry, input.type),
  );
  await fs.writeFile(path, updated, "utf8");
}
