import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("compact resource rows use the shared subtitle helper", () => {
  const helpers = read("src/list-helpers.ts");
  const rowSources = [
    "src/search-library.tsx",
    "src/browse-tags.tsx",
    "src/search-projects.tsx",
    "src/auto-tag-resources.tsx",
  ].map(read);

  assert.match(helpers, /function buildCompactResourceSubtitle/);
  assert.doesNotMatch(helpers, /function buildSubtitle/);
  for (const source of rowSources) {
    assert.doesNotMatch(source, /buildSubtitle/);
  }
});

test("resource detail metadata is shared across resource views", () => {
  const detail = read("src/resource-detail.tsx");
  const resourceViews = [
    "src/search-library.tsx",
    "src/browse-tags.tsx",
    "src/search-projects.tsx",
    "src/auto-tag-resources.tsx",
  ].map(read);

  assert.match(detail, /function ResourceDetail/);
  assert.match(detail, /title="Projects"/);
  assert.match(detail, /title="Tags"/);
  assert.match(detail, /title="Type"/);
  assert.match(detail, /title="URL"/);
  for (const source of resourceViews) {
    assert.match(source, /<ResourceDetail/);
    assert.doesNotMatch(source, /<List\.Item\.Detail markdown=\{renderEntryMarkdown\(entry\)\}/);
  }
});

test("primary empty states expose recovery actions", () => {
  const search = read("src/search-library.tsx");
  const browseTags = read("src/browse-tags.tsx");
  const projects = read("src/search-projects.tsx");

  assert.match(search, /No resources yet/);
  assert.match(search, /title="Add Resource"/);
  assert.match(search, /<ResourceFormFlow/);
  assert.match(browseTags, /title="Auto-Tag Resources"/);
  assert.match(browseTags, /title="Tag Governance"/);
  assert.match(projects, /function buildProjectSubtitle/);
});

test("auto-tag selection supports bulk queue actions", () => {
  const source = read("src/auto-tag-resources.tsx");

  assert.match(source, /Add All Untagged/);
  assert.match(source, /Add Lightly Tagged/);
});

test("README documents the updated interaction model", () => {
  const readme = read("README.md");

  assert.match(readme, /## Interaction Model/);
  assert.match(readme, /Compact resource rows/);
  assert.match(readme, /Tag Center/);
  assert.match(readme, /Project Collections/);
});
