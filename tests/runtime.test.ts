import test from "node:test";
import assert from "node:assert/strict";
import {
  assertRuntimeTypeAvailableForUpdate,
  buildRuntimeRegistry,
  resolveRuntimeStorageInfo,
  resolveDefaultActionForEntry,
  resolveEntryActions,
} from "../src/runtime";
import { LibraryEntry } from "../src/types";

test("buildRuntimeRegistry merges built-in and user-defined runtime types", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {
      "copy-body": {
        title: "Copy Body",
        mode: "builtin",
        builtin: "copy-to-clipboard",
        value: "{{body}}",
      },
    },
    types: {
      snippet: {
        extends: "builtin:text",
        defaultAction: "copy-body",
        actions: ["copy-body"],
      },
    },
  });

  assert.equal(registry.types.snippet?.extends, "builtin:text");
  assert.equal(registry.types.link?.extends, "builtin:link");
});

test("runtime registry remains usable after JSON serialization", () => {
  const registry = JSON.parse(
    JSON.stringify(
      buildRuntimeRegistry({
        version: 1,
        actions: {
          "copy-title": {
            title: "Copy Title",
            mode: "builtin",
            builtin: "copy-to-clipboard",
            value: "{{title}}",
          },
        },
        types: {
          snippet: {
            extends: "builtin:text",
            defaultAction: "copy-title",
            actions: ["copy-title", "show-detail"],
          },
        },
      }),
    ),
  );

  const defaultAction = resolveDefaultActionForEntry(
    registry,
    createEntry({
      title: "Serialized Registry",
      type: "snippet",
      body: "body text",
    }),
  );

  assert.deepEqual(defaultAction, {
    id: "copy-title",
    title: "Copy Title",
    mode: "builtin",
    builtin: "copy-to-clipboard",
    value: "Serialized Registry",
  });
});

test("runtime helpers recover built-in definitions from stale serialized registries", () => {
  const staleRegistry = { actions: {}, types: {} };

  const defaultAction = resolveDefaultActionForEntry(
    staleRegistry,
    createEntry({
      type: "text",
      body: "body text",
    }),
  );
  const fallbackActions = resolveEntryActions(
    staleRegistry,
    createEntry({
      type: "unknown-runtime-type",
      body: "opaque body",
    }),
  );

  assert.equal(defaultAction?.id, "paste-body");
  assert.deepEqual(
    fallbackActions.map((action) => action.id),
    ["show-detail", "copy-body"],
  );
});

test("buildRuntimeRegistry rejects type references to missing actions", () => {
  assert.throws(
    () =>
      buildRuntimeRegistry({
        version: 1,
        actions: {},
        types: {
          snippet: {
            extends: "builtin:text",
            defaultAction: "show-detail",
            actions: ["show-detail", "missing-action"],
          },
        },
      }),
    /unknown action referenced by type snippet: missing-action/i,
  );
});

test("buildRuntimeRegistry rejects unknown defaultAction references", () => {
  assert.throws(
    () =>
      buildRuntimeRegistry({
        version: 1,
        actions: {},
        types: {
          snippet: {
            extends: "builtin:text",
            defaultAction: "missing-default",
            actions: ["copy-body"],
          },
        },
      }),
    /unknown default action referenced by type snippet: missing-default/i,
  );
});

test("buildRuntimeRegistry rejects defaultAction values not listed in actions", () => {
  assert.throws(
    () =>
      buildRuntimeRegistry({
        version: 1,
        actions: {
          "copy-title": {
            title: "Copy Title",
            mode: "builtin",
            builtin: "copy-to-clipboard",
            value: "{{title}}",
          },
        },
        types: {
          snippet: {
            extends: "builtin:text",
            defaultAction: "copy-title",
            actions: ["copy-body"],
          },
        },
      }),
    /default action for type snippet must be included in actions: copy-title/i,
  );
});

test("resolveDefaultActionForEntry resolves the configured default action for a known type", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {},
    types: {},
  });

  const resolved = resolveDefaultActionForEntry(
    registry,
    createEntry({
      type: "text",
      body: "body text",
      properties: {
        URL: "https://example.com",
      },
    }),
  );

  assert.deepEqual(resolved, {
    id: "paste-body",
    title: "Paste Body",
    mode: "builtin",
    builtin: "paste-to-frontmost-app",
    value: "body text",
  });
});

test("resolveEntryActions falls back to generic type actions for unknown runtime entry types", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {},
    types: {},
  });

  const actions = resolveEntryActions(
    registry,
    createEntry({
      type: "snippet",
      body: "body text",
    }),
  );

  assert.deepEqual(
    actions.map((action) => action.id),
    ["show-detail", "copy-body"],
  );
});

test("resolveRuntimeStorageInfo uses semantic-base defaults for known runtime types", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {},
    types: {
      file: {
        extends: "builtin:file",
        actions: ["show-detail"],
      },
    },
  });

  assert.deepEqual(resolveRuntimeStorageInfo(registry, "file"), {
    semanticType: "builtin:file",
    storageRoot: "Files",
  });
});

test("resolveRuntimeStorageInfo falls back to Other for unknown runtime types", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {},
    types: {},
  });

  assert.deepEqual(resolveRuntimeStorageInfo(registry, "mystery"), {
    semanticType: "builtin:generic",
    storageRoot: "Other",
  });
});

test("assertRuntimeTypeAvailableForUpdate rejects editing existing custom entries when the runtime type is missing", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {},
    types: {},
  });

  assert.throws(
    () => assertRuntimeTypeAvailableForUpdate(registry, "snippet"),
    /cannot update entry with unknown runtime type "snippet"/i,
  );
});

test("assertRuntimeTypeAvailableForUpdate allows built-in and configured runtime types", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {},
    types: {
      snippet: {
        extends: "builtin:text",
        actions: ["show-detail"],
      },
    },
  });

  assert.doesNotThrow(() => assertRuntimeTypeAvailableForUpdate(registry, "text"));
  assert.doesNotThrow(() => assertRuntimeTypeAvailableForUpdate(registry, "snippet"));
});

test("resolveDefaultActionForEntry skips unavailable built-in defaults when entry data is missing", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {},
    types: {},
  });

  const resolved = resolveDefaultActionForEntry(
    registry,
    createEntry({
      type: "link",
    }),
  );

  assert.deepEqual(resolved, {
    id: "show-detail",
    title: "Show Details",
    mode: "builtin",
    builtin: "show-detail",
  });
});

test("resolveEntryActions filters unavailable built-in actions for missing entry data", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {},
    types: {},
  });

  const actions = resolveEntryActions(
    registry,
    createEntry({
      type: "text",
      body: "",
    }),
  );

  assert.deepEqual(
    actions.map((action) => action.id),
    ["show-detail"],
  );
});

test("resolveEntryActions does not filter overridden built-in action ids by legacy builtin assumptions", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {
      "copy-body": {
        title: "Run External Copy",
        mode: "command",
        command: "printf",
        args: ["copied"],
      },
    },
    types: {
      snippet: {
        extends: "builtin:text",
        defaultAction: "copy-body",
        actions: ["copy-body", "show-detail"],
      },
    },
  });

  const actions = resolveEntryActions(
    registry,
    createEntry({
      type: "snippet",
      body: "",
    }),
  );

  assert.deepEqual(
    actions.map((action) => action.id),
    ["copy-body", "show-detail"],
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
