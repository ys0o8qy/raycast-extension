import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { EntryActions } from "./actions";
import { ResourceFormFlow } from "./add-entry";
import AutoTagResourcesCommand from "./auto-tag-resources";
import { buildCompactResourceSubtitle, iconForType } from "./list-helpers";
import { ResourceDetail } from "./resource-detail";
import { buildRuntimeRegistry } from "./runtime";
import { loadEntries, loadRuntimeRegistry } from "./storage";
import TagGovernanceCommand from "./tag-governance";

const FALLBACK_RUNTIME_REGISTRY = buildRuntimeRegistry({
  version: 1,
  actions: {},
  types: {},
});

export default function BrowseTagsCommand() {
  const { data, isLoading } = useCachedPromise(loadEntries);
  const { data: runtimeRegistry = FALLBACK_RUNTIME_REGISTRY } =
    useCachedPromise(loadRuntimeRegistry);
  const tags = Array.from(
    new Set((data ?? []).flatMap((entry) => entry.tags)),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Browse tags..."
      actions={<TagCenterActions />}
    >
      {tags.map((tag) => {
        const entries = (data ?? []).filter((entry) =>
          entry.tags.includes(tag),
        );
        return (
          <List.Section
            key={tag}
            title={`#${tag}`}
            subtitle={`${entries.length}`}
          >
            {entries.map((entry) => (
              <List.Item
                key={entry.id}
                title={entry.title}
                icon={iconForType(entry.type)}
                subtitle={buildCompactResourceSubtitle(entry)}
                detail={<ResourceDetail entry={entry} />}
                actions={
                  <EntryActions
                    entry={entry}
                    runtimeRegistry={runtimeRegistry}
                  />
                }
              />
            ))}
          </List.Section>
        );
      })}
      {tags.length === 0 ? (
        <List.EmptyView
          title="No tags yet"
          description="Add resource tags manually or generate suggestions with Auto-Tag Resources"
          icon={Icon.Tag}
          actions={<TagCenterActions />}
        />
      ) : null}
    </List>
  );
}

function TagCenterActions() {
  return (
    <ActionPanel>
      <Action.Push
        title="Add Resource"
        icon={Icon.Plus}
        target={<ResourceFormFlow />}
      />
      <Action.Push
        title="Auto-Tag Resources"
        icon={Icon.Stars}
        target={<AutoTagResourcesCommand />}
      />
      <Action.Push
        title="Tag Governance"
        icon={Icon.Tag}
        target={<TagGovernanceCommand />}
      />
    </ActionPanel>
  );
}
