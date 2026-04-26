import { pinyin } from "pinyin-pro";
import {
  BuiltinEntryType,
  BuiltinSemanticType,
  LibraryEntry,
  NewEntryInput,
  ResolvedAction,
} from "./types";

const imagePathPattern = /\.(apng|avif|gif|heic|heif|jpeg|jpg|png|svg|webp)$/i;
const schemePattern = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;

export interface ClipboardResource {
  text?: string;
  file?: string;
}

export interface ParsedSearchQuery {
  tags: string[];
  keywords: string[];
}

export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .replace(/^#+/, "")
    .replace(/^:+|:+$/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(normalizeTag).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b),
  );
}

export function detectResourceType(
  resource: ClipboardResource,
): BuiltinEntryType {
  const value = (resource.file || resource.text || "").trim();

  if (isImagePath(value)) {
    return "image";
  }

  if (/^https?:\/\//i.test(value)) {
    return "link";
  }

  if (schemePattern.test(value)) {
    return "schema";
  }

  return "text";
}

export function selectVisibleTypeIds(typeIds: string[]): string[] {
  return Array.from(
    new Set(
      typeIds
        .map((typeId) => typeId.trim())
        .filter((typeId) => typeId.length > 0 && typeId !== "generic"),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function mapResourceInputToEntryFields(
  semanticType: BuiltinSemanticType,
  resource: string,
): Pick<NewEntryInput, "url" | "path" | "body"> {
  if (semanticType === "builtin:link") {
    return { url: resource };
  }

  if (semanticType === "builtin:asset") {
    return isRemoteResourceUrl(resource)
      ? { url: resource }
      : { path: normalizeLocalResourcePath(resource) };
  }

  if (
    semanticType === "builtin:file" ||
    semanticType === "builtin:directory"
  ) {
    return { path: normalizeLocalResourcePath(resource) };
  }

  return { body: resource };
}

export function isRuntimeTypePersistable(typeId: string): boolean {
  return typeId.trim().length > 0;
}

export function orderResolvedActionsForDisplay(
  actions: ResolvedAction[],
  defaultAction?: ResolvedAction,
  options: { leadingAction?: ResolvedAction } = {},
): ResolvedAction[] {
  const ordered: ResolvedAction[] = [];
  const seenIds = new Set<string>();

  function pushAction(action: ResolvedAction | undefined) {
    if (!action || seenIds.has(action.id)) {
      return;
    }

    seenIds.add(action.id);
    ordered.push(action);
  }

  pushAction(options.leadingAction);
  pushAction(defaultAction);
  actions.forEach(pushAction);

  return ordered;
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const tags: string[] = [];
  const keywords: string[] = [];

  for (const token of query
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    if (token.startsWith("#") && token.length > 1) {
      tags.push(token.slice(1));
      continue;
    }

    keywords.push(token);
  }

  return {
    tags: normalizeTags(tags),
    keywords: keywords.map((keyword) => keyword.toLowerCase()),
  };
}

export function filterEntriesBySearch(
  entries: LibraryEntry[],
  query: string,
): LibraryEntry[] {
  const parsed = parseSearchQuery(query);

  if (parsed.tags.length === 0 && parsed.keywords.length === 0) {
    return entries;
  }

  return entries.filter((entry) => {
    const searchableText = buildSearchableText(entry);

    return (
      entryMatchesTagQueries(entry, parsed.tags) &&
      parsed.keywords.every((keyword) => searchableText.includes(keyword))
    );
  });
}

export function getAllTags(entries: LibraryEntry[]): string[] {
  return normalizeTags(entries.flatMap((entry) => entry.tags));
}

export function tagMatchesSearch(tag: string, searchText: string): boolean {
  const normalizedQuery = normalizeTag(searchText);
  if (!normalizedQuery) {
    return true;
  }

  const normalizedTag = normalizeTag(tag);
  return (
    normalizedTag.includes(normalizedQuery) ||
    buildFirstLetterIndex(normalizedTag).includes(normalizedQuery)
  );
}

export function entryMatchesTagQueries(
  entry: LibraryEntry,
  tagQueries: string[],
): boolean {
  if (tagQueries.length === 0) {
    return true;
  }

  const tags = normalizeTags(entry.tags);
  return tagQueries.every((tagQuery) =>
    tags.some((tag) => tagMatchesSearch(tag, tagQuery)),
  );
}

function isImagePath(value: string): boolean {
  const normalized = normalizeLocalResourcePath(value);
  return imagePathPattern.test(normalized);
}

function isRemoteResourceUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function normalizeLocalResourcePath(value: string): string {
  return value.trim().replace(/^file:\/\//i, "");
}

function buildSearchableText(entry: LibraryEntry): string {
  return buildKeywordSearchIndex([entry.title, entry.body]);
}

function buildKeywordSearchIndex(values: string[]): string {
  const text = values.join(" ").toLowerCase();
  const firstLetters = buildFirstLetterIndex(text);

  return `${text} ${firstLetters}`;
}

function buildFirstLetterIndex(value: string): string {
  return pinyin(value, {
    pattern: "first",
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
  }).join("");
}
