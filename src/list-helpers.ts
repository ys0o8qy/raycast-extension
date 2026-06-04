import { Color, Icon } from "@raycast/api";
import { LibraryEntry } from "./types";

// ── Icon ──────────────────────────────────────────────────────────

export function iconForType(
  type: LibraryEntry["type"],
): { source: Icon; tintColor: Color } {
  switch (type) {
    case "link":
      return { source: Icon.Link, tintColor: Color.Blue };
    case "image":
      return { source: Icon.Image, tintColor: Color.Purple };
    case "text":
      return { source: Icon.Document, tintColor: Color.Green };
    case "schema":
      return { source: Icon.Code, tintColor: Color.Orange };
    default:
      return { source: Icon.Document, tintColor: Color.SecondaryText };
  }
}

// ── Subtitle ──────────────────────────────────────────────────────

export function buildSubtitle(entry: LibraryEntry): string {
  const parts: string[] = [entry.type];

  switch (entry.type) {
    case "link": {
      const url = entry.properties.URL || "";
      try {
        parts.push(new URL(url).hostname);
      } catch {
        if (url) parts.push(truncate(url, 40));
      }
      break;
    }
    case "text": {
      const body = entry.body || "";
      if (body) {
        const preview = body.replace(/\n/g, " ").slice(0, 60);
        parts.push(preview + (body.length > 60 ? "…" : ""));
      }
      break;
    }
    case "image": {
      const src = entry.properties.PATH || entry.properties.URL || "";
      const filename = src.split("/").pop() || "";
      if (filename) parts.push(filename);
      break;
    }
    case "schema": {
      const kind = entry.properties.SCHEMA_KIND;
      if (kind) parts.push(kind);
      break;
    }
  }

  return parts.join(" · ");
}

// ── Helpers ───────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "…";
}
