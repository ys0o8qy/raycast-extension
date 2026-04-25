import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  open,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { ResourceFormFlow } from "./add-entry";
import { EntryDetail } from "./preview";
import { getSchemaCommandConfig, runSchemaCommand } from "./schema-command";
import { LibraryEntry } from "./types";

function primaryOpenAction(entry: LibraryEntry) {
  const url = entry.properties.URL;
  const localPath = entry.properties.PATH;

  switch (entry.type) {
    case "link":
      return url ? <Action.OpenInBrowser title="Open Link" url={url} /> : null;
    case "image":
      if (localPath) {
        return (
          <Action
            title="Open Image"
            icon={Icon.Image}
            onAction={() => open(localPath)}
          />
        );
      }
      return url ? <Action.OpenInBrowser title="Open Image" url={url} /> : null;
    case "text":
      return entry.body ? (
        <Action.Paste title="Paste Text" content={entry.body} />
      ) : null;
    case "schema":
      return schemaPrimaryAction(entry);
  }
}

function schemaPrimaryAction(entry: LibraryEntry) {
  if (!entry.body) {
    return null;
  }

  const config = getSchemaCommandConfig(entry);
  if (!config) {
    return <Action.CopyToClipboard title="Copy Schema" content={entry.body} />;
  }

  return (
    <Action
      title="Run Schema Command"
      icon={Icon.Terminal}
      onAction={async () => {
        try {
          await runSchemaCommand(entry);
          await showHUD("Schema command completed");
        } catch (error) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Schema command failed",
            message: String(error),
          });
        }
      }}
    />
  );
}

export function EntryActions(props: {
  entry: LibraryEntry;
  onChanged?: () => void;
  onReload?: () => void;
}) {
  const { entry, onChanged, onReload } = props;
  const url = entry.properties.URL;
  const localPath = entry.properties.PATH;

  return (
    <ActionPanel>
      {primaryOpenAction(entry)}
      <Action.Push
        title="Edit Resource"
        icon={Icon.Pencil}
        shortcut={{ modifiers: ["cmd"], key: "e" }}
        target={<ResourceFormFlow entry={entry} onSaved={onChanged} />}
      />
      <Action.Push
        title="Show Details"
        icon={Icon.AppWindowSidebarLeft}
        target={<EntryDetail entry={entry} />}
      />
      {entry.type === "image" && localPath ? (
        <Action.CopyToClipboard title="Copy Local Path" content={localPath} />
      ) : null}
      {url ? <Action.CopyToClipboard title="Copy URL" content={url} /> : null}
      <Action.CopyToClipboard title="Copy Title" content={entry.title} />
      {entry.type === "text" && entry.body ? (
        <Action
          title="Copy Body"
          icon={Icon.Clipboard}
          onAction={() => Clipboard.copy(entry.body)}
        />
      ) : null}
      {entry.type === "schema" && entry.body ? (
        <Action
          title="Copy Schema Body"
          icon={Icon.Clipboard}
          onAction={() => Clipboard.copy(entry.body)}
        />
      ) : null}
      {entry.type !== "link" && entry.type !== "image" && url ? (
        <Action title="Open URL" icon={Icon.Globe} onAction={() => open(url)} />
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
