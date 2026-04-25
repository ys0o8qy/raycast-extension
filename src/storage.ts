import { getPreferenceValues } from "@raycast/api";
import { promises as fs } from "node:fs";
import { appendEntryToOrg } from "./org/serializer";
import { parseOrg, extractLibraryEntries } from "./org/parser";
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

export async function saveEntry(input: NewEntryInput): Promise<void> {
  const path = getOrgFilePath();
  let existingContent = "";

  try {
    existingContent = await fs.readFile(path, "utf8");
  } catch {
    // If the file does not exist yet, write a new normalized Org document.
  }

  const updated = appendEntryToOrg(existingContent, input);
  await fs.writeFile(path, updated, "utf8");
}
