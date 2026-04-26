import { List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { EntryActions } from "./actions";
import { renderEntryMarkdown } from "./preview";
import { buildRuntimeRegistry } from "./runtime";
import { loadEntries, loadRuntimeRegistry } from "./storage";

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
    <List isLoading={isLoading} searchBarPlaceholder="Browse tags...">
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
                subtitle={entry.type}
                accessories={[{ tag: entry.type }]}
                detail={
                  <List.Item.Detail markdown={renderEntryMarkdown(entry)} />
                }
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
    </List>
  );
}
