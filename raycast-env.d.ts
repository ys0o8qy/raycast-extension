/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Library File Path - Absolute path to the file storing resources */
  "orgFilePath": string,
  /** Runtime Config Path - Absolute path to resource-library.config.json */
  "configFilePath"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-library` command */
  export type SearchLibrary = ExtensionPreferences & {}
  /** Preferences accessible in the `browse-tags` command */
  export type BrowseTags = ExtensionPreferences & {}
  /** Preferences accessible in the `add-entry` command */
  export type AddEntry = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-library` command */
  export type SearchLibrary = {}
  /** Arguments passed to the `browse-tags` command */
  export type BrowseTags = {}
  /** Arguments passed to the `add-entry` command */
  export type AddEntry = {}
}

