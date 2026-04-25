export type EntryType = "bookmark" | "image" | "text" | "schema";

export const ENTRY_TYPES: EntryType[] = ["bookmark", "image", "text", "schema"];

export interface OrgNode {
  level: number;
  title: string;
  tags: string[];
  properties: Record<string, string>;
  body: string;
  children: OrgNode[];
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
}

export interface NewEntryInput {
  title: string;
  type: EntryType;
  tags: string[];
  groupPath: string[];
  url?: string;
  path?: string;
  description?: string;
  schemaKind?: string;
  body?: string;
}
