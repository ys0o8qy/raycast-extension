import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { EntryActions } from "./actions";
import { renderEntryMarkdown } from "./preview";
import { filterEntriesBySearch } from "./resource";
import { loadEntries } from "./storage";
import { EntryType, LibraryEntry } from "./types";

export default function SearchLibraryCommand() {
  const { data = [], isLoading, revalidate } = useCachedPromise(loadEntries);
  const [searchText, setSearchText] = useState("");
  const entries = filterEntriesBySearch(data, searchText);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Search entries, e.g. #docs #raycast keyboard"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      throttle
    >
      {entries.map((entry) => (
        <List.Item
          key={entry.id}
          title={entry.title}
          accessories={entry.tags.slice(0, 4).map((tag) => ({ tag }))}
          icon={iconForType(entry.type)}
          detail={
            <List.Item.Detail
              markdown={renderEntryMarkdown(entry)}
              metadata={<Metadata entry={entry} />}
            />
          }
          actions={
            <ActionPanel>
              <EntryActions entry={entry} onChanged={revalidate} />
              <Action
                title="Reload"
                icon={Icon.ArrowClockwise}
                onAction={revalidate}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function iconForType(type: EntryType): Icon {
  switch (type) {
    case "link":
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
  const metadataEntries = Object.entries(entry.properties).filter(
    ([key]) => key !== "FORMAT" && key !== "DESCRIPTION",
  );

  return (
    <List.Item.Detail.Metadata>
      {entry.tags.length > 0 ? (
        <List.Item.Detail.Metadata.TagList title="Tags">
          {entry.tags.map((tag) => (
            <List.Item.Detail.Metadata.TagList.Item key={tag} text={tag} />
          ))}
        </List.Item.Detail.Metadata.TagList>
      ) : null}
      {metadataEntries.map(([key, value]) => (
        <List.Item.Detail.Metadata.Label key={key} title={key} text={value} />
      ))}
    </List.Item.Detail.Metadata>
  );
}
