import { getPreferenceValues } from "@raycast/api";
import { promises as fs } from "node:fs";
import { appendEntryToOrg } from "./org/serializer";
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
  return extractLibraryEntries(parseOrg(content));
}

export async function loadRuntimeRegistry() {
  const config = await loadResourceLibraryConfig();
  return buildRuntimeRegistry(config);
}

export async function saveEntry(input: NewEntryInput): Promise<void> {
  const path = getOrgFilePath();
  const runtimeRegistry = await loadRuntimeRegistry();
  let existingContent = "";

  try {
    existingContent = await fs.readFile(path, "utf8");
  } catch {
    // If the file does not exist yet, write a new normalized Org document.
  }

  const updated = appendEntryToOrg(
    existingContent,
    input,
    resolveRuntimeStorageInfo(runtimeRegistry, input.type),
  );
  await fs.writeFile(path, updated, "utf8");
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
  const updated = appendEntryToOrg(
    withoutEntry,
    {
      ...input,
      id,
      groupPath: [],
    },
    resolveRuntimeStorageInfo(runtimeRegistry, input.type),
  );
  await fs.writeFile(path, updated, "utf8");
}
