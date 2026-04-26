import {
  ActionDefinition,
  BuiltinSemanticType,
  LibraryEntry,
  ResolvedAction,
  ResourceLibraryConfig,
  RuntimeRegistry,
  TypeDefinition,
  isBuiltinEntryType,
} from "./types";
import { expandTemplate, resolveActionDefinition } from "./action-runner";

export interface RuntimeStorageInfo {
  semanticType: BuiltinSemanticType;
  storageRoot: string;
}

const BUILTIN_ACTIONS: Record<string, ActionDefinition> = {
  "open-url": {
    title: "Open URL",
    mode: "builtin",
    requires: ["url"],
    builtin: "open-in-browser",
    value: "{{url}}",
  },
  "open-path": {
    title: "Open Path",
    mode: "builtin",
    requires: ["path"],
    builtin: "open-path",
    value: "{{path}}",
  },
  "open-path-or-url": {
    title: "Open Resource",
    mode: "command",
    requires: ["path_or_url"],
    command: "open",
    args: ["{{path_or_url}}"],
  },
  "copy-body": {
    title: "Copy Body",
    mode: "builtin",
    requires: ["body"],
    builtin: "copy-to-clipboard",
    value: "{{body}}",
  },
  "paste-body": {
    title: "Paste Body",
    mode: "builtin",
    requires: ["body"],
    builtin: "paste-to-frontmost-app",
    value: "{{body}}",
  },
  "show-detail": {
    title: "Show Details",
    mode: "builtin",
    builtin: "show-detail",
  },
};

const BUILTIN_TYPES: Record<string, TypeDefinition> = {
  link: {
    extends: "builtin:link",
    defaultAction: "open-url",
    actions: ["open-url", "show-detail"],
  },
  image: {
    extends: "builtin:asset",
    defaultAction: "open-path-or-url",
    actions: ["open-path-or-url", "show-detail"],
  },
  text: {
    extends: "builtin:text",
    defaultAction: "paste-body",
    actions: ["paste-body", "copy-body", "show-detail"],
  },
  schema: {
    extends: "builtin:schema",
    defaultAction: "copy-body",
    actions: ["copy-body", "show-detail"],
  },
  generic: {
    extends: "builtin:generic",
    defaultAction: "show-detail",
    actions: ["show-detail", "copy-body"],
  },
};

const DEFAULT_STORAGE_ROOTS: Record<BuiltinSemanticType, string> = {
  "builtin:link": "Links",
  "builtin:asset": "Images",
  "builtin:text": "Text",
  "builtin:file": "Files",
  "builtin:directory": "Directories",
  "builtin:schema": "Schemas",
  "builtin:generic": "Other",
};

interface RuntimeRegistryRecords {
  actions: Record<string, ActionDefinition>;
  types: Record<string, TypeDefinition>;
}

export function buildRuntimeRegistry(
  config: ResourceLibraryConfig,
): RuntimeRegistry {
  const actions: Record<string, ActionDefinition> = {
    ...BUILTIN_ACTIONS,
    ...config.actions,
  };
  const types: Record<string, TypeDefinition> = {
    ...BUILTIN_TYPES,
    ...config.types,
  };

  for (const [typeId, definition] of Object.entries(types)) {
    if (
      definition.defaultAction &&
      actions[definition.defaultAction] === undefined
    ) {
      throw new Error(
        `Unknown default action referenced by type ${typeId}: ${definition.defaultAction}`,
      );
    }

    if (
      definition.defaultAction &&
      !definition.actions.includes(definition.defaultAction)
    ) {
      throw new Error(
        `Default action for type ${typeId} must be included in actions: ${definition.defaultAction}`,
      );
    }

    for (const actionId of definition.actions) {
      if (actions[actionId] === undefined) {
        throw new Error(`Unknown action referenced by type ${typeId}: ${actionId}`);
      }
    }
  }

  return {
    actions,
    types,
  };
}

export function getRuntimeTypeIds(registry: RuntimeRegistry): string[] {
  return Object.keys(getRuntimeRegistryRecords(registry).types);
}

export function getRuntimeTypeDefinition(
  registry: RuntimeRegistry,
  entryType: string,
): TypeDefinition {
  const { types } = getRuntimeRegistryRecords(registry);
  return types[entryType] ?? getGenericRuntimeType(types);
}

export function resolveRuntimeStorageInfo(
  registry: RuntimeRegistry,
  entryType: string,
): RuntimeStorageInfo {
  const typeDefinition = getRuntimeTypeDefinition(registry, entryType);

  return {
    semanticType: typeDefinition.extends,
    storageRoot:
      typeDefinition.storageRoot ??
      DEFAULT_STORAGE_ROOTS[typeDefinition.extends],
  };
}

export function assertRuntimeTypeAvailableForUpdate(
  registry: RuntimeRegistry,
  entryType: string,
): void {
  const { types } = getRuntimeRegistryRecords(registry);
  if (isBuiltinEntryType(entryType) || types[entryType] !== undefined) {
    return;
  }

  throw new Error(
    `Cannot update entry with unknown runtime type "${entryType}". Restore this type in your resource library config before editing the entry.`,
  );
}

export function resolveEntryActions(
  registry: RuntimeRegistry,
  entry: LibraryEntry,
): ResolvedAction[] {
  const typeDefinition = getRuntimeTypeDefinition(registry, entry.type);
  return typeDefinition.actions
    .map((actionId) => resolveActionRecordById(registry, entry, actionId))
    .filter(({ definition }) => isActionDefinitionAvailable(definition, entry))
    .map(({ action }) => action);
}

export function resolveDefaultActionForEntry(
  registry: RuntimeRegistry,
  entry: LibraryEntry,
): ResolvedAction | undefined {
  const typeDefinition = getRuntimeTypeDefinition(registry, entry.type);
  const orderedActionIds = typeDefinition.defaultAction
    ? [
        typeDefinition.defaultAction,
        ...typeDefinition.actions.filter(
          (actionId) => actionId !== typeDefinition.defaultAction,
        ),
      ]
    : typeDefinition.actions;

  for (const actionId of orderedActionIds) {
    const record = resolveActionRecordById(registry, entry, actionId);
    if (isActionDefinitionAvailable(record.definition, entry)) {
      return record.action;
    }
  }

  return undefined;
}

function resolveActionById(
  registry: RuntimeRegistry,
  entry: LibraryEntry,
  actionId: string,
): ResolvedAction {
  return resolveActionRecordById(registry, entry, actionId).action;
}

function resolveActionRecordById(
  registry: RuntimeRegistry,
  entry: LibraryEntry,
  actionId: string,
): { action: ResolvedAction; definition: ActionDefinition } {
  const { actions } = getRuntimeRegistryRecords(registry);
  const definition = actions[actionId];
  if (!definition) {
    throw new Error(`Unknown action referenced at runtime: ${actionId}`);
  }

  return {
    action: resolveActionDefinition(actionId, definition, entry),
    definition,
  };
}

function getRuntimeRegistryRecords(
  registry: RuntimeRegistry,
): RuntimeRegistryRecords {
  return {
    actions: {
      ...BUILTIN_ACTIONS,
      ...recordFromMaybeMap<ActionDefinition>(
        (registry as { actions?: unknown }).actions,
      ),
    },
    types: {
      ...BUILTIN_TYPES,
      ...recordFromMaybeMap<TypeDefinition>(
        (registry as { types?: unknown }).types,
      ),
    },
  };
}

function recordFromMaybeMap<T>(value: unknown): Record<string, T> {
  if (value instanceof Map) {
    return Object.fromEntries(value) as Record<string, T>;
  }

  if (value && typeof value === "object") {
    return value as Record<string, T>;
  }

  return {};
}

function getGenericRuntimeType(
  types: Record<string, TypeDefinition>,
): TypeDefinition {
  const generic = types.generic;
  if (!generic) {
    throw new Error("Runtime registry is missing the generic type definition");
  }

  return generic;
}

function isActionDefinitionAvailable(
  definition: ActionDefinition,
  entry: LibraryEntry,
): boolean {
  return (definition.requires ?? []).every((requirement) =>
    expandTemplate(`{{${requirement}}}`, entry).trim().length > 0,
  );
}
