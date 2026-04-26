import { randomUUID } from "node:crypto";
import { normalizeTags } from "../resource";
import { BuiltinSemanticType, EntryInput, NewEntryInput } from "../types";

export interface SerializerRuntimeInfo {
  semanticType: BuiltinSemanticType;
  storageRoot?: string;
}

const ROOT_HEADINGS_BY_SEMANTIC_TYPE: Record<BuiltinSemanticType, string> = {
  "builtin:link": "Links",
  "builtin:asset": "Images",
  "builtin:file": "Files",
  "builtin:directory": "Directories",
  "builtin:text": "Text",
  "builtin:schema": "Schemas",
  "builtin:generic": "Other",
};

function normalizeGroupPath(groupPath: string[]): string[] {
  return groupPath.map((segment) => segment.trim()).filter(Boolean);
}

function buildHeadline(level: number, title: string): string {
  return `${"*".repeat(level)} ${title}`;
}

export function createEntryInput(input: NewEntryInput): EntryInput {
  return {
    ...input,
    id: input.id || randomUUID(),
  };
}

export function buildEntryBlock(input: EntryInput, level: number): string {
  const tags = normalizeTags(input.tags);
  const headlineTags = tags.length > 0 ? ` :${tags.join(":")}:` : "";
  const properties: Array<[string, string | undefined]> = [
    ["ID", input.id],
    ["TYPE", input.type],
    ["URL", input.url],
    ["PATH", input.path],
    ["SCHEMA_KIND", input.schemaKind],
    ["SCHEMA_COMMAND", input.schemaCommand],
    ["SCHEMA_ARGS", input.schemaArgs],
  ];

  const propertyLines = properties
    .filter(([, value]) => Boolean(value && value.trim()))
    .map(([key, value]) => `:${key}: ${value?.trim()}`);

  const body = input.body?.trim() ?? "";

  return [
    buildHeadline(level, `${input.title.trim()}${headlineTags}`),
    ":PROPERTIES:",
    ...propertyLines,
    ":END:",
    ...(body ? [body] : []),
  ].join("\n");
}

export function appendEntryToOrg(
  content: string,
  input: NewEntryInput,
  runtimeInfo?: SerializerRuntimeInfo,
): string {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  const entryInput = createEntryInput(input);
  const serializerRuntimeInfo = runtimeInfo ?? inferRuntimeInfo(entryInput.type);
  const rootHeading = `* ${resolveStorageRoot(serializerRuntimeInfo)}`;
  const groupPath = normalizeGroupPath(input.groupPath);
  const targetHeadingLines = [
    rootHeading,
    ...groupPath.map((segment, index) => buildHeadline(index + 2, segment)),
  ];
  const entryLevel = groupPath.length + 2;
  const entryBlock = buildEntryBlock({ ...entryInput, groupPath }, entryLevel);

  if (!normalized) {
    return [...targetHeadingLines, entryBlock].join("\n") + "\n";
  }

  const lines = normalized.split("\n");

  let rootIndex = lines.findIndex((line) => line.trim() === rootHeading);
  if (rootIndex === -1) {
    const appended =
      normalized.length > 0 ? `${normalized}\n\n${rootHeading}` : rootHeading;
    return appendEntryToOrg(appended, entryInput, serializerRuntimeInfo);
  }

  let insertAfter = rootIndex;

  for (let depth = 0; depth < groupPath.length; depth += 1) {
    const headingLevel = depth + 2;
    const headingLine = buildHeadline(headingLevel, groupPath[depth]);
    let foundIndex = -1;
    let scanIndex = insertAfter + 1;

    while (scanIndex < lines.length) {
      const line = lines[scanIndex];
      const match = line.match(/^(\*+)\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        if (level < headingLevel) {
          break;
        }
        if (level === headingLevel && line.trim() === headingLine) {
          foundIndex = scanIndex;
          break;
        }
      }
      scanIndex += 1;
    }

    if (foundIndex !== -1) {
      insertAfter = foundIndex;
      continue;
    }

    let branchEnd = lines.length;
    for (let index = insertAfter + 1; index < lines.length; index += 1) {
      const match = lines[index].match(/^(\*+)\s+/);
      if (match && match[1].length <= headingLevel - 1) {
        branchEnd = index;
        break;
      }
    }

    lines.splice(branchEnd, 0, "", headingLine);
    insertAfter = branchEnd + 1;
  }

  const minLevelToStop = groupPath.length > 0 ? groupPath.length + 2 : 1;
  let insertIndex = lines.length;
  for (let index = insertAfter + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\*+)\s+/);
    if (match && match[1].length <= minLevelToStop) {
      insertIndex = index;
      break;
    }
  }

  lines.splice(insertIndex, 0, "", entryBlock);
  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

function inferRuntimeInfo(type: string): SerializerRuntimeInfo {
  switch (type) {
    case "link":
      return { semanticType: "builtin:link" };
    case "image":
      return { semanticType: "builtin:asset" };
    case "text":
      return { semanticType: "builtin:text" };
    case "schema":
      return { semanticType: "builtin:schema" };
    default:
      return { semanticType: "builtin:generic" };
  }
}

function resolveStorageRoot(runtimeInfo: SerializerRuntimeInfo): string {
  const explicitRoot = runtimeInfo.storageRoot?.trim();
  if (explicitRoot) {
    return explicitRoot;
  }

  return ROOT_HEADINGS_BY_SEMANTIC_TYPE[runtimeInfo.semanticType];
}
