import { List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { EntryActions } from "./actions";
import { renderEntryMarkdown } from "./preview";
import { loadEntries } from "./storage";

export default function BrowseGroupsCommand() {
  const { data, isLoading } = useCachedPromise(loadEntries);
  const groups = Array.from(new Set((data ?? []).map((entry) => entry.groupLabel))).sort((a, b) => a.localeCompare(b));

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Browse groups...">
      {groups.map((group) => {
        const entries = (data ?? []).filter((entry) => entry.groupLabel === group);
        return (
          <List.Section key={group} title={group} subtitle={`${entries.length}`}>
            {entries.map((entry) => (
              <List.Item
                key={entry.id}
                title={entry.title}
                subtitle={entry.type}
                accessories={entry.tags.map((tag) => ({ tag }))}
                detail={<List.Item.Detail markdown={renderEntryMarkdown(entry)} />}
                actions={<EntryActions entry={entry} />}
              />
            ))}
          </List.Section>
        );
      })}
    </List>
  );
}
