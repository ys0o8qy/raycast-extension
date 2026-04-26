import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  open,
  showToast,
  Toast,
} from "@raycast/api";
import { ResourceFormFlow } from "./add-entry";
import { runAction } from "./action-runner";
import { resolveEntryActionsState } from "./entry-actions-state";
import { EntryDetail } from "./preview";
import { buildRuntimeRegistry } from "./runtime";
import { LibraryEntry, ResolvedAction, RuntimeRegistry } from "./types";

const FALLBACK_RUNTIME_REGISTRY = buildRuntimeRegistry({
  version: 1,
  actions: {},
  types: {},
});

export function EntryActions(props: {
  entry?: LibraryEntry;
  runtimeRegistry?: RuntimeRegistry;
  onChanged?: () => void;
  onReload?: () => void;
}) {
  const { entry, runtimeRegistry, onChanged, onReload } = props ?? {};
  const {
    showDetailsIsPrimary,
    resolvedActions,
    url,
    localPath,
  } = resolveEntryActionsState(
    runtimeRegistry ?? FALLBACK_RUNTIME_REGISTRY,
    entry,
  );

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
      {entry && showDetailsIsPrimary ? (
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
      {entry && !showDetailsIsPrimary ? (
        <Action.Push
          title="Show Details"
          icon={Icon.AppWindowSidebarLeft}
          target={<EntryDetail entry={entry} />}
        />
      ) : null}
      {entry ? (
        <Action.Push
          title="Edit Resource"
          icon={Icon.Pencil}
          shortcut={{ modifiers: ["cmd"], key: "e" }}
          target={<ResourceFormFlow entry={entry} onSaved={onChanged} />}
        />
      ) : null}
      {localPath ? (
        <Action.CopyToClipboard title="Copy Local Path" content={localPath} />
      ) : null}
      {url ? <Action.CopyToClipboard title="Copy URL" content={url} /> : null}
      {entry ? (
        <Action.CopyToClipboard title="Copy Title" content={entry.title} />
      ) : null}
      {entry?.body ? (
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
