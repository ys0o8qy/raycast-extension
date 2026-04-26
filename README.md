# Resource Library

A Raycast extension for saving and using links, images, text snippets, schema entries, and config-defined resource types. Entries stay in a user-managed Org file, while optional runtime types and actions live in a separate JSON manifest.

## Commands

- `Search Resources`: search saved resources, preview content, and run the default action.
- `Browse Tags`: browse resources grouped by tag.
- `Add Resource`: add a resource from clipboard content, choose its type, and assign tags.

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

The add/edit flow uses one tag picker screen:

- Search existing tags.
- Press Enter on an existing tag to select it.
- Type a new tag and press Enter on `Create #tag` to create it.
- Press Enter on `Save Resource` or `Update Resource` with an empty search box to finish.

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

## Development

```bash
npm install
npm run build
```
