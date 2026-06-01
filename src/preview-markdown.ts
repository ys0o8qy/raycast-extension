import { LibraryEntry } from "./types";

const PREVIEW_BODY_LIMIT = 2400;

function codeFence(language: string, value: string): string {
  return `\n\n\`\`\`${language}\n${escapeCodeFence(value)}\n\`\`\``;
}

function escapeCodeFence(value: string): string {
  return value.replace(/```/g, "'''");
}

function previewBody(value: string): string {
  if (value.length <= PREVIEW_BODY_LIMIT) {
    return value;
  }

  return `${value.slice(0, PREVIEW_BODY_LIMIT).trimEnd()}\n\n... Content truncated for preview.`;
}

function compactTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function imageMarkdown(entry: LibraryEntry): string[] {
  const localPath = entry.properties.PATH;
  const url = entry.properties.URL;

  if (localPath) {
    return ["", `![${entry.title}](${localPath})`];
  }

  if (url) {
    return ["", `![${entry.title}](${url})`];
  }

  return [];
}

export function renderEntryMarkdown(entry: LibraryEntry): string {
  const lines = [`## ${compactTitle(entry.title)}`];

  const schemaKind = entry.properties.SCHEMA_KIND;
  const url = entry.properties.URL;

  switch (entry.type) {
    case "link":
      if (url) {
        lines.push("", `[${url}](${url})`);
      }
      if (entry.body) {
        lines.push("", previewBody(entry.body));
      }
      break;
    case "image":
      lines.push(...imageMarkdown(entry));
      if (entry.body) {
        lines.push("", previewBody(entry.body));
      }
      break;
    case "text":
      if (entry.body) {
        lines.push("", codeFence("text", previewBody(entry.body)));
      }
      break;
    case "schema":
      if (entry.body) {
        lines.push("", codeFence(schemaKind || "json", previewBody(entry.body)));
      }
      break;
    default:
      if (entry.body) {
        lines.push("", previewBody(entry.body));
      }
      break;
  }

  return lines.join("\n");
}
