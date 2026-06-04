# Resource Library

A Raycast extension for saving and using links, images, text snippets, schema entries, and config-defined resource types. Entries stay in a user-managed Org file, while optional runtime types and actions live in a separate JSON manifest.

## Commands

- `Search Resources`: search saved resources, preview content, and run the default action.
- `Search Projects`: search project collections, open a project, and use the resources attached to it.
- `Browse Tags`: browse resources grouped by tag.
- `Add Resource`: add a resource from clipboard content, choose its type, and assign tags.
- `Auto-Tag Resources`: queue resources and review AI tag suggestions before saving.
- `Tag Governance`: review tag health and merge redundant tags.

## Interaction Model

`Search Resources` is the primary high-frequency entry point. Compact resource rows show the resource title, icon, and a short identifying subtitle such as hostname, text excerpt, filename, or schema kind. Tags are intentionally kept out of compact rows; they appear in the right-side detail metadata, tag grouping context, or dedicated tag management screens.

Resource detail panes use a shared metadata order across search, tag browsing, project resources, and auto-tag review:

- Projects
- Tags
- AI Suggested Tags, when reviewing auto-tag output
- URL or path
- Type and other persisted properties

`Browse Tags` acts as the Tag Center. It keeps tag-grouped browsing in one place and exposes `Auto-Tag Resources` and `Tag Governance` so tag creation, review, and cleanup are discoverable from the same command.

## Preferences

- `Library File Path` (`orgFilePath`): absolute path to the Org file that stores entries.
- `Runtime Config Path` (`configFilePath`): optional absolute path to `resource-library.config.json`.

If `configFilePath` is empty, the extension uses only the built-in runtime types and actions.

## Runtime Manifest

`resource-library.config.json` is a runtime manifest, not a storage file. It lets you add reusable actions and custom types without changing the Org format.

At a high level, the manifest declares:

- `actions`: reusable built-in or command actions
- `types`: runtime-visible resource types, their semantic base, optional storage root, visible actions, and default action

Built-in types still ship in code:

- `link`
- `image`
- `text`
- `schema`
- `generic` as the fallback runtime type for entries whose `TYPE` is not present in the loaded registry

Built-in semantic bases used by the runtime:

- `builtin:link`
- `builtin:asset`
- `builtin:text`
- `builtin:file`
- `builtin:directory`
- `builtin:schema`
- `builtin:generic`

Command actions run without a shell and can expand entry templates into `command`, `args`, `env`, and `stdin`.

A realistic sample manifest lives at [examples/resource-library.config.json](/Users/nspzoow/Documents/raycast-org-bookmarks/examples/resource-library.config.json).

## Search

Search supports plain keywords and tag filters:

```text
#docs #llm keyboard
```

Tag filters use normalized substring matching and Chinese first-letter matching. Plain keywords search resource titles and body content.

## Tags

The add/edit flow keeps core resource fields first:

- Resource name.
- Resource content.
- Resource type.
- Project role, when creating a resource from a project context.

Tags are optional organization metadata:

- Search existing tags.
- Select existing tags from the picker.
- Type a new tag in `New Tag`; pressing comma, pressing Enter, or saving the form adds it.
- Use `Suggest Tags` to review AI suggestions before adding them.
- Saving with no tags is valid.

## Project Collections

Project-related aggregation uses first-class project collections, not tags renamed as groups. A project can gather a PRD, technical design, test account reference, environment URL, issue, pull request, and notes while still letting each resource keep its own tags.

Use `Search Projects` to create, find, open, edit, and archive projects. Project rows include a compact resource count and available owner/status context. Inside a project, resources are grouped by role, and the normal resource default actions still work. From the project action item, add an existing resource or create a new resource directly into a selected role. From any resource action panel, use `Add to Project`; from a project resource view, use `Remove from Project` to remove only that membership. The canonical resource entry stays in its normal type root.

Projects are stored under a dedicated Org root:

```org
* Projects
** Payment Redesign
:PROPERTIES:
:PROJECT_ID: proj_payment_redesign
:STATUS: active
:OWNER: alice
:END:

*** PRD
:PROPERTIES:
:ENTRY_ID: resource_prd_123
:ROLE: prd
:ORDER: 10
:END:
```

The detailed design lives at [docs/superpowers/specs/2026-05-20-project-resource-collections-design.md](/Users/nspzoow/Documents/raycast-org-bookmarks/docs/superpowers/specs/2026-05-20-project-resource-collections-design.md).

## Schema Command Compatibility

General command actions now belong in the runtime manifest. Legacy schema entries can still use `:SCHEMA_COMMAND:` and optional `:SCHEMA_ARGS:` as a compatibility action for `schema` entries.

For that compatibility path:

- the schema body is sent through stdin
- the action runs before the normal manifest-resolved schema actions
- these environment variables are provided:
  - `RESOURCE_LIBRARY_ENTRY_ID`
  - `RESOURCE_LIBRARY_ENTRY_TITLE`
  - `RESOURCE_LIBRARY_ENTRY_TYPE`
  - `RESOURCE_LIBRARY_ENTRY_TAGS`

For new setups, prefer manifest-defined command actions over entry-specific schema command properties.

## Deeplink: Auto-add a Resource

The `Add Resource` command accepts a Raycast `launchContext` so other tools can add resources via deeplinks.

```text
raycast://extensions/<author>/<extension>/add-entry?context=<URL-encoded JSON>
```

Supported context fields:

| Field      | Type               | Notes                                                                                                                                                             |
| ---------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`  | string             | Required. The resource value (URL, text, path, or `xxx://` schema).                                                                                               |
| `title`    | string             | Optional. Required when `autoSave` is `true`.                                                                                                                     |
| `type`     | string             | Optional. Any visible runtime type id (e.g. `link`, `image`, `text`, `schema`, or a manifest-defined type). Falls back to auto-detection when missing or unknown. |
| `tags`     | string[] \| string | Optional. Strings are split on commas/whitespace. Tags are normalized and deduped.                                                                                |
| `autoSave` | boolean            | Optional. When `true`, save without showing the form. Falls back to the prefilled UI (with a toast) if `title`/`content` are missing.                             |

Example payload (before URL-encoding):

```json
{
  "content": "https://example.com",
  "type": "link",
  "title": "Example",
  "tags": ["docs"],
  "autoSave": true
}
```

## Development

```bash
npm install
npm run build
```
