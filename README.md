# raycast-org-library

A minimal Raycast extension for managing an Org-backed library of entries.

## Supported entry types

- `bookmark`
- `image`
- `text`
- `schema`

## Features

- Reads a constrained Org file format without external Org parser dependencies
- Uses `TYPE` as the authoritative entry type
- Derives group paths from ancestor headlines below the type root heading
- Supports local image files via `PATH` and remote images via `URL`
- Uses `SCHEMA_KIND` for schema metadata while still reading older `FORMAT` values
- Searches all entries with type-specific previews and actions
- Browses unique groups and tags
- Adds normalized entries back into the Org file under type root headings, creating nested group headings as needed

## Org file shape

Top-level headings are used as storage buckets when writing:

- `* Bookmarks`
- `* Images`
- `* Text`
- `* Schemas`

Each entry is stored as a child headline under one of those roots, optionally nested in group headings, with optional headline tags, a property drawer, and body text.

Example:

```org
* Bookmarks
** Development
*** Raycast Docs :tools:docs:
:PROPERTIES:
:TYPE: bookmark
:URL: https://developers.raycast.com
:DESCRIPTION: Raycast developer documentation
:END:
Helpful docs for building extensions.

* Images
** Reference
*** Architecture Diagram :reference:
:PROPERTIES:
:TYPE: image
:PATH: /Users/me/Pictures/architecture.png
:DESCRIPTION: Local system diagram
:END:
Reference image for system architecture.

* Schemas
** Person Schema :json:schema:
:PROPERTIES:
:TYPE: schema
:SCHEMA_KIND: json-schema
:DESCRIPTION: Simple person object schema
:END:
{
  "type": "object"
}
```

## Add Entry form

The Add Entry command supports:

- `Group Path` using slash-separated segments such as `Development/Raycast`
- `URL` for bookmarks and remote images
- `Local Path` for local image files
- `Schema Kind` for schema entries
- `Body` for notes, text snippets, and schema content

## Preference

Set the `Org File Path` preference in Raycast to the absolute path of your `.org` file.

## Development

```bash
npm install
npm run build
```

## Notes

This MVP intentionally supports only a narrow subset of Org syntax:

- headlines
- headline tags
- property drawers
- plain body text
