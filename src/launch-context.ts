import { detectResourceType, normalizeTags, selectVisibleTypeIds } from "./resource";
import { getRuntimeTypeIds } from "./runtime";
import { RuntimeRegistry } from "./types";

/**
 * Raw shape accepted from a Raycast deeplink `launchContext`.
 *
 * Example deeplink:
 *   raycast://extensions/<author>/<extension>/add-entry?context=%7B%22content%22%3A%22https%3A%2F%2Fexample.com%22%2C%22type%22%3A%22link%22%2C%22autoSave%22%3Atrue%7D
 *
 * All fields are optional; we validate at runtime because the value originates
 * from an untrusted external caller.
 */
export interface AddEntryLaunchContext {
  content?: unknown;
  title?: unknown;
  type?: unknown;
  tags?: unknown;
  autoSave?: unknown;
}

export interface ResolvedAddEntryLaunchContext {
  title: string;
  type: string;
  resource: string;
  tags: string[];
  autoSave: boolean;
}

/**
 * Normalize a deeplink launch context into a value the add-entry flow can use.
 *
 * - Returns `undefined` when there is no usable resource content; callers
 *   should treat that as "no prefill" and fall back to the regular UI.
 * - Falls back to {@link detectResourceType} when `type` is missing or not a
 *   known visible runtime type id.
 */
export function resolveAddEntryLaunchContext(
  context: AddEntryLaunchContext | undefined,
  runtimeRegistry: RuntimeRegistry,
): ResolvedAddEntryLaunchContext | undefined {
  if (!context || typeof context !== "object") {
    return undefined;
  }

  const resource = readString(context.content);
  if (!resource.trim()) {
    return undefined;
  }

  const visibleTypeIds = selectVisibleTypeIds(getRuntimeTypeIds(runtimeRegistry));
  const requestedType = readString(context.type).trim();
  const detectedType = detectResourceType({ text: resource });
  const type =
    requestedType && visibleTypeIds.includes(requestedType)
      ? requestedType
      : visibleTypeIds.includes(detectedType)
        ? detectedType
        : visibleTypeIds[0] ?? detectedType;

  return {
    title: readString(context.title),
    type,
    resource,
    tags: parseLaunchContextTags(context.tags),
    autoSave: context.autoSave === true,
  };
}

/**
 * Accepts either an array of strings or a single string with comma/whitespace
 * separators. Returns a normalized, deduplicated tag list.
 */
export function parseLaunchContextTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeTags(value.filter((item): item is string => typeof item === "string"));
  }

  if (typeof value === "string") {
    return normalizeTags(value.split(/[,\s]+/));
  }

  return [];
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
