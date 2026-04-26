import { Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { EntryActions } from "./actions";
import { renderEntryMarkdown } from "./preview";
import { filterEntriesBySearch } from "./resource";
import { buildRuntimeRegistry } from "./runtime";
import { loadEntries, loadRuntimeRegistry } from "./storage";
import { LibraryEntry } from "./types";

const FALLBACK_RUNTIME_REGISTRY = buildRuntimeRegistry({
  version: 1,
  actions: {},
  types: {},
});

export default function SearchLibraryCommand() {
  const { data = [], isLoading, revalidate } = useCachedPromise(loadEntries);
  const { data: runtimeRegistry = FALLBACK_RUNTIME_REGISTRY } =
    useCachedPromise(loadRuntimeRegistry);
  const [searchText, setSearchText] = useState("");
  const entries = filterEntriesBySearch(data, searchText);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Search resources, e.g. #docs #raycast keyboard"
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
            <EntryActions
              entry={entry}
              runtimeRegistry={runtimeRegistry}
              onChanged={revalidate}
              onReload={revalidate}
            />
          }
        />
      ))}
    </List>
  );
}

function iconForType(type: LibraryEntry["type"]): Icon {
  switch (type) {
    case "link":
      return Icon.Link;
    case "image":
      return Icon.Image;
    case "text":
      return Icon.Document;
    case "schema":
      return Icon.Code;
    default:
      return Icon.Document;
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
