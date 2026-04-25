export const BUILTIN_ENTRY_TYPES = ["link", "image", "text", "schema"] as const;

export type BuiltinEntryType = (typeof BUILTIN_ENTRY_TYPES)[number];
export type EntryType = BuiltinEntryType;
export type RuntimeEntryType = string;
export const ENTRY_TYPES: EntryType[] = [...BUILTIN_ENTRY_TYPES];

export function isBuiltinEntryType(value: string): value is BuiltinEntryType {
  return BUILTIN_ENTRY_TYPES.includes(value as BuiltinEntryType);
}

export function coerceBuiltinEntryType(
  value: string | undefined,
  fallback: BuiltinEntryType = "text",
): BuiltinEntryType {
  return value && isBuiltinEntryType(value) ? value : fallback;
}

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
  type: RuntimeEntryType;
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
  schemaCommand?: string;
  schemaArgs?: string;
  body?: string;
}

export interface EntryInput extends NewEntryInput {
  id: string;
}
