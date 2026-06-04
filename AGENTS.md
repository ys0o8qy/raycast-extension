# AGENTS.md

## Project Overview

This is a Raycast extension for managing a resource library. Resources are stored in a user-configured Org-compatible file and exposed through Raycast commands for searching, browsing tags, adding resources, and editing existing resources.

Runtime-visible resource types and reusable actions can also be extended through an optional JSON manifest loaded from the Raycast `configFilePath` preference. The Org file remains the canonical storage for entries; `resource-library.config.json` is a runtime manifest, not a second database.

The project favors tags for lightweight cross-cutting labels. Existing nested Org grouped files are still parsed for compatibility, but new and edited resources are written without user-facing group selection.

Project-related aggregation is modeled as first-class project collections, not tags renamed as groups. The detailed design lives in `docs/superpowers/specs/2026-05-20-project-resource-collections-design.md`. Do not add tag-backed group commands or tag-backed group management actions.

## Commands

- `search-library`: User-facing title `Search Resources`. Main resource search view. Supports tag-aware queries such as `#docs #raycast keyboard`.
- `search-projects`: User-facing title `Search Projects`. Project collection search and detail view. Supports creating, editing, archiving, opening projects, adding existing resources, creating new resources into a project role, and removing resources from the current project.
- `browse-tags`: User-facing title `Browse Tags`. Lists visible resources by tag.
- `add-entry`: User-facing title `Add Resource`. Two-step resource creation flow with clipboard defaults and tag selection. Also accepts a Raycast `launchContext` for deeplink-driven adds (see "Deeplink Add" below).

The removed `browse-groups` command and the later experimental `search-groups` command should not be reintroduced as tag-backed grouping. Project entry points should use first-class project storage and terminology such as `Search Projects`.

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

## Deeplink Add

The `add-entry` command reads a Raycast `launchContext` (top-level `LaunchProps.launchContext`, the standard Raycast deeplink mechanism — not custom `?content=...` query strings).

`src/launch-context.ts` exposes a pure helper, `resolveAddEntryLaunchContext`, that normalizes the untrusted launch context into `{ title, type, resource, tags, autoSave }`. Behavior:

- Returns `undefined` when there is no usable `content` (any non-string or empty/whitespace value); the command then falls back to the regular UI with clipboard defaults.
- `type` is accepted only when it is a visible runtime type id (per `selectVisibleTypeIds(getRuntimeTypeIds(...))`); otherwise it falls back to `detectResourceType`.
- `tags` accepts either a string array or a single string split on commas/whitespace, then runs through `normalizeTags`.
- `autoSave` is only honored when the value is the boolean `true`.

`AddEntryCommand` (top-level only) handles `launchContext`. The reused `ResourceFormFlow` in `actions.tsx` (edit flow) intentionally ignores it.

When `autoSave` is true and `title` + `content` + persistable type are all present, the command writes the entry through `saveEntry`, calls `showHUD("Added resource")`, and then `popToRoot()` — no UI is shown beyond a brief loading view. If essentials are missing or saving throws, a Toast explains the reason and the prefilled two-step UI is shown as a fallback.

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
- Project role when the flow is launched from a project context.

Organization fields come after the core resource fields:

- Existing tags through `Form.TagPicker`.
- New tags through the `New Tag` text area, where comma or Enter creates normalized tags.
- AI tag suggestions through the `Suggest Tags` action.
- Saving with no selected tags is valid and writes an empty tag list.

Editing is launched from `src/actions.tsx` via `Action.Push` and refreshes the search view when saved.

Project collection flow:

- `src/projects/` owns the project parser, serializer, storage boundary, search, and view model.
- Projects are stored under a dedicated `* Projects` root and use `:PROJECT_ID:` rather than resource `:TYPE:`.
- Project membership nodes reference resource `:ID:` values through `:ENTRY_ID:` and never mutate resource tags to simulate membership.
- `src/search-projects.tsx` renders the `Search Projects` command, project detail resource sections, project creation/editing, archive, add-existing-resource, and add-new-resource-into-role flows.
- `EntryActions` exposes `Add to Project` as a secondary resource action and `Remove from Project` only when called from a project view context.

`src/search-library.tsx` uses `List` with `isShowingDetail` to show a right-side preview. Compact left-side resource rows are space-constrained and should not show tags as row accessories; tags belong in right-side detail metadata, tag-specific grouping context, or another roomy surface. The Search Resources list view should also avoid resource type text in the row. Shared row subtitles come from `buildCompactResourceSubtitle` in `src/list-helpers.ts`, and shared detail metadata comes from `src/resource-detail.tsx`. Preview markdown comes from `src/preview-markdown.ts` via `src/preview.tsx`, which truncates long bodies and escapes embedded triple backticks before rendering code fences.

`src/browse-tags.tsx` is the Tag Center entry point. Keep tag browsing, `Auto-Tag Resources`, and `Tag Governance` discoverable from there rather than scattering tag-management entry points through unrelated resource actions.

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
./node_modules/.bin/tsc tests/resource.test.ts tests/parser-runtime.test.ts tests/config.test.ts tests/runtime.test.ts tests/action-runner.test.ts tests/serializer-runtime.test.ts tests/launch-context.test.ts tests/search-library.test.ts tests/ui-flow.test.ts tests/project-design-cleanup.test.ts tests/projects.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && NODE_PATH=/Users/nspzoow/Documents/raycast-org-bookmarks/node_modules node --test /tmp/raycast-org-bookmarks-tests/tests/resource.test.js /tmp/raycast-org-bookmarks-tests/tests/parser-runtime.test.js /tmp/raycast-org-bookmarks-tests/tests/config.test.js /tmp/raycast-org-bookmarks-tests/tests/runtime.test.js /tmp/raycast-org-bookmarks-tests/tests/action-runner.test.js /tmp/raycast-org-bookmarks-tests/tests/serializer-runtime.test.js /tmp/raycast-org-bookmarks-tests/tests/launch-context.test.js /tmp/raycast-org-bookmarks-tests/tests/search-library.test.js /tmp/raycast-org-bookmarks-tests/tests/ui-flow.test.js /tmp/raycast-org-bookmarks-tests/tests/project-design-cleanup.test.js /tmp/raycast-org-bookmarks-tests/tests/projects.test.js
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
