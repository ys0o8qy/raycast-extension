import { Detail } from "@raycast/api";
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
  const lines = [`# ${entry.title}`];

  const schemaKind = entry.properties.SCHEMA_KIND;

  switch (entry.type) {
    case "link":
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
        lines.push("", "## Text", codeFence("text", previewBody(entry.body)));
      }
      break;
    case "schema":
      if (entry.body) {
        lines.push(
          "",
          "## Schema",
          codeFence(schemaKind || "json", previewBody(entry.body)),
        );
      }
      break;
  }

  return lines.join("\n");
}

export function EntryDetail(props: { entry: LibraryEntry }) {
  return <Detail markdown={renderEntryMarkdown(props.entry)} />;
}
