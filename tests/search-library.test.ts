import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderEntryMarkdown } from "../src/preview-markdown";
import { LibraryEntry } from "../src/types";

test("search result rows keep tags out of the compact title area", () => {
  const source = readFileSync(join(process.cwd(), "src/search-library.tsx"), "utf8");

  assert.doesNotMatch(source, /buildTagAccessories/);
  assert.doesNotMatch(source, /accessories=\{/);
  assert.doesNotMatch(source, /subtitle=\{buildSubtitle\(entry\)\}/);
});

test("entry preview uses compact title and useful link content", () => {
  const markdown = renderEntryMarkdown({
    ...baseEntry,
    title: "deepseek usage",
    type: "link",
    properties: {
      URL: "https://platform.deepseek.com/usage",
    },
    body: "",
  });

  assert.match(markdown, /^## deepseek usage\n/);
  assert.match(markdown, /\[https:\/\/platform\.deepseek\.com\/usage\]\(https:\/\/platform\.deepseek\.com\/usage\)/);
  assert.doesNotMatch(markdown, /^# deepseek usage\n/);
});

const baseEntry: LibraryEntry = {
  id: "entry-1",
  title: "Resource",
  type: "link",
  tags: ["ai", "deepseek"],
  properties: {},
  body: "",
  groupPath: [],
  groupLabel: "",
  sourceHeadline: "",
  sourceStartLine: 1,
  sourceEndLine: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
