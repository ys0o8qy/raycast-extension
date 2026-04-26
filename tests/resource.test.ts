import test from "node:test";
import assert from "node:assert/strict";
import {
  detectResourceType,
  filterEntriesBySearch,
  isRuntimeTypePersistable,
  mapResourceInputToEntryFields,
  normalizeTags,
  orderResolvedActionsForDisplay,
  parseSearchQuery,
  selectVisibleTypeIds,
  tagMatchesSearch,
} from "../src/resource";
import {
  coerceBuiltinEntryType,
  LibraryEntry,
  ResolvedAction,
} from "../src/types";

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

test("coerceBuiltinEntryType preserves built-ins and falls back for unknown runtime types", () => {
  assert.equal(coerceBuiltinEntryType("schema", "text"), "schema");
  assert.equal(coerceBuiltinEntryType("snippet", "text"), "text");
  assert.equal(coerceBuiltinEntryType(undefined, "link"), "link");
});

test("selectVisibleTypeIds includes built-in and config-defined types", () => {
  assert.deepEqual(
    selectVisibleTypeIds([
      "link",
      "image",
      "text",
      "schema",
      "snippet",
      "generic",
    ]),
    ["image", "link", "schema", "snippet", "text"],
  );
});

test("mapResourceInputToEntryFields maps resource content by semantic base", () => {
  assert.deepEqual(
    mapResourceInputToEntryFields("builtin:file", "/tmp/demo.txt"),
    { path: "/tmp/demo.txt" },
  );
  assert.deepEqual(
    mapResourceInputToEntryFields("builtin:asset", "file:///tmp/demo.png"),
    { path: "/tmp/demo.png" },
  );
  assert.deepEqual(
    mapResourceInputToEntryFields("builtin:asset", "https://example.com/demo.png"),
    { url: "https://example.com/demo.png" },
  );
  assert.deepEqual(
    mapResourceInputToEntryFields("builtin:link", "https://example.com"),
    { url: "https://example.com" },
  );
  assert.deepEqual(
    mapResourceInputToEntryFields("builtin:text", "body text"),
    { body: "body text" },
  );
});

test("isRuntimeTypePersistable allows custom runtime types once serializer routing is available", () => {
  assert.equal(isRuntimeTypePersistable("link"), true);
  assert.equal(isRuntimeTypePersistable("image"), true);
  assert.equal(isRuntimeTypePersistable("schema"), true);
  assert.equal(isRuntimeTypePersistable("snippet"), true);
  assert.equal(isRuntimeTypePersistable("directory"), true);
});

test("orderResolvedActionsForDisplay promotes the default action and preserves the rest", () => {
  const actions: ResolvedAction[] = [
    {
      id: "copy-body",
      title: "Copy Body",
      mode: "builtin",
      builtin: "copy-to-clipboard",
      value: "body",
    },
    {
      id: "open-url",
      title: "Open URL",
      mode: "builtin",
      builtin: "open-in-browser",
      value: "https://example.com",
    },
    {
      id: "show-detail",
      title: "Show Details",
      mode: "builtin",
      builtin: "show-detail",
    },
  ];

  assert.deepEqual(
    orderResolvedActionsForDisplay(actions, actions[1]).map((action) => action.id),
    ["open-url", "copy-body", "show-detail"],
  );
  assert.deepEqual(
    orderResolvedActionsForDisplay(actions, actions[1], {
      leadingAction: {
        id: "schema-command",
        title: "Run Schema Command",
        mode: "command",
        command: "tool",
        args: [],
        env: {},
      },
    }).map((action) => action.id),
    ["schema-command", "open-url", "copy-body", "show-detail"],
  );
});

test("normalizeTags strips hash marks and deduplicates values", () => {
  assert.deepEqual(
    normalizeTags(["#Raycast", ":docs:", "raycast", "two words"]),
    ["docs", "raycast", "two-words"],
  );
});

test("tagMatchesSearch supports contains and Chinese first-letter matching", () => {
  assert.equal(tagMatchesSearch("raycast", "ray"), true);
  assert.equal(tagMatchesSearch("人工智能", "rg"), true);
  assert.equal(tagMatchesSearch("人工智能", "zn"), true);
  assert.equal(tagMatchesSearch("人工智能", "llm"), false);
});

test("parseSearchQuery separates tag filters from keyword filters", () => {
  assert.deepEqual(parseSearchQuery("#docs #raycast keyboard shortcut"), {
    tags: ["docs", "raycast"],
    keywords: ["keyboard", "shortcut"],
  });
});

test("filterEntriesBySearch requires tags and every keyword to match title or body", () => {
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
    createEntry({
      title: "URL only",
      tags: ["docs"],
      properties: { URL: "https://example.com/keyboard" },
      body: "No matching body",
    }),
  ];

  assert.deepEqual(
    filterEntriesBySearch(entries, "#docs #raycast keyboard").map(
      (entry) => entry.title,
    ),
    ["Raycast Keyboard"],
  );
  assert.deepEqual(
    filterEntriesBySearch(entries, "#docs z").map((entry) => entry.title),
    [],
  );
  assert.deepEqual(
    filterEntriesBySearch(entries, "keyboard").map((entry) => entry.title),
    ["Raycast Keyboard", "Keyboard Maestro"],
  );
});

test("filterEntriesBySearch supports Chinese first-letter matching without length limits", () => {
  const entries: LibraryEntry[] = [
    createEntry({
      title: "中国资料",
      tags: ["country"],
      body: "这里记录 LLM 资源",
    }),
    createEntry({
      title: "其他内容",
      tags: ["country"],
      body: "没有目标内容",
    }),
  ];

  assert.deepEqual(
    filterEntriesBySearch(entries, "zg llm").map((entry) => entry.title),
    ["中国资料"],
  );
  assert.deepEqual(
    filterEntriesBySearch(entries, "#country z").map((entry) => entry.title),
    ["中国资料"],
  );
});

test("filterEntriesBySearch supports fuzzy hash tag matching", () => {
  const entries: LibraryEntry[] = [
    createEntry({
      title: "LLM Notes",
      tags: ["llm"],
      body: "Model notes",
    }),
    createEntry({
      title: "人工智能 Notes",
      tags: ["人工智能"],
      body: "AI notes",
    }),
    createEntry({
      title: "Other Notes",
      tags: ["tools"],
      body: "Tool notes",
    }),
  ];

  assert.deepEqual(
    filterEntriesBySearch(entries, "#ll").map((entry) => entry.title),
    ["LLM Notes"],
  );
  assert.deepEqual(
    filterEntriesBySearch(entries, "#rg").map((entry) => entry.title),
    ["人工智能 Notes"],
  );
});

test("filterEntriesBySearch does not match tags or properties for plain keywords", () => {
  const entries: LibraryEntry[] = [
    createEntry({
      title: "Plain title",
      tags: ["中文标签"],
      properties: {
        URL: "https://example.com/zg",
        DESCRIPTION: "中国说明",
      },
      body: "Plain body",
    }),
  ];

  assert.deepEqual(filterEntriesBySearch(entries, "zg"), []);
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
