import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  open,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { ResourceFormFlow } from "./add-entry";
import { resolveSchemaCommandAction, runAction } from "./action-runner";
import { EntryDetail } from "./preview";
import { orderResolvedActionsForDisplay } from "./resource";
import { loadRuntimeRegistry } from "./storage";
import {
  buildRuntimeRegistry,
  resolveDefaultActionForEntry,
  resolveEntryActions,
} from "./runtime";
import { LibraryEntry, ResolvedAction } from "./types";

const FALLBACK_RUNTIME_REGISTRY = buildRuntimeRegistry({
  version: 1,
  actions: {},
  types: {},
});

export function EntryActions(props: {
  entry: LibraryEntry;
  onChanged?: () => void;
  onReload?: () => void;
}) {
  const { entry, onChanged, onReload } = props;
  const { data: runtimeRegistry = FALLBACK_RUNTIME_REGISTRY } =
    useCachedPromise(loadRuntimeRegistry);
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
  const resolvedActions = orderedRuntimeActions.filter(
    (action) => !isShowDetailAction(action),
  );
  const url = entry.properties.URL;
  const localPath = entry.properties.PATH;

  async function handleResolvedAction(action: ResolvedAction) {
    try {
      await runAction(action, {
        builtins: {
          "copy-to-clipboard": (value) => Clipboard.copy(value),
          "open-in-browser": (value) => open(value),
          "open-path": (value) => open(value),
          "paste-to-frontmost-app": (value) => Clipboard.paste(value),
          "show-detail": () => undefined,
        },
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Failed to ${action.title.toLowerCase()}`,
        message: String(error),
      });
    }
  }

  return (
    <ActionPanel>
      {showDetailsIsPrimary ? (
        <Action.Push
          title="Show Details"
          icon={Icon.AppWindowSidebarLeft}
          target={<EntryDetail entry={entry} />}
        />
      ) : null}
      {resolvedActions.map((action) => (
        <Action
          key={action.id}
          title={action.title}
          icon={getActionIcon(action)}
          onAction={() => handleResolvedAction(action)}
        />
      ))}
      {!showDetailsIsPrimary ? (
        <Action.Push
          title="Show Details"
          icon={Icon.AppWindowSidebarLeft}
          target={<EntryDetail entry={entry} />}
        />
      ) : null}
      <Action.Push
        title="Edit Resource"
        icon={Icon.Pencil}
        shortcut={{ modifiers: ["cmd"], key: "e" }}
        target={<ResourceFormFlow entry={entry} onSaved={onChanged} />}
      />
      {localPath ? (
        <Action.CopyToClipboard title="Copy Local Path" content={localPath} />
      ) : null}
      {url ? <Action.CopyToClipboard title="Copy URL" content={url} /> : null}
      <Action.CopyToClipboard title="Copy Title" content={entry.title} />
      {entry.body ? (
        <Action.CopyToClipboard title="Copy Body" content={entry.body} />
      ) : null}
      {onReload ? (
        <Action
          title="Reload Resources"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
          onAction={onReload}
        />
      ) : null}
    </ActionPanel>
  );
}

function isShowDetailAction(action: ResolvedAction): boolean {
  return action.mode === "builtin" && action.builtin === "show-detail";
}

function getActionIcon(action: ResolvedAction): Icon {
  if (action.mode === "command") {
    return Icon.Terminal;
  }

  switch (action.builtin) {
    case "copy-to-clipboard":
      return Icon.Clipboard;
    case "open-in-browser":
      return Icon.Globe;
    case "open-path":
      return Icon.Folder;
    case "paste-to-frontmost-app":
      return Icon.TextCursor;
    case "show-detail":
      return Icon.AppWindowSidebarLeft;
  }
}
