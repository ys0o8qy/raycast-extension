# Resource Library

A Raycast extension for saving and using links, images, text snippets, and schema resources.

## Commands

- `Search Resources`: search saved resources, preview content, and run the default action.
- `Browse Tags`: browse resources grouped by tag.
- `Add Resource`: add a resource from clipboard content, choose its type, and assign tags.

## Resource Types

- `link`: opens in the system browser.
- `image`: opens local files in the system app, or remote URLs in the browser.
- `text`: pastes the saved text into the frontmost app.
- `schema`: runs a per-resource command when configured, otherwise copies the schema body.

## Search

Search supports plain keywords and tag filters:

```text
#docs #llm keyboard
```

Tag filters use substring matching and Chinese first-letter matching. Plain keywords search resource titles and body content.

## Tags

The add/edit flow uses one tag picker screen:

- Search existing tags.
- Press Enter on an existing tag to select it.
- Type a new tag and press Enter on `Create #tag` to create it.
- Press Enter on `Save Resource` or `Update Resource` with an empty search box to finish.

## Schema Commands

Schema resources can define:

- `SCHEMA_COMMAND`: command path to run.
- `SCHEMA_ARGS`: optional arguments.

The schema body is sent through stdin. Resource metadata is available through environment variables:

- `RESOURCE_LIBRARY_ENTRY_ID`
- `RESOURCE_LIBRARY_ENTRY_TITLE`
- `RESOURCE_LIBRARY_ENTRY_TYPE`
- `RESOURCE_LIBRARY_ENTRY_TAGS`

## Preference

Set `Library File Path` in Raycast to the absolute path of the backing resource file.

## Development

```bash
npm install
npm run build
```
