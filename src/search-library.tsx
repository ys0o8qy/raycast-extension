import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { EntryActions } from "./actions";
import { ResourceFormFlow } from "./add-entry";
import { buildCompactResourceSubtitle, iconForType } from "./list-helpers";
import { ResourceDetail } from "./resource-detail";
import { filterEntriesBySearch, sortEntries, SortOption } from "./resource";
import { buildRuntimeRegistry } from "./runtime";
import { loadProjectData } from "./projects/storage";
import { loadEntries, loadRuntimeRegistry } from "./storage";

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
  const [sortOption, setSortOption] = useState<SortOption>("updated");
  const entries = filterEntriesBySearch(data, searchText);
  const sortedEntries = sortEntries(entries, sortOption);

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
      searchBarAccessory={
        <List.Dropdown tooltip="Sort by" value={sortOption} onChange={(v) => setSortOption(v as SortOption)}>
          <List.Dropdown.Item value="updated" title="Recently Updated" />
          <List.Dropdown.Item value="title" title="Title A-Z" />
          <List.Dropdown.Item value="type" title="Type" />
          <List.Dropdown.Item value="created" title="Recently Created" />
        </List.Dropdown>
      }
    >
      {sortedEntries.map((entry) => (
        <List.Item
          key={entry.id}
          title={entry.title}
          icon={iconForType(entry.type)}
          subtitle={buildCompactResourceSubtitle(entry)}
          detail={
            <ResourceDetail
              entry={entry}
              projects={entryProjects.get(entry.id) ?? []}
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
      {sortedEntries.length === 0 ? (
        <SearchEmptyView
          hasResources={data.length > 0}
          searchText={searchText}
          onSaved={revalidate}
        />
      ) : null}
    </List>
  );
}

function SearchEmptyView(props: {
  hasResources: boolean;
  searchText: string;
  onSaved: () => void;
}) {
  const { hasResources, searchText, onSaved } = props;
  return (
    <List.EmptyView
      title={hasResources ? "No matching resources" : "No resources yet"}
      description={
        hasResources
          ? "Try a different keyword or #tag filter"
          : "Add your first link, note, schema, or file reference"
      }
      icon={hasResources ? Icon.MagnifyingGlass : Icon.PlusCircle}
      actions={
        <ActionPanel>
          <Action.Push
            title="Add Resource"
            icon={Icon.Plus}
            target={
              <ResourceFormFlow
                onSaved={async () => {
                  onSaved();
                }}
              />
            }
          />
          {searchText.trim() ? (
            <Action.CopyToClipboard
              title="Copy Search Text"
              content={searchText.trim()}
            />
          ) : null}
        </ActionPanel>
      }
    />
  );
}
