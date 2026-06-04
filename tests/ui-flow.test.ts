import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("saving a resource includes pending text from the new tag field", () => {
  const source = read("src/add-entry.tsx");

  assert.match(
    source,
    /normalizeTags\(\[\s*\.\.\.tags,\s*\.\.\.parseNewTagInput\(newTagInput\),?\s*\]\)/,
  );
});
