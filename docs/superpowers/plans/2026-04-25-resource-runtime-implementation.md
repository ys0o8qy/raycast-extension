# Resource Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hard-coded resource type and action branching with a JSON-configured runtime that supports extensible types and actions while keeping Org as the entry storage format.

**Architecture:** Keep `library.org` as the source of persisted entries, introduce a runtime registry built from built-in definitions plus `resource-library.config.json`, and route actions through a generic action runner instead of type-specific `switch` logic. Preserve the existing add/edit/search UI shape, but source the type list and action list from runtime definitions.

**Tech Stack:** TypeScript, Raycast API, Node `fs`/`child_process`, Org parser/serializer, Node test runner

---

### Task 1: Open the entry model and parser to runtime type IDs

**Files:**
- Modify: `src/types.ts`
- Modify: `src/org/parser.ts`
- Modify: `src/resource.ts`
- Modify: `tests/resource.test.ts`
- Create: `tests/parser-runtime.test.ts`

- [ ] **Step 1: Write the failing tests for unknown runtime types and parser retention**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { extractLibraryEntries, parseOrg } from "../src/org/parser";

test("parseOrg keeps custom runtime types instead of dropping entries", () => {
  const entries = extractLibraryEntries(
    parseOrg(`
* Text
** Shell Snippet :cli:
:PROPERTIES:
:ID: snippet-1
:TYPE: snippet
:END:
echo hello
`.trim()),
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "snippet");
  assert.equal(entries[0].body, "echo hello");
});

test("legacy bookmark still normalizes to link", () => {
  const entries = extractLibraryEntries(
    parseOrg(`
* Links
** Old Bookmark
:PROPERTIES:
:TYPE: bookmark
:URL: https://example.com
:END:
`.trim()),
  );

  assert.equal(entries[0].type, "link");
});
```

- [ ] **Step 2: Run the parser tests to verify they fail**

Run:

```bash
./node_modules/.bin/tsc tests/resource.test.ts tests/parser-runtime.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/resource.test.js /tmp/raycast-org-bookmarks-tests/tests/parser-runtime.test.js
```

Expected: FAIL because `tests/parser-runtime.test.ts` does not exist and the parser still narrows `type` to the closed `EntryType` union.

- [ ] **Step 3: Implement the open string type model**

Update `src/types.ts` so built-in UI defaults remain available, but persisted entries stop using a closed union:

```ts
export type BuiltinEntryType = "link" | "image" | "text" | "schema";

export const BUILTIN_ENTRY_TYPES: BuiltinEntryType[] = [
  "link",
  "image",
  "text",
  "schema",
];

export type EntryTypeId = string;

export interface LibraryEntry {
  id: string;
  title: string;
  type: EntryTypeId;
  tags: string[];
  properties: Record<string, string>;
  body: string;
  groupPath: string[];
  groupLabel: string;
  sourceHeadline: string;
  sourceStartLine: number;
  sourceEndLine: number;
}

export interface NewEntryInput {
  id?: string;
  title: string;
  type: EntryTypeId;
  tags: string[];
  groupPath: string[];
  url?: string;
  path?: string;
  body?: string;
}
```

Update `src/org/parser.ts` so type normalization returns `string | undefined` and keeps unknown values:

```ts
function normalizeEntryType(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  return normalized === "bookmark" ? "link" : normalized;
}

function nodeToEntry(
  node: OrgNode,
  ancestors: OrgNode[],
): LibraryEntry | undefined {
  const typeValue = normalizeEntryType(node.properties.TYPE);
  if (!typeValue) {
    return undefined;
  }

  const properties = normalizeProperties(node.properties);
  const groupPath = ancestors.slice(1).map((ancestor) => ancestor.title);
  const groupLabel = groupPath.length > 0 ? groupPath.join(" / ") : "Ungrouped";
  const idSource = [
    typeValue,
    ...groupPath,
    node.title,
    node.body,
    JSON.stringify(properties),
  ].join("|");

  return {
    id:
      properties.ID ||
      createHash("sha1").update(idSource).digest("hex").slice(0, 12),
    title: node.title,
    type: typeValue,
    tags: node.tags,
    properties,
    body: node.body,
    groupPath,
    groupLabel,
    sourceHeadline: `${"*".repeat(node.level)} ${node.title}`,
    sourceStartLine: node.sourceStartLine,
    sourceEndLine: node.sourceEndLine,
  };
}
```

Keep `src/resource.ts` detection behavior unchanged for now, but switch imports from `EntryType` to `BuiltinEntryType`.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
./node_modules/.bin/tsc tests/resource.test.ts tests/parser-runtime.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/resource.test.js /tmp/raycast-org-bookmarks-tests/tests/parser-runtime.test.js
```

Expected: PASS with both test files green.

- [ ] **Step 5: Commit the model-opening change**

```bash
git add src/types.ts src/org/parser.ts src/resource.ts tests/resource.test.ts tests/parser-runtime.test.ts
git commit -m "refactor: open entry types for runtime resolution"
```

### Task 2: Add config loading and runtime registry

**Files:**
- Create: `src/config.ts`
- Create: `src/runtime.ts`
- Modify: `src/types.ts`
- Create: `tests/config.test.ts`
- Create: `tests/runtime.test.ts`

- [ ] **Step 1: Write the failing tests for config validation and runtime resolution**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeRegistry } from "../src/runtime";

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

  assert.equal(registry.types.get("snippet")?.extends, "builtin:text");
  assert.equal(registry.types.get("link")?.extends, "builtin:link");
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
            defaultAction: "copy-body",
            actions: ["copy-body"],
          },
        },
      }),
    /unknown action referenced by type snippet/i,
  );
});
```

- [ ] **Step 2: Run the config/runtime tests to verify they fail**

Run:

```bash
./node_modules/.bin/tsc tests/config.test.ts tests/runtime.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/config.test.js /tmp/raycast-org-bookmarks-tests/tests/runtime.test.js
```

Expected: FAIL because `src/config.ts`, `src/runtime.ts`, and the new tests do not exist yet.

- [ ] **Step 3: Add runtime config and registry modules**

Extend `src/types.ts` with runtime definitions:

```ts
export type BuiltinSemanticType =
  | "builtin:link"
  | "builtin:asset"
  | "builtin:text"
  | "builtin:file"
  | "builtin:directory"
  | "builtin:schema"
  | "builtin:generic";

export type BuiltinActionId =
  | "open-in-browser"
  | "open-path"
  | "copy-to-clipboard"
  | "paste-to-frontmost-app"
  | "show-detail";

export interface ActionDefinition {
  title: string;
  mode: "builtin" | "command";
  builtin?: BuiltinActionId;
  value?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  stdin?: string;
}

export interface TypeDefinition {
  extends: BuiltinSemanticType;
  storageRoot?: string;
  defaultAction?: string;
  actions: string[];
}

export interface ResourceLibraryConfig {
  version: 1;
  actions: Record<string, ActionDefinition>;
  types: Record<string, TypeDefinition>;
}

export interface RuntimeRegistry {
  actions: Map<string, ActionDefinition>;
  types: Map<string, TypeDefinition>;
}
```

Create `src/config.ts` with validation and file loading:

```ts
import { getPreferenceValues } from "@raycast/api";
import { promises as fs } from "node:fs";
import { ResourceLibraryConfig, TypeDefinition } from "./types";

interface Preferences {
  orgFilePath: string;
  configFilePath?: string;
}

export async function loadResourceLibraryConfig(): Promise<ResourceLibraryConfig> {
  const preferences = getPreferenceValues<Preferences>();
  const path = preferences.configFilePath?.trim();
  if (!path) {
    return { version: 1, actions: {}, types: {} };
  }

  const raw = await fs.readFile(path, "utf8");
  return validateResourceLibraryConfig(JSON.parse(raw));
}

export function validateResourceLibraryConfig(value: unknown): ResourceLibraryConfig {
  const config = value as Partial<ResourceLibraryConfig>;
  if (config.version !== 1) {
    throw new Error("Config version must be 1");
  }

  return {
    version: 1,
    actions: config.actions || {},
    types: Object.fromEntries(
      Object.entries(config.types || {}).map(([typeId, definition]) => [
        typeId,
        validateTypeDefinition(typeId, definition),
      ]),
    ),
  };
}

function validateTypeDefinition(typeId: string, value: unknown): TypeDefinition {
  const definition = value as Partial<TypeDefinition>;
  if (!definition.extends) {
    throw new Error(`Type ${typeId} is missing required field extends`);
  }
  if (!Array.isArray(definition.actions)) {
    throw new Error(`Type ${typeId} must declare an actions array`);
  }

  return {
    extends: definition.extends,
    storageRoot: definition.storageRoot,
    defaultAction: definition.defaultAction,
    actions: definition.actions,
  };
}
```

Create `src/runtime.ts` with built-in defaults plus validation:

```ts
import {
  ActionDefinition,
  BuiltinSemanticType,
  ResourceLibraryConfig,
  TypeDefinition,
} from "./types";

const BUILTIN_TYPES: Record<string, TypeDefinition> = {
  link: { extends: "builtin:link", defaultAction: "open-url", actions: ["open-url"] },
  image: { extends: "builtin:asset", defaultAction: "open-asset", actions: ["open-asset"] },
  text: { extends: "builtin:text", defaultAction: "copy-body", actions: ["copy-body", "paste-body"] },
  schema: { extends: "builtin:schema", defaultAction: "copy-body", actions: ["copy-body"] },
};

function createBuiltinActions(): Record<string, ActionDefinition> {
  return {
    "open-url": {
      title: "Open URL",
      mode: "builtin",
      builtin: "open-in-browser",
      value: "{{url}}",
    },
    "open-asset": {
      title: "Open Asset",
      mode: "command",
      command: "open",
      args: ["{{path_or_url}}"],
    },
    "copy-body": {
      title: "Copy Body",
      mode: "builtin",
      builtin: "copy-to-clipboard",
      value: "{{body}}",
    },
    "paste-body": {
      title: "Paste Body",
      mode: "builtin",
      builtin: "paste-to-frontmost-app",
      value: "{{body}}",
    },
  };
}

export function buildRuntimeRegistry(config: ResourceLibraryConfig) {
  const actions = new Map<string, ActionDefinition>(Object.entries({
    ...createBuiltinActions(),
    ...config.actions,
  }));
  const types = new Map<string, TypeDefinition>(Object.entries({
    ...BUILTIN_TYPES,
    ...config.types,
  }));

  for (const [typeId, definition] of types) {
    for (const actionId of definition.actions) {
      if (!actions.has(actionId)) {
        throw new Error(`Unknown action referenced by type ${typeId}: ${actionId}`);
      }
    }
  }

  return { actions, types };
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run:

```bash
./node_modules/.bin/tsc tests/config.test.ts tests/runtime.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/config.test.js /tmp/raycast-org-bookmarks-tests/tests/runtime.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the runtime registry work**

```bash
git add src/types.ts src/config.ts src/runtime.ts tests/config.test.ts tests/runtime.test.ts
git commit -m "feat: add runtime config registry"
```

### Task 3: Introduce a generic action runner

**Files:**
- Create: `src/action-runner.ts`
- Modify: `src/types.ts`
- Modify: `src/runtime.ts`
- Create: `tests/action-runner.test.ts`
- Delete: `src/schema-command.ts`
- Modify: `tests/resource.test.ts`

- [ ] **Step 1: Write the failing tests for template expansion and command execution**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { expandTemplate, expandTemplateArray } from "../src/action-runner";

test("expandTemplate resolves core entry placeholders", () => {
  const entry = {
    id: "entry-1",
    title: "Snippet",
    type: "snippet",
    tags: ["cli", "shell"],
    properties: { PATH: "/tmp/demo.txt", URL: "https://example.com" },
    body: "echo hello",
    groupPath: [],
    groupLabel: "Ungrouped",
    sourceHeadline: "** Snippet",
    sourceStartLine: 0,
    sourceEndLine: 1,
  };

  assert.equal(
    expandTemplate("{{title}} {{path_or_url}}", entry),
    "Snippet /tmp/demo.txt",
  );
  assert.deepEqual(expandTemplateArray(["{{url}}", "{{tags_csv}}"], entry), [
    "https://example.com",
    "cli,shell",
  ]);
});

test("expandTemplate reads arbitrary properties", () => {
  const entry = {
    id: "entry-1",
    title: "Snippet",
    type: "snippet",
    tags: [],
    properties: { CUSTOM: "value" },
    body: "",
    groupPath: [],
    groupLabel: "Ungrouped",
    sourceHeadline: "** Snippet",
    sourceStartLine: 0,
    sourceEndLine: 1,
  };

  assert.equal(expandTemplate("{{property.CUSTOM}}", entry), "value");
});
```

- [ ] **Step 2: Run the action-runner tests to verify they fail**

Run:

```bash
./node_modules/.bin/tsc tests/action-runner.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/action-runner.test.js
```

Expected: FAIL because `src/action-runner.ts` does not exist.

- [ ] **Step 3: Implement the generic runner and delete schema special-casing**

Create `src/action-runner.ts`:

```ts
import { Clipboard, showToast, Toast, open } from "@raycast/api";
import { spawn } from "node:child_process";
import { ActionDefinition, LibraryEntry } from "./types";

export interface ResolvedActionDefinition extends ActionDefinition {
  id: string;
}

export function expandTemplate(template: string, entry: LibraryEntry): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
    switch (key) {
      case "id":
        return entry.id;
      case "title":
        return entry.title;
      case "type":
        return entry.type;
      case "body":
        return entry.body;
      case "url":
        return entry.properties.URL || "";
      case "path":
        return entry.properties.PATH || "";
      case "path_or_url":
        return entry.properties.PATH || entry.properties.URL || "";
      case "tags_csv":
        return entry.tags.join(",");
      case "tags_json":
        return JSON.stringify(entry.tags);
      default:
        if (key.startsWith("property.")) {
          return entry.properties[key.slice("property.".length).toUpperCase()] || "";
        }
        return "";
    }
  });
}

export async function runResolvedAction(
  entry: LibraryEntry,
  action: ResolvedActionDefinition,
): Promise<void> {
  if (action.mode === "builtin") {
    if (action.builtin === "copy-to-clipboard") {
      await Clipboard.copy(expandTemplate(action.value || "", entry));
      return;
    }
    if (action.builtin === "open-in-browser") {
      await open(expandTemplate(action.value || "{{url}}", entry));
      return;
    }
  }

  await runCommandAction(entry, action);
}
```

Update `src/runtime.ts` to return resolved action definitions for a concrete entry type:

```ts
import { ResolvedActionDefinition } from "./action-runner";

export function resolveEntryRuntime(entry: LibraryEntry, registry: RuntimeRegistry) {
  const typeDefinition = registry.types.get(entry.type) || {
    extends: "builtin:generic",
    actions: [],
  };
  const actions: ResolvedActionDefinition[] = typeDefinition.actions
    .map((actionId) => registry.actions.get(actionId))
    .filter((action): action is ActionDefinition => Boolean(action))
    .map((action, index) => ({
      id: typeDefinition.actions[index],
      ...action,
    }));

  return {
    semanticType: typeDefinition.extends,
    storageRoot: typeDefinition.storageRoot,
    actions,
  };
}
```

Then delete `src/schema-command.ts` and remove `splitSchemaCommandArgs` coverage from `tests/resource.test.ts`.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
./node_modules/.bin/tsc tests/action-runner.test.ts tests/runtime.test.ts tests/resource.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/action-runner.test.js /tmp/raycast-org-bookmarks-tests/tests/runtime.test.js /tmp/raycast-org-bookmarks-tests/tests/resource.test.js
```

Expected: PASS, with `schema-command` references fully removed.

- [ ] **Step 5: Commit the generic action runner**

```bash
git add src/action-runner.ts src/runtime.ts src/types.ts tests/action-runner.test.ts tests/resource.test.ts
git rm src/schema-command.ts
git commit -m "refactor: replace schema command path with action runner"
```

### Task 4: Drive Raycast actions and type selection from the runtime registry

**Files:**
- Modify: `src/actions.tsx`
- Modify: `src/add-entry.tsx`
- Modify: `src/storage.ts`
- Modify: `src/resource.ts`
- Modify: `package.json`
- Modify: `tests/resource.test.ts`

- [ ] **Step 1: Write the failing tests for runtime-backed dropdown options and action selection**

Add small pure helpers to test in isolation before wiring the React components:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mapResourceInputToEntryFields, selectVisibleTypeIds } from "../src/resource";

test("selectVisibleTypeIds includes built-in and config-defined types", () => {
  assert.deepEqual(
    selectVisibleTypeIds(["link", "image", "text", "schema", "snippet"]),
    ["image", "link", "schema", "snippet", "text"],
  );
});

test("mapResourceInputToEntryFields maps file-like types to PATH", () => {
  assert.deepEqual(
    mapResourceInputToEntryFields("builtin:file", "/tmp/demo.txt"),
    { path: "/tmp/demo.txt" },
  );
});
```

- [ ] **Step 2: Run the focused helper tests to verify they fail**

Run:

```bash
./node_modules/.bin/tsc tests/resource.test.ts tests/runtime.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/resource.test.js /tmp/raycast-org-bookmarks-tests/tests/runtime.test.js
```

Expected: FAIL because the helper exports and runtime-backed lookup flow do not exist yet.

- [ ] **Step 3: Wire runtime-backed action and type selection**

Add a preference for the config path in `package.json`:

```json
{
  "name": "configFilePath",
  "type": "textfield",
  "required": false,
  "title": "Runtime Config Path",
  "description": "Absolute path to resource-library.config.json"
}
```

Update `src/storage.ts` to export a shared loader:

```ts
import { loadResourceLibraryConfig } from "./config";
import { buildRuntimeRegistry } from "./runtime";

export async function loadRuntimeRegistry() {
  const config = await loadResourceLibraryConfig();
  return buildRuntimeRegistry(config);
}
```

Update `src/actions.tsx` so the primary action and extra configured actions come from runtime resolution instead of a `switch`:

```tsx
const runtime = await loadRuntimeRegistry();
const resolved = resolveEntryRuntime(entry, runtime);

return (
  <ActionPanel>
    {resolved.actions.map((action) => (
      <Action
        key={action.id}
        title={action.title}
        onAction={() => runResolvedAction(entry, action)}
      />
    ))}
    <Action.Push
      title="Edit Resource"
      icon={Icon.Pencil}
      shortcut={{ modifiers: ["cmd"], key: "e" }}
      target={<ResourceFormFlow entry={entry} onSaved={onChanged} />}
    />
  </ActionPanel>
);
```

Update `src/add-entry.tsx` so the dropdown is built from runtime types and the entry save mapping uses semantic base resolution instead of hard-coded schema fields:

```ts
function buildEntryInputFromDraft(
  draft: DraftResource,
  semanticType: BuiltinSemanticType,
  tags: string[],
): NewEntryInput {
  if (semanticType === "builtin:link") {
    return { title: draft.title, type: draft.type, tags, groupPath: [], url: draft.resource };
  }

  if (semanticType === "builtin:asset" || semanticType === "builtin:file" || semanticType === "builtin:directory") {
    return { title: draft.title, type: draft.type, tags, groupPath: [], path: draft.resource };
  }

  return { title: draft.title, type: draft.type, tags, groupPath: [], body: draft.resource };
}
```

Add the pure helpers to `src/resource.ts` so the tests in Step 1 have a stable unit to target:

```ts
export function selectVisibleTypeIds(typeIds: string[]): string[] {
  return [...typeIds].sort((left, right) => left.localeCompare(right));
}

export function mapResourceInputToEntryFields(
  semanticType: BuiltinSemanticType,
  resource: string,
): Pick<NewEntryInput, "url" | "path" | "body"> {
  if (semanticType === "builtin:link") {
    return { url: resource };
  }

  if (
    semanticType === "builtin:asset" ||
    semanticType === "builtin:file" ||
    semanticType === "builtin:directory"
  ) {
    return { path: resource };
  }

  return { body: resource };
}
```

Remove the schema-only fields from the form and keep the surface area to title, content, type, and tags.

- [ ] **Step 4: Run `npm run build` to verify the UI wiring compiles**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit the runtime-backed UI**

```bash
git add src/actions.tsx src/add-entry.tsx src/storage.ts src/resource.ts package.json
git commit -m "feat: drive resource UI from runtime registry"
```

### Task 5: Route serializer output by semantic base and preserve fallback behavior

**Files:**
- Modify: `src/org/serializer.ts`
- Modify: `src/runtime.ts`
- Modify: `src/storage.ts`
- Create: `tests/serializer-runtime.test.ts`

- [ ] **Step 1: Write the failing serializer tests for semantic-root routing**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { appendEntryToOrg } from "../src/org/serializer";

test("appendEntryToOrg routes file-like runtime types to Files root", () => {
  const next = appendEntryToOrg("", {
    id: "file-1",
    title: "Project Plan",
    type: "file",
    tags: [],
    groupPath: [],
    path: "/tmp/plan.md",
  }, {
    semanticType: "builtin:file",
    storageRoot: "Files",
  });

  assert.match(next, /^\* Files/m);
  assert.match(next, /:TYPE: file/);
  assert.match(next, /:PATH: \/tmp\/plan.md/);
});

test("appendEntryToOrg routes unknown runtime types to Other root", () => {
  const next = appendEntryToOrg("", {
    id: "mystery-1",
    title: "Mystery",
    type: "mystery",
    tags: [],
    groupPath: [],
    body: "payload",
  }, {
    semanticType: "builtin:generic",
    storageRoot: "Other",
  });

  assert.match(next, /^\* Other/m);
});
```

- [ ] **Step 2: Run the serializer tests to verify they fail**

Run:

```bash
./node_modules/.bin/tsc tests/serializer-runtime.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/serializer-runtime.test.js
```

Expected: FAIL because `appendEntryToOrg` does not accept runtime storage metadata yet.

- [ ] **Step 3: Implement semantic-root serializer routing**

Update `src/org/serializer.ts`:

```ts
const DEFAULT_STORAGE_ROOTS: Record<BuiltinSemanticType, string> = {
  "builtin:link": "Links",
  "builtin:asset": "Images",
  "builtin:text": "Text",
  "builtin:file": "Files",
  "builtin:directory": "Directories",
  "builtin:schema": "Schemas",
  "builtin:generic": "Other",
};

export interface SerializerRuntimeInfo {
  semanticType: BuiltinSemanticType;
  storageRoot?: string;
}

export function appendEntryToOrg(
  content: string,
  input: NewEntryInput,
  runtime: SerializerRuntimeInfo,
): string {
  const rootHeading = `* ${runtime.storageRoot || DEFAULT_STORAGE_ROOTS[runtime.semanticType]}`;
  // existing insertion logic continues here
}
```

Update `src/storage.ts` so `saveEntry` and `updateEntry` resolve runtime metadata before serializing.

- [ ] **Step 4: Run the serializer tests and the full build**

Run:

```bash
./node_modules/.bin/tsc tests/serializer-runtime.test.ts tests/parser-runtime.test.ts tests/runtime.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/serializer-runtime.test.js /tmp/raycast-org-bookmarks-tests/tests/parser-runtime.test.js /tmp/raycast-org-bookmarks-tests/tests/runtime.test.js
npm run build
```

Expected: PASS for both commands.

- [ ] **Step 5: Commit the serializer/runtime storage integration**

```bash
git add src/org/serializer.ts src/runtime.ts src/storage.ts tests/serializer-runtime.test.ts
git commit -m "refactor: route storage by runtime semantic type"
```

### Task 6: Update docs, sample config, and final verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Create: `examples/resource-library.config.json`
- Modify: `docs/superpowers/specs/2026-04-25-resource-runtime-design.md`

- [ ] **Step 1: Add the sample config file and documentation updates**

Create `examples/resource-library.config.json`:

```json
{
  "version": 1,
  "actions": {
    "open-url": {
      "title": "Open URL",
      "mode": "builtin",
      "builtin": "open-in-browser",
      "value": "{{url}}"
    },
    "copy-body": {
      "title": "Copy Body",
      "mode": "builtin",
      "builtin": "copy-to-clipboard",
      "value": "{{body}}"
    },
    "reveal-path": {
      "title": "Reveal in Finder",
      "mode": "command",
      "command": "open",
      "args": ["-R", "{{path}}"]
    }
  },
  "types": {
    "snippet": {
      "extends": "builtin:text",
      "defaultAction": "copy-body",
      "actions": ["copy-body"]
    },
    "file": {
      "extends": "builtin:file",
      "defaultAction": "reveal-path",
      "actions": ["reveal-path"]
    }
  }
}
```

Update `AGENTS.md` and `README.md` so they document:

- the new `configFilePath` preference
- the `resource-library.config.json` manifest
- the new runtime resolution architecture
- the fact that schema commands are now general command actions

- [ ] **Step 2: Run the repository verification commands**

Run:

```bash
./node_modules/.bin/tsc tests/resource.test.ts tests/parser-runtime.test.ts tests/config.test.ts tests/runtime.test.ts tests/action-runner.test.ts tests/serializer-runtime.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/resource.test.js /tmp/raycast-org-bookmarks-tests/tests/parser-runtime.test.js /tmp/raycast-org-bookmarks-tests/tests/config.test.js /tmp/raycast-org-bookmarks-tests/tests/runtime.test.js /tmp/raycast-org-bookmarks-tests/tests/action-runner.test.js /tmp/raycast-org-bookmarks-tests/tests/serializer-runtime.test.js
npm run build
npm run generate-icons
./node_modules/.bin/ray build
```

Expected:

- first command: PASS
- `npm run build`: PASS
- `npm run generate-icons`: PASS
- `./node_modules/.bin/ray build`: PASS

- [ ] **Step 3: Commit the documentation and verification pass**

```bash
git add AGENTS.md README.md examples/resource-library.config.json docs/superpowers/specs/2026-04-25-resource-runtime-design.md
git commit -m "docs: document runtime type and action config"
```

## Self-Review

Spec coverage check:

- open string runtime types: covered by Task 1
- JSON config manifest and validation: covered by Task 2
- registry-driven actions and arbitrary commands: covered by Task 3
- UI driven by runtime types/actions without schema-driven forms: covered by Task 4
- semantic-root serializer routing and unknown-type fallback: covered by Task 5
- docs and verification updates: covered by Task 6

Placeholder scan:

- no `TODO`, `TBD`, or deferred implementation markers remain
- each task includes concrete files, commands, and code snippets
- each testing step has an explicit expected outcome

Type consistency check:

- `LibraryEntry.type` is consistently treated as `string`
- runtime metadata uses `BuiltinSemanticType`
- config payload uses `ResourceLibraryConfig`
- action execution is routed through `runResolvedAction`
