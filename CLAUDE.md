# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build, Lint, Test

```bash
npm run build          # tsc --noEmit (type-check only)
npm run lint           # eslint src --ext .ts,.tsx
npm run generate-icons # regenerate assets/ PNG icons via sharp
npm run dev            # ray develop (local Raycast extension dev)
```

### Running Tests

Tests are plain `.ts` files compiled on-the-fly with `tsc` then run via `node --test`. The full incantation:

```bash
./node_modules/.bin/tsc \
  tests/resource.test.ts tests/parser-runtime.test.ts tests/config.test.ts \
  tests/runtime.test.ts tests/action-runner.test.ts tests/serializer-runtime.test.ts \
  tests/launch-context.test.ts tests/search-library.test.ts tests/ui-flow.test.ts \
  tests/project-design-cleanup.test.ts tests/projects.test.ts \
  --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck \
  --types node --outDir /tmp/raycast-org-bookmarks-tests \
  && NODE_PATH=$(pwd)/node_modules node --test /tmp/raycast-org-bookmarks-tests/tests/*.test.js
```

There is no Jest/vitest config — tests use Node's built-in `node:test` and `node:assert/strict`.

### Raycast Build Verification

```bash
./node_modules/.bin/ray build   # full Raycast extension build
```

## Architecture

This is a **Raycast extension** that manages a user's resource library. Resources (links, images, text snippets, schemas, and custom types) are stored in an **Org-mode formatted file** configured via the `orgFilePath` Raycast preference. An optional JSON manifest (`resource-library.config.json`) extends the built-in type/action registry at runtime without changing the Org format.

### Data Flow

```
Org file (on disk)
  → src/org/parser.ts → OrgNode[] → extractLibraryEntries() → LibraryEntry[]
  → UI commands (search-library, browse-tags, search-projects, add-entry)
  → edits go through src/storage.ts → src/org/serializer.ts → writes back Org file
```

### Runtime Registry (Type/Action System)

`src/runtime.ts` merges built-in types/actions with manifest-defined ones from `src/config.ts`. The merged registry resolves:

1. **Type → semantic base** (`builtin:link`, `builtin:asset`, `builtin:text`, `builtin:file`, `builtin:directory`, `builtin:schema`, `builtin:generic`)
2. **Semantic base → storage root heading** (e.g., `* Links`, `* Images`)
3. **Type → ordered action list** → `ResolvedAction[]`
4. **Type → default action** (first available action used for Enter key in search results)

Built-in types: `link`, `image`, `text`, `schema`, `generic` (fallback for unknown types).

### Persistence Layers

- **Resources**: `src/storage.ts` — `loadEntries()`, `saveEntry()`, `updateEntry()`, `deleteEntry()`. Reads/writes the Org file.
- **Projects**: `src/projects/storage.ts` — `loadProjectData()`, `saveProject()`, `updateProject()`, `archiveProject()`, `addProjectMembership()`, `removeProjectMembership()`. Projects are stored under a `* Projects` root in the same Org file, with membership nodes referencing resource IDs via `:ENTRY_ID:`.

### Search

`src/resource.ts` provides `filterEntriesBySearch()` which parses queries into tag filters (`#tag`) and keyword filters. Keywords search only `title` and `body` (not properties or tags). Tag matching uses normalized substring + Chinese first-letter matching (via `pinyin-pro`). All tag filters AND all keyword filters must match (AND logic).

### Key Constraints

- **Projects are first-class entities**, not tag-backed groups. Never reintroduce tag-backed group commands.
- **Tags are optional** — saving with no tags is valid. Tags are lowercased, deduped, whitespace→`-`.
- **Compact resource rows** should NOT show tags or type text. Those belong in the right-side detail view or tag-specific surfaces.
- **`EntryActions`** (in `src/actions.tsx`) renders the primary action list from the runtime registry. The first action is the default Enter behavior — don't wrap it in another `ActionPanel`.
- **The edit action** should keep the `cmd+e` shortcut.
- **Legacy `:TYPE: bookmark`** is coerced to `link`. Legacy `:DESCRIPTION:` is dropped. Legacy schema entries with `:SCHEMA_COMMAND:` get a compatibility command action prepended before manifest-resolved actions.
- **`src/launch-context.ts`** handles deeplink-based resource addition via Raycast `launchContext`. Only `add-entry` command reads it; the reuse of `ResourceFormFlow` in edit mode ignores it.

### Org Parser/Serializer

- Parser (`src/org/parser.ts`): line-based, builds a tree of `OrgNode` objects with headline levels, properties blocks, body text, and source line ranges. Entries are identified by `:TYPE:` property.
- Serializer (`src/org/serializer.ts`): `appendEntryToOrg()` inserts entries under the correct root heading (resolved from the runtime semantic type), creating intermediate group headings as needed. `updateEntry()` removes the old block by line range then appends the new one. `removeEntryFromOrg()` deletes by line range.
- Entries get a stable `:ID:` property — SHA1 hash of type+path+title+body+properties if no explicit ID, or `randomUUID()` for new entries.
