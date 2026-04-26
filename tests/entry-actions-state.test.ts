import assert from "node:assert/strict";
import test from "node:test";
import { buildRuntimeRegistry } from "../src/runtime";
import {
  getEmptyEntryActionsState,
  resolveEntryActionsState,
} from "../src/entry-actions-state";
import { LibraryEntry } from "../src/types";

function createEntry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: "entry-1",
    title: "Snippet",
    type: "text",
    tags: ["notes"],
    properties: {},
    body: "hello world",
    groupPath: [],
    groupLabel: "",
    sourceHeadline: "* Snippet",
    sourceStartLine: 0,
    sourceEndLine: 4,
    ...overrides,
  };
}

test("getEmptyEntryActionsState keeps EntryActions safe when no entry props are available", () => {
  assert.deepEqual(getEmptyEntryActionsState(), {
    showDetailsIsPrimary: false,
    resolvedActions: [],
    url: undefined,
    localPath: undefined,
  });
});

test("resolveEntryActionsState prepends schema compatibility actions ahead of runtime actions", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {},
    types: {},
  });

  const state = resolveEntryActionsState(
    registry,
    createEntry({
      type: "schema",
      properties: {
        SCHEMA_COMMAND: "pbcopy",
        SCHEMA_ARGS: "--help",
      },
      body: "schema body",
    }),
  );

  assert.deepEqual(
    state.resolvedActions.map((action) => action.id),
    ["schema-command", "copy-body"],
  );
});
