import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { suggestTagsBatch } from "./ai-tag-suggest";
import { log } from "./logger";
import { getAllTags, normalizeTag } from "./resource";
import { ResourceDetail } from "./resource-detail";
import { loadEntries, updateEntry } from "./storage";
import { LibraryEntry, NewEntryInput } from "./types";
import { buildCompactResourceSubtitle, iconForType } from "./list-helpers";

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

  // Lightly tagged threshold (user-adjustable)
  const [lightlyTaggedThreshold, setLightlyTaggedThreshold] = useState(2);

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

  function addEntriesToBatch(entriesToAdd: LibraryEntry[]) {
    setBatch((prev) => {
      const ids = new Set(prev.map((entry) => entry.id));
      const next = [...prev];
      for (const entry of entriesToAdd) {
        if (ids.has(entry.id)) continue;
        ids.add(entry.id);
        next.push(entry);
      }
      return next;
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
    const availableEntries = entries.filter((entry) => !batchIds.has(entry.id));
    const untaggedEntries = availableEntries.filter(
      (entry) => entry.tags.length === 0,
    );
    const lightlyTaggedEntries = availableEntries.filter(
      (entry) => entry.tags.length > 0 && entry.tags.length <= lightlyTaggedThreshold,
    );

    // Type-filtered entries (for quick-add actions)
    const uniqueTypes = [...new Set(availableEntries.map((e) => e.type))];
    function entriesOfType(type: string) {
      return availableEntries.filter((e) => e.type === type);
    }

    // Recent entries (last 7 days)
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentEntries = availableEntries.filter((entry) => {
      if (!entry.createdAt) return false;
      try {
        return new Date(entry.createdAt) >= recentCutoff;
      } catch {
        return false;
      }
    });

    // Threshold cycle helper
    function cycleThreshold() {
      setLightlyTaggedThreshold((prev) => {
        const options = [1, 2, 3, 5];
        const idx = options.indexOf(prev);
        const next = options[(idx + 1) % options.length];
        return next;
      });
    }

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
              title="Add All Untagged"
              icon={Icon.PlusCircle}
              onAction={() => addEntriesToBatch(untaggedEntries)}
            />
            <Action
              title={`Add Lightly Tagged (≤${lightlyTaggedThreshold} tags)`}
              icon={Icon.Tag}
              onAction={() => addEntriesToBatch(lightlyTaggedEntries)}
            />
            <Action
              title={`Threshold: ≤${lightlyTaggedThreshold}`}
              icon={Icon.Switch}
              onAction={cycleThreshold}
            />
            <Action
              title="Add Recent (Last 7 Days)"
              icon={Icon.Clock}
              onAction={() => addEntriesToBatch(recentEntries)}
            />
            {uniqueTypes.filter((t) => entriesOfType(t).length > 0).map((type) => (
              <Action
                key={`add-all-${type}`}
                title={`Add All ${capitalize(type)}`}
                icon={iconForType(type)}
                onAction={() => addEntriesToBatch(entriesOfType(type))}
              />
            ))}
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
                subtitle={buildCompactResourceSubtitle(entry)}
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
                    <Action
                      title="Add All Untagged"
                      icon={Icon.PlusCircle}
                      onAction={() => addEntriesToBatch(untaggedEntries)}
                    />
                    <Action
                      title={`Add Lightly Tagged (≤${lightlyTaggedThreshold} tags)`}
                      icon={Icon.Tag}
                      onAction={() => addEntriesToBatch(lightlyTaggedEntries)}
                    />
                    <Action
                      title={`Threshold: ≤${lightlyTaggedThreshold}`}
                      icon={Icon.Switch}
                      onAction={cycleThreshold}
                    />
                    <Action
                      title="Add Recent (Last 7 Days)"
                      icon={Icon.Clock}
                      onAction={() => addEntriesToBatch(recentEntries)}
                    />
                    {uniqueTypes.filter((t) => entriesOfType(t).length > 0).map((type) => (
                      <Action
                        key={`batch-add-all-${type}`}
                        title={`Add All ${capitalize(type)}`}
                        icon={iconForType(type)}
                        onAction={() => addEntriesToBatch(entriesOfType(type))}
                      />
                    ))}
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ) : null}

        {availableEntries.map((entry) => (
          <List.Item
            key={entry.id}
            title={entry.title}
            subtitle={buildCompactResourceSubtitle(entry)}
            icon={iconForType(entry.type)}
            actions={
              <ActionPanel>
                <Action
                  title="Add to Batch"
                  icon={Icon.PlusCircle}
                  onAction={() => addToBatch(entry)}
                />
                <Action
                  title="Add All Untagged"
                  icon={Icon.PlusCircle}
                  onAction={() => addEntriesToBatch(untaggedEntries)}
                />
                <Action
                  title={`Add Lightly Tagged (≤${lightlyTaggedThreshold} tags)`}
                  icon={Icon.Tag}
                  onAction={() => addEntriesToBatch(lightlyTaggedEntries)}
                />
                <Action
                  title={`Threshold: ≤${lightlyTaggedThreshold}`}
                  icon={Icon.Switch}
                  onAction={cycleThreshold}
                />
                <Action
                  title="Add Recent (Last 7 Days)"
                  icon={Icon.Clock}
                  onAction={() => addEntriesToBatch(recentEntries)}
                />
                {uniqueTypes.filter((t) => entriesOfType(t).length > 0).map((type) => (
                  <Action
                    key={`entry-add-all-${type}`}
                    title={`Add All ${capitalize(type)}`}
                    icon={iconForType(type)}
                    onAction={() => addEntriesToBatch(entriesOfType(type))}
                  />
                ))}
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
          title="Analyzing with AI…"
          description={`Processing ${batch.length} resource${batch.length > 1 ? "s" : ""}. This may take a few seconds.`}
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
              detail={<ResourceDetail entry={entry} suggestedTags={tags} />}
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
                  <Action.Push
                    title="Add Custom Tag…"
                    icon={Icon.Plus}
                    target={
                      <AddCustomTagForm
                        onTag={(tag) => addTagToResult(idx, tag)}
                      />
                    }
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

/**
 * Capitalize the first character of a string.
 */
function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A minimal form for adding a single custom tag in the batch preview flow.
 * Pushed as a sub-view so the user stays within the auto-tagging context.
 */
function AddCustomTagForm(props: { onTag: (tag: string) => void }) {
  const { pop } = useNavigation();

  async function handleSubmit(values: { tag: string }) {
    const tag = normalizeTag(values.tag || "");
    if (!tag) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Tag name is required",
      });
      return;
    }
    props.onTag(tag);
    pop();
  }

  return (
    <Form
      navigationTitle="Add Custom Tag"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Tag"
            icon={Icon.Plus}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="tag"
        title="Tag Name"
        placeholder="Enter tag name"
        autoFocus
      />
    </Form>
  );
}
