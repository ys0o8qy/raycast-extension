import { AI, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { normalizeTags } from "./resource";
import { log } from "./logger";

interface TagSuggestionPreferences {
  tagSuggestionModel: string;
}

/** Maximum chars of resource content sent to the AI for tag suggestions. */
const CONTENT_CHAR_LIMIT = 500;

/** Resources per batch when bulk-tagging. */
const BATCH_SIZE = 5;

function getModel(): AI.Model {
  const preferences = getPreferenceValues<TagSuggestionPreferences>();
  const raw = (preferences.tagSuggestionModel || "OpenAI_GPT-5_nano").trim();

  // If it's a known preset key, resolve it through the enum
  if (raw in AI.Model) {
    return AI.Model[raw as keyof typeof AI.Model];
  }

  // Custom model string from BYOK provider — cast directly.
  // At runtime AI.ask() accepts any string; the enum is just a type-level constraint.
  return raw as AI.Model;
}

function showAiUnavailableToast(message: string) {
  showToast({
    style: Toast.Style.Failure,
    title: "Tag suggestion failed",
    message: message.includes("AI is not available")
      ? "Enable Raycast Pro or configure a bring-your-own-key AI provider."
      : message,
  });
}

/**
 * Suggest tags for a single resource (used by add-entry flow).
 */
export async function suggestTags(
  title: string,
  content: string,
  existingTags: string[],
): Promise<string[]> {
  const model = getModel();

  const truncatedContent = content.slice(0, CONTENT_CHAR_LIMIT);
  const tagPool =
    existingTags.length > 0
      ? existingTags.slice(0, 50).join(", ")
      : "(no existing tags yet)";

  const prompt = [
    "You are a resource tagging assistant.",
    "Suggest 3-5 relevant tags for the resource below.",
    "Use existing tags when they fit. Only suggest new tags when necessary.",
    "Tags are lowercase, use hyphens for spaces (e.g., 'machine-learning').",
    "",
    `Existing tags: ${tagPool}`,
    "",
    `Resource title: ${title}`,
    `Resource content: ${truncatedContent}`,
    "",
    "Return ONLY a comma-separated list of tags. No explanations.",
  ].join("\n");

  try {
    const response = await AI.ask(prompt, { model, creativity: "low" });
    return parseTagResponse(response);
  } catch (error) {
    showAiUnavailableToast(
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}

/** Result of one batch call: maps resource index → suggested tags. */
export type BatchResult = Map<number, string[]>;

/**
 * Suggest tags for multiple resources in batches.
 *
 * Groups resources into batches of BATCH_SIZE, sends one AI call per batch,
 * and aggregates results.
 *
 * Logs each batch for traceability.
 */
export async function suggestTagsBatch(
  resources: Array<{ title: string; content: string }>,
  existingTags: string[],
): Promise<BatchResult> {
  const model = getModel();
  const tagPool =
    existingTags.length > 0 ? existingTags.slice(0, 50).join(", ") : "(none)";
  const results: BatchResult = new Map();
  const total = resources.length;

  log("auto-tag", "batch-start", `Processing ${total} resources in batches of ${BATCH_SIZE}`);

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    const batch = resources.slice(offset, offset + BATCH_SIZE);
    const batchNum = Math.floor(offset / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    const resourceLines = batch
      .map(
        (r, i) =>
          `[${offset + i + 1}] title: "${r.title}" | content: "${r.content.slice(0, CONTENT_CHAR_LIMIT)}"`,
      )
      .join("\n");

    const prompt = [
      "You are a resource tagging assistant.",
      "Analyze these resources and suggest 2-4 tags each.",
      "Use existing tags when they fit. Only suggest new tags when necessary.",
      "Tags are lowercase, use hyphens for spaces.",
      "",
      `Existing tags: ${tagPool}`,
      "",
      resourceLines,
      "",
      "Return one line per resource, with the index and comma-separated tags:",
      "1: tag1, tag2, tag3",
      `${offset + 1}: tag1, tag2`,
    ].join("\n");

    log("auto-tag", "ai-call", `Batch ${batchNum}/${totalBatches} (${batch.length} resources)`);

    try {
      const response = await AI.ask(prompt, { model, creativity: "low" });
      const parsed = parseBatchResponse(response, offset);
      for (const [idx, tags] of parsed) {
        results.set(idx, tags);
      }
      log("auto-tag", "ai-done", `Batch ${batchNum}/${totalBatches} done`, {
        resources: batch.length,
        tagsGenerated: parsed.size,
      });
    } catch (error) {
      log("auto-tag", "ai-error", `Batch ${batchNum} failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with other batches; failed ones get empty tags
    }
  }

  log("auto-tag", "batch-done", `All batches complete`, {
    total,
    tagged: results.size,
  });
  return results;
}

/** Suggested merge: replace `from` with `to`. */
export interface TagMergeSuggestion {
  from: string;
  to: string;
  reason: string;
}

/**
 * Analyze suspected tag synonym pairs and return merge suggestions.
 *
 * Pairs are pre-grouped by edit distance to minimize AI calls.
 * Each AI call checks up to 20 pairs.
 */
export async function suggestTagMerges(
  candidatePairs: Array<[string, string]>,
): Promise<TagMergeSuggestion[]> {
  if (candidatePairs.length === 0) return [];

  const model = getModel();
  const results: TagMergeSuggestion[] = [];

  log(
    "tag-governance",
    "merge-start",
    `Checking ${candidatePairs.length} candidate pairs for synonym detection`,
  );

  for (let offset = 0; offset < candidatePairs.length; offset += 20) {
    const batch = candidatePairs.slice(offset, offset + 20);
    const pairLines = batch
      .map(([a, b], i) => `${i + 1}. "${a}" ↔ "${b}"`)
      .join("\n");

    const prompt = [
      "You are a tag governance assistant.",
      "Analyze these tag pairs. For each pair, decide if they are synonyms that should be merged.",
      "A synonym pair has the same meaning (e.g., 'reactjs' ≈ 'react', 'ai' ≈ 'artificial-intelligence').",
      "Return ONLY merge suggestions. One per line, format:",
      '"FROM" → "TO" | reason',
      "Use the shorter or more canonical form as TO.",
      "Skip pairs that are NOT synonyms — do not output them.",
      "",
      pairLines,
    ].join("\n");

    log(
      "tag-governance",
      "merge-ai-call",
      `Checking pairs ${offset + 1}-${Math.min(offset + 20, candidatePairs.length)}`,
    );

    try {
      const response = await AI.ask(prompt, { model, creativity: "medium" });
      const parsed = parseMergeResponse(response);
      results.push(...parsed);
      log("tag-governance", "merge-ai-done", `Found ${parsed.length} merges`, {
        pairsChecked: batch.length,
      });
    } catch (error) {
      log("tag-governance", "merge-ai-error", "Merge detection batch failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log("tag-governance", "merge-done", `Total merges found: ${results.length}`);
  return results;
}

/**
 * Parse batch response format:
 *   1: react, docs, frontend
 *   2: python, docs, programming
 */
function parseBatchResponse(
  response: string,
  baseIndex: number,
): Map<number, string[]> {
  const results = new Map<number, string[]>();
  const lines = response.split("\n");

  for (const line of lines) {
    const match = /^(\d+):\s*(.+)/.exec(line.trim());
    if (!match) continue;

    const rawIndex = Number.parseInt(match[1], 10);
    if (!Number.isFinite(rawIndex)) continue;

    const zeroBased = rawIndex - 1; // Convert from 1-based to 0-based
    const tags = match[2]
      .split(/[,;]+/)
      .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      .filter((t) => t.length > 0 && t.length <= 50);

    results.set(zeroBased, normalizeTags(tags));
  }

  return results;
}

/**
 * Parse merge suggestion response format:
 *   "reactjs" → "react" | same framework
 *   "ml" → "machine-learning" | abbreviation expansion
 */
function parseMergeResponse(response: string): TagMergeSuggestion[] {
  const results: TagMergeSuggestion[] = [];
  const lines = response.split("\n");

  for (const line of lines) {
    const match = /^"([^"]+)"\s*→\s*"([^"]+)"\s*\|\s*(.+)/.exec(line.trim());
    if (!match) continue;

    const from = match[1].trim().toLowerCase();
    const to = match[2].trim().toLowerCase();
    const reason = match[3].trim();

    if (from && to && from !== to) {
      results.push({ from, to, reason });
    }
  }

  return results;
}

/**
 * Parse the single-tag AI response into a clean list of normalized tags.
 */
function parseTagResponse(response: string): string[] {
  const raw = response
    .split("\n")
    .map((line) => line.replace(/^[\s\-*\d.]*/, "").trim())
    .join(",")
    .replace(/#/g, "");

  const tags = raw
    .split(/[,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 50);

  return normalizeTags(tags);
}
