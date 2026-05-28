import { List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { EntryActions } from "./actions";
import { buildSubtitle, buildTagAccessories, iconForType } from "./list-helpers";
import { renderEntryMarkdown } from "./preview";
import { filterEntriesBySearch } from "./resource";
import { buildRuntimeRegistry } from "./runtime";
import { loadProjectData } from "./projects/storage";
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
  const { data: projectData = { projects: [], memberships: [] } } =
    useCachedPromise(loadProjectData);
  const [searchText, setSearchText] = useState("");
  const entries = filterEntriesBySearch(data, searchText);

  // Build a map of entry ID → project titles for project context display
  const entryProjects = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of projectData?.memberships ?? []) {
      const project = projectData?.projects?.find(
        (p) => p.id === m.projectId && p.status !== "archived",
      );
      if (!project) continue;
      const titles = map.get(m.entryId) ?? [];
      titles.push(project.title);
      map.set(m.entryId, titles);
    }
    return map;
  }, [projectData]);

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
          icon={iconForType(entry.type)}
          subtitle={buildSubtitle(entry)}
          accessories={buildTagAccessories(entry.tags)}
          detail={
            <List.Item.Detail
              markdown={renderEntryMarkdown(entry)}
              metadata={
                <Metadata
                  entry={entry}
                  projects={entryProjects.get(entry.id) ?? []}
                />
              }
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

// ── Metadata ─────────────────────────────────────────────────────

function Metadata(props: { entry: LibraryEntry; projects: string[] }) {
  const { entry, projects } = props;

  const url = entry.properties.URL;
  const path = entry.properties.PATH;
  const schemaKind = entry.properties.SCHEMA_KIND;

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
      {projects.length > 0 ? (
        <List.Item.Detail.Metadata.TagList title="Projects">
          {projects.map((name) => (
            <List.Item.Detail.Metadata.TagList.Item
              key={name}
              text={name}
              color="blue"
            />
          ))}
        </List.Item.Detail.Metadata.TagList>
      ) : null}

      {entry.tags.length > 0 ? (
        <List.Item.Detail.Metadata.TagList title="Tags">
          {entry.tags.map((tag) => (
            <List.Item.Detail.Metadata.TagList.Item
              key={tag}
              text={tag}
            />
          ))}
        </List.Item.Detail.Metadata.TagList>
      ) : null}

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
        <List.Item.Detail.Metadata.Label
          title="Schema Kind"
          text={schemaKind}
        />
      )}

      {otherProperties.map(([key, value]) => (
        <List.Item.Detail.Metadata.Label key={key} title={key} text={value} />
      ))}
    </List.Item.Detail.Metadata>
  );
}
