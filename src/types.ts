export type EntryType = "link" | "image" | "text" | "schema";

export const ENTRY_TYPES: EntryType[] = ["link", "image", "text", "schema"];

export interface OrgNode {
  level: number;
  title: string;
  tags: string[];
  properties: Record<string, string>;
  body: string;
  children: OrgNode[];
  sourceStartLine: number;
  sourceEndLine: number;
}

export interface LibraryEntry {
  id: string;
  title: string;
  type: EntryType;
  tags: string[];
  properties: Record<string, string>;
  body: string;
  groupPath: string[];
  groupLabel: string;
  sourceHeadline: string;
  sourceStartLine: number;
  sourceEndLine: number;
}

export interface NewEntryInput {
  id?: string;
  title: string;
  type: EntryType;
  tags: string[];
  groupPath: string[];
  url?: string;
  path?: string;
  schemaKind?: string;
  body?: string;
}

export interface EntryInput extends NewEntryInput {
  id: string;
}
