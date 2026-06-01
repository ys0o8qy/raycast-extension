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
  "configFilePath"?: string,
  /** Tag Suggestion Model - AI model for suggesting tags. Use a preset key (OpenAI_GPT-5_nano, Anthropic_Claude_4.5_Haiku, …) or any custom model string supported by your BYOK provider (e.g. claude-sonnet-4-20250514). See AI.Model docs for all presets. Requires Raycast Pro or BYOK AI access. */
  "tagSuggestionModel": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-library` command */
  export type SearchLibrary = ExtensionPreferences & {}
  /** Preferences accessible in the `search-projects` command */
  export type SearchProjects = ExtensionPreferences & {}
  /** Preferences accessible in the `browse-tags` command */
  export type BrowseTags = ExtensionPreferences & {}
  /** Preferences accessible in the `add-entry` command */
  export type AddEntry = ExtensionPreferences & {}
  /** Preferences accessible in the `auto-tag-resources` command */
  export type AutoTagResources = ExtensionPreferences & {}
  /** Preferences accessible in the `tag-governance` command */
  export type TagGovernance = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-library` command */
  export type SearchLibrary = {}
  /** Arguments passed to the `search-projects` command */
  export type SearchProjects = {}
  /** Arguments passed to the `browse-tags` command */
  export type BrowseTags = {}
  /** Arguments passed to the `add-entry` command */
  export type AddEntry = {}
  /** Arguments passed to the `auto-tag-resources` command */
  export type AutoTagResources = {}
  /** Arguments passed to the `tag-governance` command */
  export type TagGovernance = {}
}

