import {
  Action,
  ActionPanel,
  Icon,
  List,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { suggestTagsBatch } from "./ai-tag-suggest";
import { log } from "./logger";
import { renderEntryMarkdown } from "./preview";
import { getAllTags } from "./resource";
import { loadEntries, updateEntry } from "./storage";
import { LibraryEntry, NewEntryInput } from "./types";

export default function AutoTagResourcesCommand() {
  const { data = [], isLoading, revalidate } =
    useCachedPromise(loadEntries);

  // Sort: fewest tags first (users want to tag untagged/slightly-tagged resources)
  const sorted = [...data].sort(
    (a, b) => a.tags.length - b.tags.length,
  );

  return (
    <AutoTagFlow
      entries={sorted}
      isLoading={isLoading}
      onChanged={revalidate}
    />
  );
}

type FlowPhase = "select" | "processing" | "preview" | "saving" | "done";

function AutoTagFlow(props: {
  entries: LibraryEntry[];
  isLoading: boolean;
  onChanged: () => void;
}) {
  const { entries, isLoading, onChanged } = props;
  const existingTags = getAllTags(entries);

  // Batch selection
  const [batch, setBatch] = useState<LibraryEntry[]>([]);

  // Processing
  const [phase, setPhase] = useState<FlowPhase>("select");

  // Results: resource index → suggested tags
  const [results, setResults] = useState<Map<number, string[]>>(new Map());

  // Editable preview: track tag edits per resource index
  const [editedTags, setEditedTags] = useState<Map<number, string[]>>(new Map());

  function addToBatch(entry: LibraryEntry) {
    setBatch((prev) => {
      if (prev.some((e) => e.id === entry.id)) return prev;
      return [...prev, entry];
    });
  }

  function removeFromBatch(entry: LibraryEntry) {
    setBatch((prev) => prev.filter((e) => e.id !== entry.id));
  }

  function clearBatch() {
    setBatch([]);
  }

  async function startProcessing() {
    setPhase("processing");
    const resources = batch.map((e) => ({
      title: e.title,
      content: e.body || e.properties.URL || e.properties.PATH || "",
    }));

    const batchResults = await suggestTagsBatch(resources, existingTags);

    // Build editable copy: filter out already-existing tags per resource
    const editable = new Map<number, string[]>();
    for (const [idx, tags] of batchResults) {
      const entry = batch[idx];
      const newTags = tags.filter((t) => !entry.tags.includes(t));
      editable.set(idx, newTags);
    }
    setEditedTags(editable);
    setResults(batchResults);
    setPhase("preview");
  }

  function addTagToResult(resourceIdx: number, tag: string) {
    setEditedTags((prev) => {
      const next = new Map(prev);
      const current = next.get(resourceIdx) ?? [];
      if (!current.includes(tag)) {
        next.set(resourceIdx, [...current, tag]);
      }
      return next;
    });
  }

  function removeTagFromResult(resourceIdx: number, tag: string) {
    setEditedTags((prev) => {
      const next = new Map(prev);
      const current = next.get(resourceIdx) ?? [];
      next.set(
        resourceIdx,
        current.filter((t) => t !== tag),
      );
      return next;
    });
  }

  async function saveAll() {
    setPhase("saving");
    log("auto-tag", "save-start", `Saving tags for ${batch.length} resources`);

    let saved = 0;
    let errors = 0;

    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i];
      const tags = editedTags.get(i) ?? [];
      if (tags.length === 0) continue;

      const allTags = [...new Set([...entry.tags, ...tags])];
      const input: NewEntryInput = {
        title: entry.title,
        type: entry.type,
        tags: allTags,
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
        saved++;
      } catch (error) {
        errors++;
        log("auto-tag", "save-error", `Failed to save ${entry.title}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log("auto-tag", "save-done", `Saved: ${saved}, errors: ${errors}`);
    setPhase("done");
    onChanged();

    if (errors === 0) {
      await showHUD(`Tagged ${saved} resources`);
    } else {
      await showToast({
        style: Toast.Style.Failure,
        title: `Saved ${saved}, ${errors} failed`,
      });
    }
  }

  // ---- Phase: select ----
  if (phase === "select") {
    const batchIds = new Set(batch.map((e) => e.id));

    return (
      <List
        isLoading={isLoading}
        navigationTitle="Auto-Tag Resources"
        searchBarPlaceholder="Search resources to tag..."
        filtering
        actions={
          <ActionPanel>
            <Action
              title={`Auto-Tag ${batch.length} Resources`}
              icon={Icon.Stars}
              shortcut={{ modifiers: ["cmd"], key: "return" }}
              onAction={startProcessing}
            />
            <Action
              title="Clear Batch"
              icon={Icon.XMarkCircle}
              onAction={clearBatch}
            />
          </ActionPanel>
        }
      >
        {batch.length > 0 ? (
          <List.Section
            title="Batch Queue"
            subtitle={`${batch.length} resources`}
          >
            {batch.map((entry) => (
              <List.Item
                key={`batch-${entry.id}`}
                title={entry.title}
                subtitle={`${entry.tags.length} tags: ${entry.tags.join(", ") || "(none)"}`}
                icon={Icon.CheckCircle}
                actions={
                  <ActionPanel>
                    <Action
                      title="Remove from Batch"
                      icon={Icon.XMarkCircle}
                      onAction={() => removeFromBatch(entry)}
                    />
                    <Action
                      title={`Auto-Tag ${batch.length} Resources`}
                      icon={Icon.Stars}
                      shortcut={{ modifiers: ["cmd"], key: "return" }}
                      onAction={startProcessing}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ) : null}

        {entries
          .filter((e) => !batchIds.has(e.id))
          .map((entry) => (
            <List.Item
              key={entry.id}
              title={entry.title}
              subtitle={`${entry.tags.length} tag${entry.tags.length === 1 ? "" : "s"}: ${entry.tags.join(", ") || "(untagged)"}`}
              icon={iconForType(entry.type)}
              actions={
                <ActionPanel>
                  <Action
                    title="Add to Batch"
                    icon={Icon.PlusCircle}
                    onAction={() => addToBatch(entry)}
                  />
                </ActionPanel>
              }
            />
          ))}
      </List>
    );
  }

  // ---- Phase: processing ----
  if (phase === "processing") {
    return (
      <List isLoading navigationTitle="Auto-Tag Resources">
        <List.EmptyView
          title="Analyzing resources…"
          description={`Processing ${batch.length} resources with AI`}
          icon={Icon.Stars}
        />
      </List>
    );
  }

  // ---- Phase: preview ----
  if (phase === "preview") {
    return (
      <List
        navigationTitle="Review Suggestions"
        searchBarPlaceholder="Filter resources..."
        isShowingDetail
        filtering
        actions={
          <ActionPanel>
            <Action
              title="Save All Changes"
              icon={Icon.SaveDocument}
              shortcut={{ modifiers: ["cmd"], key: "s" }}
              onAction={saveAll}
            />
          </ActionPanel>
        }
      >
        {batch.map((entry, idx) => {
          const tags = editedTags.get(idx) ?? [];
          return (
            <List.Item
              key={entry.id}
              title={entry.title}
              subtitle={`${tags.length} new tags`}
              icon={iconForType(entry.type)}
              detail={
                <List.Item.Detail
                  markdown={renderEntryMarkdown(entry)}
                  metadata={
                    <List.Item.Detail.Metadata>
                      {entry.tags.length > 0 ? (
                        <List.Item.Detail.Metadata.TagList title="Existing Tags">
                          {entry.tags.map((t) => (
                            <List.Item.Detail.Metadata.TagList.Item
                              key={t}
                              text={t}
                            />
                          ))}
                        </List.Item.Detail.Metadata.TagList>
                      ) : null}
                      {tags.length > 0 ? (
                        <List.Item.Detail.Metadata.TagList title="AI Suggested Tags">
                          {tags.map((t) => (
                            <List.Item.Detail.Metadata.TagList.Item
                              key={t}
                              text={t}
                              color="yellow"
                            />
                          ))}
                        </List.Item.Detail.Metadata.TagList>
                      ) : (
                        <List.Item.Detail.Metadata.Label
                          title="AI Suggested Tags"
                          text="(none)"
                        />
                      )}
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label
                        title="Type"
                        text={entry.type}
                      />
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  {tags.map((tag) => (
                    <Action
                      key={tag}
                      title={`Remove "${tag}"`}
                      icon={Icon.XMarkCircle}
                      onAction={() => removeTagFromResult(idx, tag)}
                    />
                  ))}
                  <Action
                    title="Add Custom Tag…"
                    icon={Icon.Plus}
                    onAction={() => {
                      // Raycast doesn't have inline text input in ActionPanel,
                      // so we add a simplified approach: user types tag name
                      // via a Toast prompt concept. For now, provide help.
                      showToast({
                        style: Toast.Style.Failure,
                        title: "Custom tags not yet supported in batch preview",
                        message: "Use the single-resource Suggest Tags for custom additions.",
                      });
                    }}
                  />
                  <Action
                    title="Save All Changes"
                    icon={Icon.SaveDocument}
                    shortcut={{ modifiers: ["cmd"], key: "s" }}
                    onAction={saveAll}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List>
    );
  }

  // ---- Phase: saving / done ----
  if (phase === "saving") {
    return (
      <List isLoading navigationTitle="Auto-Tag Resources">
        <List.EmptyView
          title="Saving tags…"
          icon={Icon.SaveDocument}
        />
      </List>
    );
  }

  // "done" phase
  return (
    <List navigationTitle="Auto-Tag Resources">
      <List.EmptyView
        title="Tagging Complete"
        description="Resources have been tagged. Check logs for details."
        icon={Icon.CheckCircle}
        actions={
          <ActionPanel>
            <Action
              title="Start Over"
              icon={Icon.ArrowClockwise}
              onAction={() => {
                setPhase("select");
                setBatch([]);
                setResults(new Map());
                setEditedTags(new Map());
              }}
            />
          </ActionPanel>
        }
      />
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
