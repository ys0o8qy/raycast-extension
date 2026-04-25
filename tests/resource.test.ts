import test from "node:test";
import assert from "node:assert/strict";
import {
  detectResourceType,
  filterEntriesBySearch,
  normalizeTags,
  parseSearchQuery,
} from "../src/resource";
import { LibraryEntry } from "../src/types";

test("detectResourceType detects links and non-http schemas from clipboard text", () => {
  assert.equal(
    detectResourceType({ text: "https://example.com/docs" }),
    "link",
  );
  assert.equal(detectResourceType({ text: "http://example.com/docs" }), "link");
  assert.equal(
    detectResourceType({ text: "org-protocol://capture?template=l" }),
    "schema",
  );
  assert.equal(detectResourceType({ text: "raycast://extensions" }), "schema");
  assert.equal(
    detectResourceType({ text: "obsidian://open?vault=notes" }),
    "schema",
  );
  assert.equal(detectResourceType({ text: "A useful snippet" }), "text");
});

test("detectResourceType detects common image file paths", () => {
  assert.equal(
    detectResourceType({
      text: "/Users/me/Pictures/diagram.png",
      file: "/Users/me/Pictures/diagram.png",
    }),
    "image",
  );
  assert.equal(
    detectResourceType({ text: "file:///Users/me/Pictures/diagram.webp" }),
    "image",
  );
});

test("normalizeTags strips hash marks and deduplicates values", () => {
  assert.deepEqual(
    normalizeTags(["#Raycast", ":docs:", "raycast", "two words"]),
    ["docs", "raycast", "two-words"],
  );
});

test("parseSearchQuery separates tag filters from keyword filters", () => {
  assert.deepEqual(parseSearchQuery("#docs #raycast keyboard shortcut"), {
    tags: ["docs", "raycast"],
    keywords: ["keyboard", "shortcut"],
  });
});

test("filterEntriesBySearch requires all tags and all keywords to match", () => {
  const entries: LibraryEntry[] = [
    createEntry({
      title: "Raycast Keyboard",
      tags: ["docs", "raycast"],
      body: "Shortcut notes",
    }),
    createEntry({
      title: "Raycast Window",
      tags: ["raycast"],
      body: "Window notes",
    }),
    createEntry({
      title: "Keyboard Maestro",
      tags: ["automation"],
      body: "Macro notes",
    }),
  ];

  assert.deepEqual(
    filterEntriesBySearch(entries, "#docs #raycast keyboard").map(
      (entry) => entry.title,
    ),
    ["Raycast Keyboard"],
  );
});

function createEntry(overrides: Partial<LibraryEntry>): LibraryEntry {
  return {
    id: "entry-1",
    title: "Untitled",
    type: "text",
    tags: [],
    properties: {},
    body: "",
    groupPath: [],
    groupLabel: "Ungrouped",
    sourceHeadline: "** Untitled",
    sourceStartLine: 0,
    sourceEndLine: 1,
    ...overrides,
  };
}
