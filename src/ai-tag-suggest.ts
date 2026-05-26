import { AI, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { normalizeTags } from "./resource";

interface TagSuggestionPreferences {
  tagSuggestionModel: string;
}

/** Maximum chars of resource content sent to the AI for tag suggestions. */
const CONTENT_CHAR_LIMIT = 500;

/**
 * Suggest tags for a resource using the Raycast AI API.
 *
 * Builds a prompt with the resource's title/content and existing tag pool,
 * calls `AI.ask()`, and parses the response into a normalized tag list.
 *
 * Returns an empty array on failure (toast already shown).
 */
export async function suggestTags(
  title: string,
  content: string,
  existingTags: string[],
): Promise<string[]> {
  const preferences = getPreferenceValues<TagSuggestionPreferences>();
  const modelKey =
    (preferences.tagSuggestionModel as keyof typeof AI.Model) ||
    "OpenAI_GPT-5_nano";
  const model = AI.Model[modelKey];

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
    const response = await AI.ask(prompt, {
      model,
      creativity: "low",
    });

    return parseTagResponse(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    await showToast({
      style: Toast.Style.Failure,
      title: "Tag suggestion failed",
      message:
        message.includes("AI is not available")
          ? "Enable Raycast Pro or configure a bring-your-own-key AI provider."
          : message,
    });

    return [];
  }
}

/**
 * Parse the AI response into a clean list of normalized tags.
 *
 * Handles common AI response formats:
 * - "tag1, tag2, tag3"
 * - "#tag1 #tag2 #tag3"
 * - "- tag1\n- tag2\n- tag3"
 * - "1. tag1\n2. tag2"
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
