import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("search result rows do not render tags as list accessories", () => {
  const source = readFileSync(join(process.cwd(), "src/search-library.tsx"), "utf8");

  assert.doesNotMatch(source, /accessories=\{buildSearchAccessories\(entry\)\}/);
  assert.doesNotMatch(source, /function buildSearchAccessories/);
});
