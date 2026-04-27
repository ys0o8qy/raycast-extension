import test from "node:test";
import assert from "node:assert/strict";
import {
  parseLaunchContextTags,
  resolveAddEntryLaunchContext,
} from "../src/launch-context";
import { buildRuntimeRegistry } from "../src/runtime";

const REGISTRY = buildRuntimeRegistry({
  version: 1,
  actions: {},
  types: {},
});

test("returns undefined when there is no usable content", () => {
  assert.equal(resolveAddEntryLaunchContext(undefined, REGISTRY), undefined);
  assert.equal(resolveAddEntryLaunchContext({}, REGISTRY), undefined);
  assert.equal(
    resolveAddEntryLaunchContext({ content: "" }, REGISTRY),
    undefined,
  );
  assert.equal(
    resolveAddEntryLaunchContext({ content: "   " }, REGISTRY),
    undefined,
  );
  assert.equal(
    resolveAddEntryLaunchContext({ content: 123 }, REGISTRY),
    undefined,
  );
});

test("uses the provided type when it is a visible runtime type id", () => {
  const resolved = resolveAddEntryLaunchContext(
    { content: "Hello", type: "text", title: "Note" },
    REGISTRY,
  );
  assert.deepEqual(resolved, {
    title: "Note",
    type: "text",
    resource: "Hello",
    tags: [],
    autoSave: false,
  });
});

test("falls back to detected type when the requested type is unknown", () => {
  const resolved = resolveAddEntryLaunchContext(
    { content: "https://example.com", type: "bogus" },
    REGISTRY,
  );
  assert.equal(resolved?.type, "link");
});

test("falls back to detected type when type is missing", () => {
  const resolved = resolveAddEntryLaunchContext(
    { content: "raycast://extensions/test" },
    REGISTRY,
  );
  assert.equal(resolved?.type, "schema");
});

test("autoSave is only true when the caller passes the boolean true", () => {
  assert.equal(
    resolveAddEntryLaunchContext(
      { content: "x", autoSave: true },
      REGISTRY,
    )?.autoSave,
    true,
  );
  assert.equal(
    resolveAddEntryLaunchContext(
      { content: "x", autoSave: "true" },
      REGISTRY,
    )?.autoSave,
    false,
  );
  assert.equal(
    resolveAddEntryLaunchContext({ content: "x" }, REGISTRY)?.autoSave,
    false,
  );
});

test("non-string title and content are coerced to safe defaults", () => {
  const resolved = resolveAddEntryLaunchContext(
    { content: "value", title: 42 },
    REGISTRY,
  );
  assert.equal(resolved?.title, "");
});

test("parseLaunchContextTags accepts arrays, dedupes and normalizes them", () => {
  assert.deepEqual(
    parseLaunchContextTags(["#Docs", "docs", " Raycast ", ""]),
    ["docs", "raycast"],
  );
});

test("parseLaunchContextTags accepts comma- and whitespace-separated strings", () => {
  assert.deepEqual(parseLaunchContextTags("docs, raycast notes"), [
    "docs",
    "notes",
    "raycast",
  ]);
  assert.deepEqual(parseLaunchContextTags(""), []);
});

test("parseLaunchContextTags ignores non-string array entries and unknown shapes", () => {
  assert.deepEqual(parseLaunchContextTags(["docs", 7, null, "raycast"]), [
    "docs",
    "raycast",
  ]);
  assert.deepEqual(parseLaunchContextTags(undefined), []);
  assert.deepEqual(parseLaunchContextTags({ tag: "x" }), []);
});

test("tags from the launch context are surfaced on the resolved value", () => {
  const resolved = resolveAddEntryLaunchContext(
    {
      content: "https://example.com",
      tags: ["docs", "Raycast"],
    },
    REGISTRY,
  );
  assert.deepEqual(resolved?.tags, ["docs", "raycast"]);
});
