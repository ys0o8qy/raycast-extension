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

/**
 * Calculate the maximum number of tags to display based on title length.
 * Prevents UI crowding when titles are long or there are many tags.
 */
function getMaxVisibleTags(title: string, totalTags: number): number {
  if (totalTags === 0) return 0;

  // Base calculation on title length to prevent overflow
  const titleLength = title.length;

  if (titleLength <= 20) {
    return Math.min(totalTags, 4);
  } else if (titleLength <= 40) {
    return Math.min(totalTags, 3);
  } else if (titleLength <= 60) {
    return Math.min(totalTags, 2);
  } else {
    return Math.min(totalTags, 1);
  }
}

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
      {entries.map((entry) => {
        const maxTags = getMaxVisibleTags(entry.title, entry.tags.length);
        const visibleTags = entry.tags.slice(0, maxTags);
        const hiddenCount = entry.tags.length - maxTags;

        return (
          <List.Item
            key={entry.id}
            title={entry.title}
            accessories={[
              ...visibleTags.map((tag) => ({ tag })),
              ...(hiddenCount > 0 ? [{ text: `+${hiddenCount}` }] : []),
            ]}
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
        );
      })}
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

  // Display key properties in a structured order
  const url = entry.properties.URL;
  const path = entry.properties.PATH;
  const schemaKind = entry.properties.SCHEMA_KIND;

  // Get remaining properties excluding well-known ones
  const otherProperties = Object.entries(entry.properties).filter(
    ([key]) =>
      key !== "FORMAT" &&
      key !== "DESCRIPTION" &&
      key !== "URL" &&
      key !== "PATH" &&
      key !== "SCHEMA_KIND",
  );

  return (
    <List.Item.Detail.Metadata>
      {entry.tags.length > 0 && (
        <List.Item.Detail.Metadata.TagList title="Tags">
          {entry.tags.map((tag) => (
            <List.Item.Detail.Metadata.TagList.Item key={tag} text={tag} />
          ))}
        </List.Item.Detail.Metadata.TagList>
      )}

      <List.Item.Detail.Metadata.Label title="Type" text={entry.type} />

      {url && (
        <List.Item.Detail.Metadata.Link
          title="URL"
          text={url}
          target={url}
        />
      )}

      {path && (
        <List.Item.Detail.Metadata.Label title="Path" text={path} />
      )}

      {schemaKind && (
        <List.Item.Detail.Metadata.Label title="Schema Kind" text={schemaKind} />
      )}

      {otherProperties.map(([key, value]) => (
        <List.Item.Detail.Metadata.Label key={key} title={key} text={value} />
      ))}
    </List.Item.Detail.Metadata>
  );
}
