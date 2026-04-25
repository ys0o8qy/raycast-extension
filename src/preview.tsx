import { Detail } from "@raycast/api";
import { LibraryEntry } from "./types";

function codeFence(language: string, value: string): string {
  return `\n\n\`\`\`${language}\n${value}\n\`\`\``;
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
  const lines = [
    `# ${entry.title}`,
    `- **Type:** ${entry.type}`,
    `- **Tags:** ${entry.tags.length ? entry.tags.join(", ") : "—"}`,
  ];

  const url = entry.properties.URL;
  const localPath = entry.properties.PATH;
  const schemaKind = entry.properties.SCHEMA_KIND;

  if (url) {
    lines.push(`- **URL:** ${url}`);
  }
  if (localPath) {
    lines.push(`- **Path:** ${localPath}`);
  }
  if (schemaKind) {
    lines.push(`- **Schema Kind:** ${schemaKind}`);
  }

  switch (entry.type) {
    case "link":
      if (entry.body) {
        lines.push("", entry.body);
      }
      break;
    case "image":
      lines.push(...imageMarkdown(entry));
      if (entry.body) {
        lines.push("", entry.body);
      }
      break;
    case "text":
      if (entry.body) {
        lines.push("", "## Text", codeFence("text", entry.body));
      }
      break;
    case "schema":
      if (entry.body) {
        lines.push(
          "",
          "## Schema",
          codeFence(schemaKind || "json", entry.body),
        );
      }
      break;
  }

  return lines.join("\n");
}

export function EntryDetail(props: { entry: LibraryEntry }) {
  return <Detail markdown={renderEntryMarkdown(props.entry)} />;
}
