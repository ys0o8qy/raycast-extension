import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { EntryActions } from "./actions";
import { ResourceFormFlow } from "./add-entry";
import { buildCompactResourceSubtitle, iconForType } from "./list-helpers";
import { ResourceDetail } from "./resource-detail";
import { filterEntriesBySearch } from "./resource";
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
  const [showDetail, setShowDetail] = useState(true);
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
      isShowingDetail={showDetail}
      searchBarPlaceholder="Search resources, e.g. #docs #raycast keyboard"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      throttle
      actions={
        <ActionPanel>
          <Action
            title={showDetail ? "Compact View" : "Detail View"}
            icon={showDetail ? Icon.List : Icon.AppWindowSidebarLeft}
            shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
            onAction={() => setShowDetail(!showDetail)}
          />
        </ActionPanel>
      }
    >
      {entries.map((entry) => (
        <List.Item
          key={entry.id}
          title={entry.title}
          icon={iconForType(entry.type)}
          subtitle={buildCompactResourceSubtitle(entry)}
          {...(showDetail
            ? {
                detail: (
                  <ResourceDetail
                    entry={entry}
                    projects={entryProjects.get(entry.id) ?? []}
                  />
                ),
              }
            : {})}
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
      {entries.length === 0 ? (
        <SearchEmptyView
          hasResources={data.length > 0}
          searchText={searchText}
          onSaved={revalidate}
          showDetail={showDetail}
          onToggleDetail={() => setShowDetail(!showDetail)}
        />
      ) : null}
    </List>
  );
}

function SearchEmptyView(props: {
  hasResources: boolean;
  searchText: string;
  onSaved: () => void;
  showDetail: boolean;
  onToggleDetail: () => void;
}) {
  const { hasResources, searchText, onSaved, showDetail, onToggleDetail } = props;
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
          <Action
            title={showDetail ? "Compact View" : "Detail View"}
            icon={showDetail ? Icon.List : Icon.AppWindowSidebarLeft}
            shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
            onAction={onToggleDetail}
          />
        </ActionPanel>
      }
    />
  );
}
