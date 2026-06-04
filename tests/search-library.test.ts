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

test("compact resource rows outside search do not render tag accessories", () => {
  const sources = [
    "src/browse-tags.tsx",
    "src/search-projects.tsx",
    "src/auto-tag-resources.tsx",
  ].map((path) => readFileSync(join(process.cwd(), path), "utf8"));

  for (const source of sources) {
    assert.doesNotMatch(source, /buildTagAccessories/);
    assert.doesNotMatch(source, /accessories=\{buildTagAccessories\(entry\.tags\)\}/);
  }
});

test("tag accessory helper is not available for compact resource rows", () => {
  const source = readFileSync(join(process.cwd(), "src/list-helpers.ts"), "utf8");

  assert.doesNotMatch(source, /function buildTagAccessories/);
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
