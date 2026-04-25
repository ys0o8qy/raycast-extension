import { Action, ActionPanel, Clipboard, Icon, open } from "@raycast/api";
import { ResourceFormFlow } from "./add-entry";
import { EntryDetail } from "./preview";
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
        <Action.CopyToClipboard title="Copy Text" content={entry.body} />
      ) : null;
    case "schema":
      return entry.body ? (
        <Action.CopyToClipboard title="Copy Schema" content={entry.body} />
      ) : null;
  }
}

export function EntryActions(props: {
  entry: LibraryEntry;
  onChanged?: () => void;
}) {
  const { entry, onChanged } = props;
  const url = entry.properties.URL;
  const localPath = entry.properties.PATH;

  return (
    <ActionPanel>
      {primaryOpenAction(entry)}
      <Action.Push
        title="Edit Resource"
        icon={Icon.Pencil}
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
    </ActionPanel>
  );
}
