import { Action, ActionPanel, Color, Form, Icon, List, showHUD, showToast, Toast, useNavigation } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { EntryActions } from "./actions";
import { ResourceFormFlow } from "./add-entry";
import AutoTagResourcesCommand from "./auto-tag-resources";
import { buildCompactResourceSubtitle, iconForType } from "./list-helpers";
import { ResourceDetail } from "./resource-detail";
import { buildRuntimeRegistry } from "./runtime";
import { loadEntries, loadRuntimeRegistry, updateEntry } from "./storage";
import { LibraryEntry, NewEntryInput } from "./types";
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
            <List.Item
              key={`${tag}--header`}
              title={`#${tag}`}
              subtitle={`${entries.length} resource${entries.length === 1 ? "" : "s"} — Click for options`}
              icon={{ source: Icon.Tag, tintColor: Color.Blue }}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Rename Tag"
                    icon={Icon.Pencil}
                    target={
                      <TagRenameForm
                        tag={tag}
                        entries={data ?? []}
                      />
                    }
                  />
                  <Action.Push
                    title="View in Governance"
                    icon={Icon.Gear}
                    target={<TagGovernanceCommand />}
                  />
                  <Action.CopyToClipboard
                    title="Copy Tag Name"
                    content={tag}
                  />
                </ActionPanel>
              }
            />
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

function TagRenameForm(props: { tag: string; entries: LibraryEntry[] }) {
  const { tag, entries } = props;
  const { pop } = useNavigation();
  const entriesWithTag = entries.filter((e) => e.tags.includes(tag));

  async function handleSubmit(values: { newName: string }) {
    const newName = values.newName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!newName) {
      await showToast({ style: Toast.Style.Failure, title: "Tag name is required" });
      return;
    }
    if (newName === tag) {
      pop();
      return;
    }

    let updated = 0;
    for (const entry of entriesWithTag) {
      const newTags = entry.tags.map((t) => (t === tag ? newName : t));
      const input: NewEntryInput = {
        title: entry.title,
        type: entry.type,
        tags: newTags,
        groupPath: [],
        url: entry.properties.URL,
        path: entry.properties.PATH,
        schemaKind: entry.properties.SCHEMA_KIND,
        schemaCommand: entry.properties.SCHEMA_COMMAND,
        schemaArgs: entry.properties.SCHEMA_ARGS,
        body: entry.body,
      };
      try {
        await updateEntry(entry.id, input);
        updated++;
      } catch {
        // continue
      }
    }
    await showHUD(`Renamed tag #${tag} → #${newName} (${updated} resources)`);
    pop();
  }

  return (
    <Form
      navigationTitle={`Rename Tag #${tag}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Rename Tag" icon={Icon.Pencil} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Current Tag"
        text={`#${tag} — used by ${entriesWithTag.length} resource${entriesWithTag.length === 1 ? "" : "s"}`}
      />
      <Form.TextField
        id="newName"
        title="New Name"
        placeholder="new-tag-name"
        defaultValue={tag}
        autoFocus
      />
    </Form>
  );
}
