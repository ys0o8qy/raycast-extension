import { resolveSchemaCommandAction } from "./action-runner";
import { orderResolvedActionsForDisplay } from "./resource";
import {
  resolveDefaultActionForEntry,
  resolveEntryActions,
} from "./runtime";
import { LibraryEntry, ResolvedAction, RuntimeRegistry } from "./types";

export interface EntryActionsState {
  showDetailsIsPrimary: boolean;
  resolvedActions: ResolvedAction[];
  url: string | undefined;
  localPath: string | undefined;
}

export function getEmptyEntryActionsState(): EntryActionsState {
  return {
    showDetailsIsPrimary: false,
    resolvedActions: [],
    url: undefined,
    localPath: undefined,
  };
}

export function resolveEntryActionsState(
  runtimeRegistry: RuntimeRegistry,
  entry?: LibraryEntry,
): EntryActionsState {
  if (!entry) {
    return getEmptyEntryActionsState();
  }

  const defaultAction = resolveDefaultActionForEntry(runtimeRegistry, entry);
  const schemaCompatAction =
    entry.type === "schema" ? resolveSchemaCommandAction(entry) : undefined;
  const orderedRuntimeActions = orderResolvedActionsForDisplay(
    resolveEntryActions(runtimeRegistry, entry),
    defaultAction,
    { leadingAction: schemaCompatAction },
  );
  const showDetailsIsPrimary =
    orderedRuntimeActions[0] !== undefined &&
    isShowDetailAction(orderedRuntimeActions[0]);

  return {
    showDetailsIsPrimary,
    resolvedActions: orderedRuntimeActions.filter(
      (action) => !isShowDetailAction(action),
    ),
    url: entry.properties.URL,
    localPath: entry.properties.PATH,
  };
}

function isShowDetailAction(action: ResolvedAction): boolean {
  return action.mode === "builtin" && action.builtin === "show-detail";
}
