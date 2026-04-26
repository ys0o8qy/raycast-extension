export const BUILTIN_ENTRY_TYPES = ["link", "image", "text", "schema"] as const;
export const BUILTIN_SEMANTIC_TYPES = [
  "builtin:link",
  "builtin:asset",
  "builtin:text",
  "builtin:file",
  "builtin:directory",
  "builtin:schema",
  "builtin:generic",
] as const;
export const BUILTIN_ACTION_IDS = [
  "open-in-browser",
  "open-path",
  "copy-to-clipboard",
  "paste-to-frontmost-app",
  "show-detail",
] as const;

export type BuiltinEntryType = (typeof BUILTIN_ENTRY_TYPES)[number];
export type EntryType = BuiltinEntryType;
export type RuntimeEntryType = string;
export type BuiltinSemanticType = (typeof BUILTIN_SEMANTIC_TYPES)[number];
export type BuiltinActionId = (typeof BUILTIN_ACTION_IDS)[number];
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

export interface ActionDefinition {
  title: string;
  mode: "builtin" | "command";
  requires?: string[];
  builtin?: BuiltinActionId;
  value?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  stdin?: string;
}

export interface ResolvedBuiltinAction {
  id: string;
  title: string;
  mode: "builtin";
  builtin: BuiltinActionId;
  value?: string;
}

export interface ResolvedCommandAction {
  id: string;
  title: string;
  mode: "command";
  command: string;
  args: string[];
  env: Record<string, string>;
  stdin?: string;
}

export type ResolvedAction = ResolvedBuiltinAction | ResolvedCommandAction;

export interface TypeDefinition {
  extends: BuiltinSemanticType;
  storageRoot?: string;
  defaultAction?: string;
  actions: string[];
}

export interface ResourceLibraryConfig {
  version: 1;
  actions: Record<string, ActionDefinition>;
  types: Record<string, TypeDefinition>;
}

export interface RuntimeRegistry {
  actions: Map<string, ActionDefinition>;
  types: Map<string, TypeDefinition>;
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
