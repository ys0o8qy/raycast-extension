import { createHash } from "node:crypto";
import { BUILTIN_ENTRY_TYPES, BuiltinEntryType, LibraryEntry, OrgNode } from "../types";

const headlinePattern = /^(\*+)\s+(.*)$/;
const propertyPattern = /^:([A-Za-z0-9_@#%:-]+):\s*(.*)$/;
const headlineTagsPattern = /\s+(:[A-Za-z0-9_@#%:.-]+:)\s*$/;

function parseHeadline(raw: string): { title: string; tags: string[] } {
  const tagMatch = raw.match(headlineTagsPattern);
  if (!tagMatch) {
    return { title: raw.trim(), tags: [] };
  }

  const tagString = tagMatch[1];
  const tags = tagString
    .split(":")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    title: raw.slice(0, raw.length - tagMatch[0].length).trim(),
    tags,
  };
}

export function parseOrg(content: string): OrgNode[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const roots: OrgNode[] = [];
  const stack: OrgNode[] = [];

  let currentNode: OrgNode | undefined;
  let inProperties = false;
  let bodyLines: string[] = [];

  const finalizeBody = () => {
    if (currentNode) {
      currentNode.body = bodyLines.join("\n").trim();
    }
    bodyLines = [];
  };

  const closeNodesAtOrAbove = (level: number, endLine: number) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      const node = stack.pop();
      if (node) {
        node.sourceEndLine = endLine;
      }
    }
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const headlineMatch = line.match(headlinePattern);
    if (headlineMatch) {
      finalizeBody();
      inProperties = false;

      const level = headlineMatch[1].length;
      const { title, tags } = parseHeadline(headlineMatch[2]);
      const node: OrgNode = {
        level,
        title,
        tags,
        properties: {},
        body: "",
        children: [],
        sourceStartLine: lineIndex,
        sourceEndLine: lines.length,
      };

      closeNodesAtOrAbove(level, lineIndex);

      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }

      stack.push(node);
      currentNode = node;
      continue;
    }

    if (!currentNode) {
      continue;
    }

    if (line.trim() === ":PROPERTIES:") {
      inProperties = true;
      continue;
    }

    if (line.trim() === ":END:") {
      inProperties = false;
      continue;
    }

    if (inProperties) {
      const propertyMatch = line.match(propertyPattern);
      if (propertyMatch) {
        currentNode.properties[propertyMatch[1].toUpperCase()] =
          propertyMatch[2].trim();
      }
      continue;
    }

    bodyLines.push(line);
  }

  finalizeBody();
  closeNodesAtOrAbove(1, lines.length);
  return roots;
}

function normalizeEntryType(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();

  if (normalized === "bookmark") {
    return "link";
  }

  return BUILTIN_ENTRY_TYPES.includes(normalized as BuiltinEntryType)
    ? (normalized as BuiltinEntryType)
    : normalized;
}

function normalizeProperties(
  properties: Record<string, string>,
): Record<string, string> {
  const normalized = { ...properties };
  delete normalized.DESCRIPTION;
  if (!normalized.SCHEMA_KIND && normalized.FORMAT) {
    normalized.SCHEMA_KIND = normalized.FORMAT;
  }
  return normalized;
}

function nodeToEntry(
  node: OrgNode,
  ancestors: OrgNode[],
): LibraryEntry | undefined {
  const typeValue = normalizeEntryType(node.properties.TYPE);
  if (!typeValue) {
    return undefined;
  }

  const properties = normalizeProperties(node.properties);
  const groupPath = ancestors.slice(1).map((ancestor) => ancestor.title);
  const idSource = [
    typeValue,
    ...groupPath,
    node.title,
    node.body,
    JSON.stringify(properties),
  ].join("|");
  const id =
    properties.ID ||
    createHash("sha1").update(idSource).digest("hex").slice(0, 12);

  return {
    id,
    title: node.title,
    type: typeValue,
    tags: node.tags,
    properties,
    body: node.body,
    groupPath,
    groupLabel: groupPath.length > 0 ? groupPath.join(" / ") : "Ungrouped",
    sourceHeadline: `${"*".repeat(node.level)} ${node.title}`,
    sourceStartLine: node.sourceStartLine,
    sourceEndLine: node.sourceEndLine,
  };
}

export function extractLibraryEntries(
  nodes: OrgNode[],
  ancestors: OrgNode[] = [],
): LibraryEntry[] {
  const entries: LibraryEntry[] = [];

  for (const node of nodes) {
    const entry = nodeToEntry(node, ancestors);
    if (entry) {
      entries.push(entry);
    }

    entries.push(...extractLibraryEntries(node.children, [...ancestors, node]));
  }

  return entries;
}
