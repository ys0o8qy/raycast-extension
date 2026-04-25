import test from "node:test";
import assert from "node:assert/strict";
import { extractLibraryEntries, parseOrg } from "../src/org/parser";

test("extractLibraryEntries retains unknown runtime entry types", () => {
  const entries = extractLibraryEntries(
    parseOrg(`
* Text
** Custom Snippet
:PROPERTIES:
:ID: snippet-1
:TYPE: snippet
:END:
console.log("hello");
`),
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "snippet-1");
  assert.equal(entries[0].type, "snippet");
  assert.equal(entries[0].title, "Custom Snippet");
  assert.equal(entries[0].body, 'console.log("hello");');
});

test("extractLibraryEntries normalizes legacy bookmark entries to link", () => {
  const entries = extractLibraryEntries(
    parseOrg(`
* Links
** Legacy Bookmark
:PROPERTIES:
:ID: bookmark-1
:TYPE: bookmark
:URL: https://example.com
:END:
`),
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "bookmark-1");
  assert.equal(entries[0].type, "link");
});
