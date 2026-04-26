import { promises as fs } from "node:fs";
import {
  ActionDefinition,
  BUILTIN_ACTION_IDS,
  BUILTIN_SEMANTIC_TYPES,
  BuiltinActionId,
  BuiltinSemanticType,
  ResourceLibraryConfig,
  TypeDefinition,
} from "./types";

interface ResourceLibraryPreferences {
  orgFilePath: string;
  configFilePath?: string;
}

interface LoadResourceLibraryConfigOptions {
  getPreferences?: () => ResourceLibraryPreferences;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
}

const EMPTY_RESOURCE_LIBRARY_CONFIG: ResourceLibraryConfig = {
  version: 1,
  actions: {},
  types: {},
};

export async function loadResourceLibraryConfig(
  options: LoadResourceLibraryConfigOptions = {},
): Promise<ResourceLibraryConfig> {
  const getPreferences =
    options.getPreferences ?? getRuntimePreferences;
  const readFile = options.readFile ?? fs.readFile.bind(fs);
  const preferences = getPreferences();
  const path = preferences.configFilePath?.trim();

  if (!path) {
    return EMPTY_RESOURCE_LIBRARY_CONFIG;
  }

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Failed to read resource library config at ${path}: ${String(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse resource library config at ${path}: ${message}`);
  }

  return validateResourceLibraryConfig(parsed);
}

function getRuntimePreferences(): ResourceLibraryPreferences {
  const { getPreferenceValues } = require("@raycast/api") as typeof import("@raycast/api");
  return getPreferenceValues<ResourceLibraryPreferences>();
}

export function validateResourceLibraryConfig(
  value: unknown,
): ResourceLibraryConfig {
  const config = requireObject(value, "Config");

  if (config.version !== 1) {
    throw new Error("Config field version must be 1");
  }

  const actionsValue = config.actions ?? {};
  const typesValue = config.types ?? {};

  return {
    version: 1,
    actions: validateActionMap(actionsValue, "actions"),
    types: validateTypeMap(typesValue, "types"),
  };
}

function validateActionMap(
  value: unknown,
  fieldName: string,
): Record<string, ActionDefinition> {
  const actions = requireObject(value, `Config field ${fieldName}`);

  return Object.fromEntries(
    Object.entries(actions).map(([actionId, definition]) => [
      actionId,
      validateActionDefinition(actionId, definition),
    ]),
  );
}

function validateTypeMap(
  value: unknown,
  fieldName: string,
): Record<string, TypeDefinition> {
  const types = requireObject(value, `Config field ${fieldName}`);

  return Object.fromEntries(
    Object.entries(types).map(([typeId, definition]) => [
      typeId,
      validateTypeDefinition(typeId, definition),
    ]),
  );
}

function validateActionDefinition(
  actionId: string,
  value: unknown,
): ActionDefinition {
  const definition = requireObject(value, `Action ${actionId}`);
  const title = requireNonEmptyString(
    definition.title,
    `Action ${actionId} field title`,
  );
  const mode = definition.mode;

  if (mode !== "builtin" && mode !== "command") {
    throw new Error(
      `Action ${actionId} field mode must be "builtin" or "command"`,
    );
  }

  const action: ActionDefinition = {
    title,
    mode,
  };

  if (definition.value !== undefined) {
    action.value = requireString(
      definition.value,
      `Action ${actionId} field value`,
    );
  }

  if (definition.stdin !== undefined) {
    action.stdin = requireString(
      definition.stdin,
      `Action ${actionId} field stdin`,
    );
  }

  if (definition.args !== undefined) {
    action.args = requireStringArray(
      definition.args,
      `Action ${actionId} field args`,
    );
  }

  if (definition.requires !== undefined) {
    action.requires = requireStringArray(
      definition.requires,
      `Action ${actionId} field requires`,
    );
  }

  if (definition.env !== undefined) {
    action.env = requireStringRecord(
      definition.env,
      `Action ${actionId} field env`,
    );
  }

  if (mode === "builtin") {
    action.builtin = requireBuiltinActionId(
      definition.builtin,
      `Action ${actionId} field builtin`,
    );
    return action;
  }

  action.command = requireNonEmptyString(
    definition.command,
    `Action ${actionId} field command`,
  );
  return action;
}

function validateTypeDefinition(typeId: string, value: unknown): TypeDefinition {
  const definition = requireObject(value, `Type ${typeId}`);

  return {
    extends: requireBuiltinSemanticType(
      definition.extends,
      `Type ${typeId} field extends`,
    ),
    storageRoot:
      definition.storageRoot === undefined
        ? undefined
        : requireNonEmptyString(
            definition.storageRoot,
            `Type ${typeId} field storageRoot`,
          ),
    defaultAction:
      definition.defaultAction === undefined
        ? undefined
        : requireNonEmptyString(
            definition.defaultAction,
            `Type ${typeId} field defaultAction`,
          ),
    actions: requireStringArray(
      definition.actions,
      `Type ${typeId} field actions`,
    ),
  };
}

function requireObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  return value;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }

  return [...value];
}

function requireStringRecord(
  value: unknown,
  label: string,
): Record<string, string> {
  const record = requireObject(value, label);

  return Object.fromEntries(
    Object.entries(record).map(([key, entryValue]) => [
      key,
      requireString(entryValue, `${label}.${key}`),
    ]),
  );
}

function requireBuiltinActionId(
  value: unknown,
  label: string,
): BuiltinActionId {
  if (value === undefined) {
    throw new Error(`${label} is required`);
  }

  if (
    typeof value !== "string" ||
    !BUILTIN_ACTION_IDS.includes(value as BuiltinActionId)
  ) {
    throw new Error(
      `${label} must be one of ${BUILTIN_ACTION_IDS.join(", ")}`,
    );
  }

  return value as BuiltinActionId;
}

function requireBuiltinSemanticType(
  value: unknown,
  label: string,
): BuiltinSemanticType {
  if (value === undefined) {
    throw new Error(`${label.replace(" field ", " is missing required field ")}`);
  }

  if (
    typeof value !== "string" ||
    !BUILTIN_SEMANTIC_TYPES.includes(value as BuiltinSemanticType)
  ) {
    throw new Error(
      `${label} must be one of ${BUILTIN_SEMANTIC_TYPES.join(", ")}`,
    );
  }

  return value as BuiltinSemanticType;
}
