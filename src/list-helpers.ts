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

// ── Compact Row Subtitle ─────────────────────────────────────────

export function buildCompactResourceSubtitle(
  entry: LibraryEntry,
): string | undefined {
  switch (entry.type) {
    case "link": {
      const url = entry.properties.URL || "";
      try {
        return new URL(url).hostname;
      } catch {
        return url ? truncate(url, 48) : undefined;
      }
    }
    case "text": {
      const body = entry.body.replace(/\s+/g, " ").trim();
      return body ? truncate(body, 64) : undefined;
    }
    case "image": {
      const src = entry.properties.PATH || entry.properties.URL || "";
      return src.split("/").pop() || undefined;
    }
    case "schema":
      return entry.properties.SCHEMA_KIND || undefined;
    default: {
      const body = entry.body.replace(/\s+/g, " ").trim();
      return body ? truncate(body, 64) : undefined;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + "…";
}
