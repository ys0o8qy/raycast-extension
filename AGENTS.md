# AGENTS.md

## Project Overview

This is a Raycast extension for managing a resource library. Resources are stored in a user-configured Org-compatible file and exposed through Raycast commands for searching, browsing tags, adding resources, and editing existing resources.

Runtime-visible resource types and reusable actions can also be extended through an optional JSON manifest loaded from the Raycast `configFilePath` preference. The Org file remains the canonical storage for entries; `resource-library.config.json` is a runtime manifest, not a second database.

The project favors tags over groups. Existing grouped Org files are still parsed for compatibility, but new and edited resources are written without user-facing group selection.

## Commands

- `search-library`: User-facing title `Search Resources`. Main resource search view. Supports tag-aware queries such as `#docs #raycast keyboard`.
- `browse-tags`: User-facing title `Browse Tags`. Groups visible resources by tag.
- `add-entry`: User-facing title `Add Resource`. Two-step resource creation flow with clipboard defaults and tag selection.

The removed `browse-groups` command should not be reintroduced unless group-based organization becomes a product requirement again.

## Data Model

Persisted entries use an open string `LibraryEntry.type` in `src/types.ts`.

Built-in runtime types currently shipped from `src/runtime.ts`:

- `link`: HTTP and HTTPS resources.
- `image`: Local or remote image resources.
- `text`: Plain text snippets and notes.
- `schema`: URI schemes and structured schema-like content.
- `generic`: fallback runtime type used when an entry `TYPE` is unknown to the current registry.

Custom runtime types can be declared in `resource-library.config.json` and mapped to built-in semantic bases:

- `builtin:link`
- `builtin:asset`
- `builtin:text`
- `builtin:file`
- `builtin:directory`
- `builtin:schema`
- `builtin:generic`

Legacy Org entries with `:TYPE: bookmark` are parsed as `link` for backward compatibility. New entries should write `:TYPE: link`.

The resource description field is no longer part of the user-facing model. New entries should not write `:DESCRIPTION:`, and parsed legacy descriptions are ignored.

Each persisted resource should have a stable `:ID:` property. Editing depends on this ID to locate and replace the original Org block.

Runtime config is loaded from the Raycast `Runtime Config Path` preference (`configFilePath`). When unset, the extension uses only the built-in runtime registry.

Manifest shape:

- `version: 1`
- `actions`: reusable built-in or command actions
- `types`: runtime types with `extends`, optional `storageRoot`, optional `defaultAction`, and ordered `actions`

General command actions are declared in the manifest and may template entry data into `command`, `args`, `env`, and `stdin`.

Schema resources still support legacy per-entry `:SCHEMA_COMMAND:` and optional `:SCHEMA_ARGS:` properties as a compatibility action. That compatibility action sends the schema body to stdin and provides `RESOURCE_LIBRARY_ENTRY_ID`, `RESOURCE_LIBRARY_ENTRY_TITLE`, `RESOURCE_LIBRARY_ENTRY_TYPE`, and `RESOURCE_LIBRARY_ENTRY_TAGS` through the environment. Prefer manifest-defined command actions for new behavior.

## Org Storage Flow

- `src/storage.ts` is the public persistence boundary used by commands and actions.
- `src/config.ts` loads and validates `resource-library.config.json` from `configFilePath`.
- `src/runtime.ts` builds the runtime registry by merging built-in types/actions with manifest entries.
- `src/org/parser.ts` parses Org content into nodes and extracts `LibraryEntry` values.
- `src/org/serializer.ts` creates Org blocks and appends updated entries.
- `examples/library.org` is a sample data file, not a fixture automatically used by the extension.
- `examples/resource-library.config.json` is a sample runtime manifest, not a file the extension loads automatically.

New and edited entries are written under root headings resolved from runtime semantics or explicit `storageRoot` overrides. Built-in defaults are:

- `* Links`
- `* Images`
- `* Files`
- `* Directories`
- `* Text`
- `* Schemas`
- `* Other`

Parser compatibility keeps old nested headings readable. Serializer calls should pass an empty `groupPath` unless intentionally preserving old grouping behavior.

## Resource Detection

Shared resource behavior lives in `src/resource.ts`.

Clipboard detection rules:

- Common image paths or `file://...image.ext` become `image`.
- `http://` and `https://` become `link`.
- Any other `xxx://` scheme becomes `schema`.
- Everything else becomes `text`.

Tag behavior:

- Tags are lowercased.
- Leading `#` and surrounding Org colons are stripped.
- Whitespace becomes `-`.
- Duplicate tags are removed.

Search behavior:

- Query tokens starting with `#` are tag filters.
- Tag filters use the same fuzzy matching as the tag selector: normalized substring matching plus Chinese first-letter substring matching. For example, `#ll` matches `llm`, and `#rg` matches `人工智能`.
- Non-tag tokens are keyword filters.
- Plain keyword search only indexes `LibraryEntry.title` and `LibraryEntry.body`.
- Chinese first-letter search is always enabled for plain keywords, with no minimum input length.
- Full pinyin search is intentionally not supported.
- All tag filters and all keyword filters must match for an entry to be shown. For example, `#docs z` requires both the `docs` tag and a title/body match for `z`.
- Tag selector search also supports normalized substring matching and Chinese first-letter substring matching.

## UI Flow

`src/add-entry.tsx` owns both adding and editing through `ResourceFormFlow`.

Step 1 collects:

- Resource name.
- Resource content.
- Resource type via a single-select `Form.Dropdown` built from the runtime registry, not a hard-coded closed type list.

Step 2 collects:

- Tags via a custom `List` selector with one search box.
- Empty search shows `Save Resource`/`Update Resource` as the first item, so pressing Enter finishes the flow.
- Existing tags are filtered from the search text and can be toggled selected/unselected.
- New tags are created from the same search box through a first-position `Create #tag` list item when there is no exact existing/selected tag match.
- Saving with no selected tags is valid and writes an empty tag list.

Editing is launched from `src/actions.tsx` via `Action.Push` and refreshes the search view when saved.

`src/search-library.tsx` uses `List` with `isShowingDetail` to show a right-side preview. The list view should show tags but not resource type text. Preview markdown comes from `src/preview.tsx`, which truncates long bodies and escapes embedded triple backticks before rendering code fences.

`src/actions.tsx` renders the primary resource actions from the resolved runtime action list for each entry.

Built-in runtime behavior currently maps to:

- `link`: open `URL` in the system browser.
- `image`: open local `PATH` through the system default app, or open remote `URL` in the browser.
- `text`: paste `body` into the frontmost app.
- `schema`: copy `body` by default.

For `schema` entries, a legacy `SCHEMA_COMMAND` compatibility action is prepended ahead of the manifest-resolved actions when present.

The first action in `EntryActions` is the default Enter behavior for search results. Do not wrap `EntryActions` in another `ActionPanel`, or Enter may stop using the resource primary action.

The edit action should keep the `cmd+e` shortcut. `Reload Resources` should remain a secondary action; it refreshes the cached backing-file read and is useful when the file changed outside Raycast.

## Assets

Raycast icons are PNG files in `assets/`. Regenerate them with:

```bash
npm run generate-icons
```

The generator lives at `scripts/generate-icons.mjs` and uses `sharp` to render full-canvas 512x512 PNGs directly. Do not use macOS Quick Look thumbnails for icons; it can add unwanted padding.

## Verification

Run these before claiming a change is complete:

```bash
./node_modules/.bin/tsc tests/resource.test.ts tests/parser-runtime.test.ts tests/config.test.ts tests/runtime.test.ts tests/action-runner.test.ts tests/serializer-runtime.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/resource.test.js /tmp/raycast-org-bookmarks-tests/tests/parser-runtime.test.js /tmp/raycast-org-bookmarks-tests/tests/config.test.js /tmp/raycast-org-bookmarks-tests/tests/runtime.test.js /tmp/raycast-org-bookmarks-tests/tests/action-runner.test.js /tmp/raycast-org-bookmarks-tests/tests/serializer-runtime.test.js
npm run build
npm run generate-icons
./node_modules/.bin/ray build
```

`./node_modules/.bin/ray lint` may fail in restricted/offline environments because it fetches Raycast schema/user metadata and because this repository currently lacks an ESLint config. It is still useful for checking Raycast icon validation and Prettier output.

## Working Notes

- When changing architecture, resource logic, storage format, command flow, or important UI behavior, update this `AGENTS.md` file in the same change.
- Do not edit generated `raycast-env.d.ts` manually unless Raycast CLI output is wrong.
- Avoid destructive Git commands. The workspace may contain user changes.
- Keep source icons in `assets/` only if they are referenced by `package.json`; Raycast validates extension assets.
