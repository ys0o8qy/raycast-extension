import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { EntryActions } from "./actions";
import { renderEntryMarkdown } from "./preview";
import { loadEntries } from "./storage";
import { EntryType, LibraryEntry } from "./types";

export default function SearchLibraryCommand() {
  const { data = [], isLoading, revalidate } = useCachedPromise(loadEntries);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search library entries..." throttle>
      {data.map((entry) => (
        <List.Item
          key={entry.id}
          title={entry.title}
          subtitle={entry.groupLabel}
          accessories={[
            { tag: entry.type },
            ...(entry.tags.length > 0 ? [{ tag: entry.tags.join(", ") }] : []),
          ]}
          icon={iconForType(entry.type)}
          detail={<List.Item.Detail markdown={renderEntryMarkdown(entry)} metadata={<Metadata entry={entry} />} />}
          actions={
            <ActionPanel>
              <EntryActions entry={entry} />
              <Action title="Reload" icon={Icon.ArrowClockwise} onAction={revalidate} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function iconForType(type: EntryType): Icon {
  switch (type) {
    case "bookmark":
      return Icon.Link;
    case "image":
      return Icon.Image;
    case "text":
      return Icon.Document;
    case "schema":
      return Icon.Code;
  }
}

function Metadata(props: { entry: LibraryEntry }) {
  const { entry } = props;
  const metadataEntries = Object.entries(entry.properties).filter(([key]) => key !== "FORMAT");

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Type" text={entry.type} />
      <List.Item.Detail.Metadata.Label title="Group" text={entry.groupLabel} />
      <List.Item.Detail.Metadata.TagList title="Tags">
        {entry.tags.map((tag) => (
          <List.Item.Detail.Metadata.TagList.Item key={tag} text={tag} />
        ))}
      </List.Item.Detail.Metadata.TagList>
      {metadataEntries.map(([key, value]) => (
        <List.Item.Detail.Metadata.Label key={key} title={key} text={value} />
      ))}
    </List.Item.Detail.Metadata>
  );
}
