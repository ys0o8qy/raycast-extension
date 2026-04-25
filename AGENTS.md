# AGENTS.md

## Project Overview

This is a Raycast extension for managing an Org-mode backed resource library. Resources are stored in a user-configured Org file and exposed through Raycast commands for searching, browsing tags, adding resources, and editing existing resources.

The project favors tags over groups. Existing grouped Org files are still parsed for compatibility, but new and edited resources are written without user-facing group selection.

## Commands

- `search-library`: Main resource search view. Supports tag-aware queries such as `#docs #raycast keyboard`.
- `browse-tags`: Groups visible resources by existing Org headline tags.
- `add-entry`: Two-step resource creation flow with clipboard defaults and tag selection.

The removed `browse-groups` command should not be reintroduced unless group-based organization becomes a product requirement again.

## Data Model

Resource types are defined in `src/types.ts`:

- `link`: HTTP and HTTPS resources.
- `image`: Local or remote image resources.
- `text`: Plain text snippets and notes.
- `schema`: URI schemes and structured schema-like content.

Legacy Org entries with `:TYPE: bookmark` are parsed as `link` for backward compatibility. New entries should write `:TYPE: link`.

The resource description field is no longer part of the user-facing model. New entries should not write `:DESCRIPTION:`, and parsed legacy descriptions are ignored.

Each persisted resource should have a stable `:ID:` property. Editing depends on this ID to locate and replace the original Org block.

## Org Storage Flow

- `src/storage.ts` is the public persistence boundary used by commands and actions.
- `src/org/parser.ts` parses Org content into nodes and extracts `LibraryEntry` values.
- `src/org/serializer.ts` creates Org blocks and appends updated entries.
- `examples/library.org` is a sample data file, not a fixture automatically used by the extension.

New and edited entries are written under type root headings:

- `* Links`
- `* Images`
- `* Text`
- `* Schemas`

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
- Resource type via a single-select `Form.Dropdown`.

Step 2 collects:

- Tags via a custom `List` selector with one search box.
- Empty search shows `Save Resource`/`Update Resource` as the first item, so pressing Enter finishes the flow.
- Existing tags are filtered from the search text and can be toggled selected/unselected.
- New tags are created from the same search box through a first-position `Create #tag` list item when there is no exact existing/selected tag match.
- Saving with no selected tags is valid and writes an empty tag list.

Editing is launched from `src/actions.tsx` via `Action.Push` and refreshes the search view when saved.

`src/search-library.tsx` uses `List` with `isShowingDetail` to show a right-side preview. The list view should show tags but not resource type text. Preview markdown comes from `src/preview.tsx`, which truncates long bodies and escapes embedded triple backticks before rendering code fences.

## Assets

Raycast icons are PNG files in `assets/`. Regenerate them with:

```bash
npm run generate-icons
```

The generator lives at `scripts/generate-icons.mjs` and uses `sharp` to render full-canvas 512x512 PNGs directly. Do not use macOS Quick Look thumbnails for icons; it can add unwanted padding.

## Verification

Run these before claiming a change is complete:

```bash
./node_modules/.bin/tsc tests/resource.test.ts --module commonjs --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck --types node --outDir /tmp/raycast-org-bookmarks-tests && node --test /tmp/raycast-org-bookmarks-tests/tests/resource.test.js
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
