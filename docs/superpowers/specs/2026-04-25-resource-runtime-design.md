# Resource Runtime Design

## Summary

This document proposes an extensible architecture for the Raycast resource library so that:

- resource instances continue to live in a user-managed Org file
- type and action extensions are declared in a separate JSON config file
- adding most new resource types does not require code changes
- actions can execute arbitrary local commands with entry data mapped into arguments and environment variables

The design keeps a small set of built-in semantic base types in code and moves higher-level type definitions and actions into configuration.

## Goals

- Preserve the current "user owns the content file" model.
- Keep Org as the canonical storage format for library entries.
- Add a separate JSON manifest for type and action declarations.
- Allow future types such as `snippet`, `file`, `directory`, `doc`, and similar resource flavors without changing multiple source files.
- Support arbitrary command-based actions declared in configuration.
- Keep the add/edit/search UI mostly stable and code-driven.
- Minimize changes required in storage and parser logic when new types are added.

## Non-Goals

- Making all UI structure declarative.
- Allowing config to define custom form layouts or search algorithms.
- Replacing Org storage with JSON or a database.
- Building a sandboxed command executor. Commands run with the user's local permissions.

## Current Problems

The current implementation hard-codes resource behavior in several places:

- `EntryType` is a closed union in `src/types.ts`.
- detection and search semantics assume the built-in types in `src/resource.ts`
- add/edit flow exposes only built-in types in `src/add-entry.tsx`
- action behavior is dispatched with a `switch` in `src/actions.tsx`
- schema command support is a type-specific special case in `src/schema-command.ts`

This means introducing a new type requires coordinated edits across model, parser assumptions, forms, and actions. The code does not currently distinguish between:

- base content semantics such as `url`, `path`, and `body`
- higher-level runtime types such as `snippet` or `directory`
- reusable actions such as "open", "reveal in Finder", and "copy body"

## Proposed Architecture

The system should be split into four layers.

### 1. Content Layer

`library.org` continues to store resource instances only.

Each entry keeps:

- stable `:ID:`
- string `:TYPE:`
- normalized tags
- generic properties map
- optional body

The parser should stop assuming that `TYPE` is limited to the current closed union. Instead, it should parse `TYPE` as an arbitrary string `typeId`.

Built-in compatibility remains:

- legacy `bookmark` still normalizes to `link`
- missing or unknown types are still parsed, but entries with unknown types are treated through runtime fallback rules instead of being discarded

### 2. Manifest Layer

A new JSON config file declares:

- action definitions
- type definitions
- the built-in semantic base each declared type extends
- visible action set for each type
- default action for each type

Recommended filename:

- `resource-library.config.json`

The config file is not a storage backend. It is a runtime manifest.

### 3. Runtime Layer

The application builds an in-memory registry at startup by merging:

- built-in semantic base types from code
- built-in action definitions from code
- user-declared types from `resource-library.config.json`
- user-declared actions from `resource-library.config.json`

This registry becomes the single source of truth for:

- which types exist
- which actions are available per type
- which action is primary
- how a type maps to built-in semantics

### 4. Storage Layer

`src/storage.ts`, `src/org/parser.ts`, and `src/org/serializer.ts` should remain generic. Their job is to load and persist entries, not interpret behavior.

The storage layer should only care about:

- stable IDs
- generic type IDs
- generic properties
- body content
- source positions for editing

## Built-In Semantic Base Types

Code should retain a very small set of semantic bases. These are not the user-facing extension types. They describe how the runtime interprets the core data shape of an entry.

Recommended built-in semantic bases:

- `builtin:link`
- `builtin:asset`
- `builtin:text`
- `builtin:file`
- `builtin:directory`
- `builtin:schema`
- `builtin:generic`

Each semantic base defines:

- which fields are expected to exist
- what fallback primary action is available if config is incomplete
- how previews are derived
- whether clipboard detection can map to that semantic

Examples:

- `builtin:link` expects `URL`
- `builtin:asset` expects `PATH` or `URL`
- `builtin:file` expects `PATH`
- `builtin:text` expects `body`
- `builtin:directory` expects `PATH`
- `builtin:schema` expects `body` and optionally structured command usage

Built-in semantic bases are deliberately few and stable. New types should usually extend one of them rather than adding new code-level semantics.

## Built-In Runtime Types

The semantic base layer is not the same thing as the initial type catalog.

The application should still ship with built-in runtime types for current behavior:

- `link` extends `builtin:link`
- `image` extends `builtin:asset`
- `text` extends `builtin:text`
- `schema` extends `builtin:schema`

Future config-defined types such as `snippet`, `file`, and `directory` can extend the semantic base that best matches their data shape.

## Config Format

Recommended shape:

```json
{
  "version": 1,
  "actions": {
    "open-url": {
      "title": "Open URL",
      "mode": "command",
      "command": "open",
      "args": ["{{url}}"]
    },
    "open-file": {
      "title": "Open File",
      "mode": "command",
      "command": "open",
      "args": ["{{path}}"]
    },
    "reveal-path": {
      "title": "Reveal in Finder",
      "mode": "command",
      "command": "open",
      "args": ["-R", "{{path}}"]
    },
    "copy-body": {
      "title": "Copy Body",
      "mode": "builtin",
      "builtin": "copy-to-clipboard",
      "value": "{{body}}"
    }
  },
  "types": {
    "link": {
      "extends": "builtin:link",
      "defaultAction": "open-url",
      "actions": ["open-url"]
    },
    "snippet": {
      "extends": "builtin:text",
      "defaultAction": "copy-body",
      "actions": ["copy-body"]
    },
    "file": {
      "extends": "builtin:file",
      "defaultAction": "open-file",
      "actions": ["open-file", "reveal-path"]
    }
  }
}
```

## Config Rules

- `version` is required for future compatibility.
- `actions` is a global reusable action library.
- `types` is a global type registry.
- each type must declare `extends`
- each type may declare `storageRoot`
- each type may declare `defaultAction`
- each type declares the action IDs visible for entries of that type
- action IDs must be unique
- type IDs must be unique
- config validation happens at load time with clear user-facing errors

## Runtime Types

The entry model should distinguish between persisted instance data and runtime type metadata.

Recommended direction:

```ts
interface LibraryEntry {
  id: string;
  title: string;
  type: string;
  tags: string[];
  properties: Record<string, string>;
  body: string;
  groupPath: string[];
  groupLabel: string;
  sourceHeadline: string;
  sourceStartLine: number;
  sourceEndLine: number;
}

interface TypeDefinition {
  id: string;
  extends: BuiltinSemanticType;
  storageRoot?: string;
  defaultAction?: string;
  actions: string[];
}

interface ActionDefinition {
  id: string;
  title: string;
  mode: "builtin" | "command";
  builtin?: BuiltinActionId;
  value?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  stdin?: string;
}
```

Important consequence: `LibraryEntry.type` becomes an open string, not a TypeScript union.

## Action Execution Model

Action execution should move to a generic runner instead of type-specific code paths.

### Built-In Actions

The runtime should keep a small set of built-in action primitives for operations that Raycast can perform natively and more ergonomically than shelling out.

Recommended built-in primitives:

- `open-in-browser`
- `open-path`
- `copy-to-clipboard`
- `paste-to-frontmost-app`
- `show-detail`

These actions are still selected through config. The config chooses which built-in primitive to invoke and what value template to feed it.

### Command Actions

Command actions execute arbitrary local commands using:

- `command`
- `args`
- `env`
- optional `stdin`

Templates are expanded from entry data before execution.

Supported template variables should include:

- `{{id}}`
- `{{title}}`
- `{{type}}`
- `{{body}}`
- `{{url}}`
- `{{path}}`
- `{{tags_csv}}`
- `{{tags_json}}`
- `{{property.NAME}}`

Recommended environment variables for every command action:

- `RESOURCE_LIBRARY_ENTRY_ID`
- `RESOURCE_LIBRARY_ENTRY_TITLE`
- `RESOURCE_LIBRARY_ENTRY_TYPE`
- `RESOURCE_LIBRARY_ENTRY_TAGS`
- `RESOURCE_LIBRARY_ENTRY_BODY`
- `RESOURCE_LIBRARY_ENTRY_URL`
- `RESOURCE_LIBRARY_ENTRY_PATH`

Important design choice: commands should be executed without a shell by default. Use direct process spawning with explicit argument arrays. This avoids quoting bugs and accidental shell injection behavior.

### Failure Handling

Action failures should:

- surface a Raycast toast with the action title and stderr or error message
- keep the list UI responsive
- not corrupt entry storage
- not mark the manifest invalid unless the failure is caused by config loading or config validation

## Type Resolution Rules

When loading an entry:

1. parse raw Org entry into `LibraryEntry`
2. look up `entry.type` in the runtime registry
3. if found, resolve its declared semantic base and actions
4. if not found, use a fallback `builtin:generic` runtime

Unknown types should remain visible instead of disappearing. The fallback experience should offer:

- `Show Details`
- `Copy Body` when body exists
- `Copy URL` when `URL` exists
- `Copy Path` when `PATH` exists

This makes the system resilient while users experiment with config.

## UI Impact

The UI remains mostly code-driven, but stops hard-coding the full type catalog.

### Add/Edit Flow

The form should expose a type dropdown built from the runtime registry rather than the static `ENTRY_TYPES` list.

The UI remains simple:

- title
- resource content
- type
- tags

The current form should not become schema-driven. Instead, built-in semantic bases continue to map the primary content field:

- link-like types store resource text in `URL`
- asset-like types store resource text in `PATH` when local and `URL` when remote
- file and directory-like types store resource text in `PATH`
- text-like types store resource text in `body`
- schema-like types store resource text in `body`

This keeps the add/edit experience stable while still allowing new types.

### Search

Search should remain based on title and body by default. Tags stay unchanged.

No config-driven search field expansion is needed in this phase.

### Actions Panel

The actions panel should be rendered from the resolved action list for the entry type instead of a `switch`.

The first rendered action remains the primary Enter behavior.

Secondary utility actions such as `Edit Resource`, `Show Details`, and `Reload Resources` remain code-owned and always available.

## Clipboard Detection

Clipboard detection should still resolve only to built-in semantic defaults:

- image-like paths map to the built-in `image` type, which extends `builtin:asset`
- `http://` and `https://` map to `link`
- other `scheme://` values map to `schema`
- all other content maps to `text`

This avoids requiring config during heuristic detection. Detection is a convenience, not a manifest-driven inference system.

## Serializer and Parser Changes

### Parser

- change type parsing from closed `EntryType` union to open string
- preserve legacy `bookmark -> link`
- stop dropping entries with unknown types
- keep properties as a normalized generic map

### Serializer

The serializer should stop routing entries by a hard-coded `Record<EntryType, string>`.

Recommended rule:

- a type definition may optionally declare `storageRoot`
- if `storageRoot` exists, serializer uses it
- otherwise serializer falls back to the default root heading for the semantic base

Suggested root headings:

- `* Links`
- `* Images`
- `* Files`
- `* Directories`
- `* Text`
- `* Schemas`
- `* Other`

This keeps Org output stable even when many custom types exist.

## Config Loading and Validation

Add a dedicated config module, for example:

- `src/config.ts`
- `src/runtime.ts`

Responsibilities:

- load JSON from preference-configured path or default adjacent path
- parse JSON safely
- validate structure and field requirements
- merge user config with built-in definitions
- expose a `RuntimeRegistry`

Validation errors should be explicit and actionable, for example:

- unknown action referenced by type `snippet`
- duplicate action ID `open-file`
- type `file` extends unknown semantic `builtin:files`
- action `show-file` is missing required `command`

## Recommended Module Layout

- `src/types.ts`: persisted entry model and runtime config model types
- `src/config.ts`: config file loading and validation
- `src/runtime.ts`: registry building and type resolution
- `src/action-runner.ts`: built-in and command action execution
- `src/actions.tsx`: UI rendering from resolved runtime actions
- `src/resource.ts`: detection and search helpers using semantic bases
- `src/storage.ts`: generic entry read and write
- `src/org/parser.ts`: parse generic types
- `src/org/serializer.ts`: route by semantic base instead of closed type enum

The old `src/schema-command.ts` behavior should be folded into the generic action runner. Schema should no longer be a privileged type-specific command path.

## Migration Plan

Recommended migration sequence:

1. Open `LibraryEntry.type` from union to string without changing UI behavior.
2. Introduce runtime registry with built-in types only.
3. Move action dispatch from `switch` to registry-driven resolution.
4. Add JSON config loading and validation.
5. Register custom types from config.
6. Replace schema-specific command execution with generic command actions.
7. Update add/edit type dropdown to use runtime registry.
8. Update serializer to route by semantic base headings.

This order keeps the product working during refactor and avoids a big-bang rewrite.

## Security and Trust Model

This design intentionally allows arbitrary local commands declared in config. That is powerful and risky.

Explicit trust assumptions:

- the config file is trusted user-owned local configuration
- command execution has the same local permissions as the Raycast extension process
- the extension does not attempt to sandbox commands

Risk reduction measures:

- spawn commands directly without a shell
- keep argument templating explicit
- show clear action titles before execution
- surface stderr in failures
- avoid hidden background mutation of the config or library file

## Testing Strategy

Add focused tests around:

- parsing unknown custom types from Org
- config validation failures
- runtime type resolution
- template expansion for args, env, and stdin
- fallback behavior for unknown types
- serializer routing by semantic base
- action rendering order for default actions

Keep existing resource and parser tests, but update them to account for open string types.

## Decision Summary

The target architecture is:

- Org file for resource instances
- separate JSON config for type and action declarations
- small built-in semantic base layer in code
- open string-based runtime type system
- registry-driven action rendering and execution
- generic command runner replacing type-specific command logic

This is the smallest architecture change that gives strong extensibility without turning the extension into a fully declarative UI platform.
