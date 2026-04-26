import test from "node:test";
import assert from "node:assert/strict";
import { appendEntryToOrg } from "../src/org/serializer";
import { buildRuntimeRegistry, resolveRuntimeStorageInfo } from "../src/runtime";

test("appendEntryToOrg routes file-like runtime types to Files and preserves the custom TYPE", () => {
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

  const output = appendEntryToOrg(
    "",
    {
      title: "Quarterly Report",
      type: "file" as never,
      tags: ["docs"],
      groupPath: [],
      path: "/tmp/report.pdf",
    },
    resolveRuntimeStorageInfo(registry, "file"),
  );

  assert.match(output, /^\* Files$/m);
  assert.match(output, /^:TYPE: file$/m);
  assert.match(output, /^:PATH: \/tmp\/report\.pdf$/m);
});

test("appendEntryToOrg routes unknown runtime types to Other when runtime fallback resolves to builtin:generic", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {},
    types: {},
  });

  const output = appendEntryToOrg(
    "",
    {
      title: "Mystery Resource",
      type: "mystery" as never,
      tags: [],
      groupPath: [],
      body: "opaque value",
    },
    resolveRuntimeStorageInfo(registry, "mystery"),
  );

  assert.match(output, /^\* Other$/m);
  assert.match(output, /^:TYPE: mystery$/m);
  assert.match(output, /opaque value/);
});

test("appendEntryToOrg honors explicit storageRoot overrides from runtime metadata", () => {
  const registry = buildRuntimeRegistry({
    version: 1,
    actions: {},
    types: {
      snippet: {
        extends: "builtin:text",
        storageRoot: "Snippets",
        actions: ["copy-body"],
      },
    },
  });

  const output = appendEntryToOrg(
    "",
    {
      title: "Clipboard Helper",
      type: "snippet" as never,
      tags: [],
      groupPath: [],
      body: "pbpaste | rg Raycast",
    },
    resolveRuntimeStorageInfo(registry, "snippet"),
  );

  assert.match(output, /^\* Snippets$/m);
  assert.doesNotMatch(output, /^\* Text$/m);
  assert.match(output, /^:TYPE: snippet$/m);
});

test("appendEntryToOrg keeps runtime routing when creating a missing root in existing content", () => {
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

  const output = appendEntryToOrg(
    "* Links\n** Raycast\n:PROPERTIES:\n:ID: link-1\n:TYPE: link\n:URL: https://raycast.com\n:END:\n",
    {
      title: "Roadmap",
      type: "file" as never,
      tags: [],
      groupPath: [],
      path: "/tmp/roadmap.pdf",
    },
    resolveRuntimeStorageInfo(registry, "file"),
  );

  assert.match(output, /^\* Files$/m);
  assert.match(output, /^:TYPE: file$/m);
  assert.doesNotMatch(output, /^\* Other$/m);
});
