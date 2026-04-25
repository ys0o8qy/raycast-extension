import { EntryType, NewEntryInput } from "../types";

const ROOT_HEADINGS: Record<EntryType, string> = {
  bookmark: "Bookmarks",
  image: "Images",
  text: "Text",
  schema: "Schemas",
};

function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.replace(/^:+|:+$/g, "").replace(/\s+/g, "-")),
    ),
  ).sort();
}

function normalizeGroupPath(groupPath: string[]): string[] {
  return groupPath.map((segment) => segment.trim()).filter(Boolean);
}

function buildHeadline(level: number, title: string): string {
  return `${"*".repeat(level)} ${title}`;
}

function buildEntryBlock(input: NewEntryInput, level: number): string {
  const tags = normalizeTags(input.tags);
  const headlineTags = tags.length > 0 ? ` :${tags.join(":")}:` : "";
  const properties: Array<[string, string | undefined]> = [
    ["TYPE", input.type],
    ["URL", input.url],
    ["PATH", input.path],
    ["DESCRIPTION", input.description],
    ["SCHEMA_KIND", input.schemaKind],
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

export function appendEntryToOrg(content: string, input: NewEntryInput): string {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  const rootHeading = `* ${ROOT_HEADINGS[input.type]}`;
  const groupPath = normalizeGroupPath(input.groupPath);
  const targetHeadingLines = [rootHeading, ...groupPath.map((segment, index) => buildHeadline(index + 2, segment))];
  const entryLevel = groupPath.length + 2;
  const entryBlock = buildEntryBlock({ ...input, groupPath }, entryLevel);

  if (!normalized) {
    return [...targetHeadingLines, entryBlock].join("\n") + "\n";
  }

  const lines = normalized.split("\n");

  let rootIndex = lines.findIndex((line) => line.trim() === rootHeading);
  if (rootIndex === -1) {
    const appended = normalized.length > 0 ? `${normalized}\n\n${rootHeading}` : rootHeading;
    return appendEntryToOrg(appended, input);
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
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}
