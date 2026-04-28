import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  LaunchProps,
  List,
  popToRoot,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import {
  detectResourceType,
  getAllTags,
  isRuntimeTypePersistable,
  mapResourceInputToEntryFields,
  normalizeTag,
  normalizeTags,
  selectVisibleTypeIds,
  tagMatchesSearch,
} from "./resource";
import { loadEntries, loadRuntimeRegistry, saveEntry, updateEntry } from "./storage";
import {
  assertRuntimeTypeAvailableForUpdate,
  buildRuntimeRegistry,
  getRuntimeTypeDefinition,
  getRuntimeTypeIds,
} from "./runtime";
import {
  AddEntryLaunchContext,
  ResolvedAddEntryLaunchContext,
  resolveAddEntryLaunchContext,
} from "./launch-context";
import {
  BuiltinEntryType,
  LibraryEntry,
  NewEntryInput,
  RuntimeRegistry,
} from "./types";

interface ResourceDetailsValues {
  title: string;
  type: string;
  resource: string;
}

interface DraftResource {
  title: string;
  type: string;
  resource: string;
}

const FALLBACK_RUNTIME_REGISTRY = buildRuntimeRegistry({
  version: 1,
  actions: {},
  types: {},
});

export default function AddEntryCommand(
  props: LaunchProps<{ launchContext?: AddEntryLaunchContext }>,
) {
  return <ResourceFormFlow launchContext={props.launchContext} />;
}

export function ResourceFormFlow(props: {
  entry?: LibraryEntry;
  onSaved?: () => void;
  launchContext?: AddEntryLaunchContext;
}) {
  const { entry, onSaved, launchContext } = props;
  const { data: runtimeRegistry = FALLBACK_RUNTIME_REGISTRY } =
    useCachedPromise(loadRuntimeRegistry);
  const visibleTypeIds = selectVisibleTypeIds([
    ...getRuntimeTypeIds(runtimeRegistry),
    entry?.type || "",
  ]);
  // Editing an existing entry never honors a deeplink launch context — that
  // flow is only used from the top-level Add Resource command.
  const resolvedLaunchContext = entry
    ? undefined
    : resolveAddEntryLaunchContext(launchContext, runtimeRegistry);
  const [draft, setDraft] = useState<DraftResource | undefined>(() =>
    resolvedLaunchContext
      ? {
          title: resolvedLaunchContext.title,
          type: resolvedLaunchContext.type,
          resource: resolvedLaunchContext.resource,
        }
      : undefined,
  );
  const [clipboardDefaults, setClipboardDefaults] = useState<
    {
      type: BuiltinEntryType;
      resource: string;
    }
  >({
    type: "text",
    resource: "",
  });
  const autoSaveTriggeredRef = useRef(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "idle" | "running" | "skipped" | "saved"
  >(
    resolvedLaunchContext?.autoSave ? "running" : "idle",
  );

  useEffect(() => {
    // Skip the clipboard read when an entry is being edited or when the
    // deeplink already provided initial values.
    if (entry || resolvedLaunchContext) {
      return;
    }

    async function loadClipboard() {
      const content = await Clipboard.read();
      const resource = content.file || content.text || "";
      setClipboardDefaults({
        type: detectResourceType({ text: content.text, file: content.file }),
        resource,
      });
    }

    loadClipboard().catch(() => {
      // Clipboard access is a convenience; an empty form is still useful.
    });
  }, [entry, resolvedLaunchContext]);

  useEffect(() => {
    if (!resolvedLaunchContext || !resolvedLaunchContext.autoSave) {
      return;
    }
    if (autoSaveTriggeredRef.current) {
      return;
    }
    autoSaveTriggeredRef.current = true;

    void runAutoSave(resolvedLaunchContext, runtimeRegistry).then((result) => {
      if (result.kind === "saved") {
        setAutoSaveStatus("saved");
        onSaved?.();
      } else {
        setAutoSaveStatus("skipped");
      }
    });
  }, [resolvedLaunchContext, runtimeRegistry, onSaved]);

  if (autoSaveStatus === "running" || autoSaveStatus === "saved") {
    return (
      <List isLoading navigationTitle="Saving Resource">
        <List.EmptyView title="Saving resource…" icon={Icon.SaveDocument} />
      </List>
    );
  }

  if (draft) {
    return (
      <TagStep
        draft={draft}
        entry={entry}
        onSaved={onSaved}
        runtimeRegistry={runtimeRegistry}
        initialTags={resolvedLaunchContext?.tags}
      />
    );
  }

  return (
    <DetailsStep
      entry={entry}
      clipboardDefaults={clipboardDefaults}
      visibleTypeIds={visibleTypeIds}
      onContinue={(nextDraft) => setDraft(nextDraft)}
    />
  );
}

function DetailsStep(props: {
  entry?: LibraryEntry;
  clipboardDefaults: {
    type: BuiltinEntryType;
    resource: string;
  };
  visibleTypeIds: string[];
  onContinue: (draft: DraftResource) => void;
}) {
  const { entry, clipboardDefaults, visibleTypeIds, onContinue } = props;
  const initialResource = entry
    ? entry.properties.URL || entry.properties.PATH || entry.body
    : clipboardDefaults.resource;
  const initialType = resolveInitialType(
    entry,
    clipboardDefaults.type,
    visibleTypeIds,
  );
  const [resource, setResource] = useState(initialResource);
  const [type, setType] = useState(initialType);
  const [typeWasEdited, setTypeWasEdited] = useState(Boolean(entry));

  useEffect(() => {
    setResource(initialResource);
    setType(initialType);
    setTypeWasEdited(Boolean(entry));
  }, [entry, initialResource, initialType]);

  useEffect(() => {
    if (!visibleTypeIds.includes(type)) {
      setType(initialType);
    }
  }, [initialType, type, visibleTypeIds]);

  async function handleSubmit(values: ResourceDetailsValues) {
    if (!values.title.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Resource name is required",
      });
      return;
    }

    if (!resource.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Resource content is required",
      });
      return;
    }

    onContinue({
      title: values.title,
      type,
      resource,
    });
  }

  return (
    <Form
      navigationTitle={entry ? "Edit Resource" : "Add Resource"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Continue to Tags"
            icon={Icon.ArrowRight}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Resource Name"
        placeholder="Name this resource"
        defaultValue={entry?.title || ""}
      />
      <Form.TextArea
        id="resource"
        title="Resource"
        placeholder="Text, URL, org-protocol URL, or image path"
        value={resource}
        onChange={(value) => {
          setResource(value);
          if (!entry && !typeWasEdited) {
            setType(detectResourceType({ text: value }));
          }
        }}
      />
      <Form.Dropdown
        id="type"
        title="Resource Type"
        value={type}
        onChange={(selectedType) => {
          setType(selectedType);
          setTypeWasEdited(true);
        }}
      >
        {visibleTypeIds.map((typeId) => (
          <Form.Dropdown.Item key={typeId} value={typeId} title={typeId} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

function TagStep(props: {
  draft: DraftResource;
  entry?: LibraryEntry;
  onSaved?: () => void;
  runtimeRegistry: RuntimeRegistry;
  initialTags?: string[];
}) {
  const { draft, entry, onSaved, runtimeRegistry, initialTags } = props;
  const { pop } = useNavigation();
  const { data = [], isLoading } = useCachedPromise(loadEntries);
  const existingTags = getAllTags(data);
  const [selectedTags, setSelectedTags] = useState<string[]>(() =>
    normalizeTags(initialTags ?? entry?.tags ?? []),
  );
  const [searchText, setSearchText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const normalizedQuery = normalizeTag(searchText);
  const visibleExistingTags = existingTags.filter(
    (tag) =>
      !selectedTags.includes(tag) && tagMatchesSearch(tag, normalizedQuery),
  );
  const canCreateTag = Boolean(
    normalizedQuery &&
    !existingTags.includes(normalizedQuery) &&
    !selectedTags.includes(normalizedQuery),
  );

  async function handleSave() {
    const tags = normalizeTags(selectedTags);
    if (!isRuntimeTypePersistable(draft.type)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "This resource type cannot be saved yet",
        message: `${draft.type} needs serializer support before it can be persisted.`,
      });
      return;
    }

    if (entry) {
      try {
        assertRuntimeTypeAvailableForUpdate(runtimeRegistry, entry.type);
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "This resource type is no longer available",
          message:
            error instanceof Error
              ? error.message
              : "Restore the missing runtime type in your config before editing this entry.",
        });
        return;
      }
    }

    const semanticType = getRuntimeTypeDefinition(
      runtimeRegistry,
      draft.type,
    ).extends;
    const input = buildEntryInput(draft, tags, semanticType, draft.type);

    try {
      setIsSaving(true);
      if (entry) {
        await updateEntry(entry.id, input);
        await showHUD("Updated resource");
      } else {
        await saveEntry(input);
        await showHUD("Added resource");
      }
      onSaved?.();
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save resource",
        message: String(error),
      });
    } finally {
      setIsSaving(false);
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags((currentTags) =>
      currentTags.includes(tag)
        ? currentTags.filter((currentTag) => currentTag !== tag)
        : normalizeTags([...currentTags, tag]),
    );
  }

  function createTag() {
    if (!canCreateTag) {
      return;
    }

    setSelectedTags((currentTags) =>
      normalizeTags([...currentTags, normalizedQuery]),
    );
    setSearchText("");
  }

  const saveActionTitle = entry ? "Update Resource" : "Save Resource";

  return (
    <List
      isLoading={isLoading || isSaving}
      navigationTitle="Choose Tags"
      searchBarPlaceholder="Search or create tags..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
    >
      {canCreateTag ? (
        <List.Section title="Create New Tag">
          <List.Item
            title={`#${normalizedQuery}`}
            subtitle="Press Enter to create and select this tag"
            icon={Icon.PlusCircle}
            actions={
              <ActionPanel>
                <Action
                  title="Create and Select Tag"
                  icon={Icon.Plus}
                  onAction={createTag}
                />
                <Action
                  title={saveActionTitle}
                  icon={Icon.Check}
                  shortcut={{ modifiers: ["cmd"], key: "s" }}
                  onAction={handleSave}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}

      {selectedTags.length > 0 ? (
        <List.Section title="Selected Tags" subtitle={`${selectedTags.length} selected`}>
          {selectedTags.map((tag) => (
            <List.Item
              key={tag}
              title={`#${tag}`}
              icon={Icon.CheckCircle}
              accessories={[{ text: "✓" }]}
              actions={
                <ActionPanel>
                  <Action
                    title="Deselect Tag"
                    icon={Icon.XMarkCircle}
                    onAction={() => toggleTag(tag)}
                  />
                  <Action
                    title={saveActionTitle}
                    icon={Icon.Check}
                    shortcut={{ modifiers: ["cmd"], key: "s" }}
                    onAction={handleSave}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}

      {visibleExistingTags.length > 0 ? (
        <List.Section
          title={normalizedQuery ? "Available Tags" : "All Tags"}
          subtitle={`${visibleExistingTags.length} available`}
        >
          {visibleExistingTags.map((tag) => (
            <List.Item
              key={tag}
              title={`#${tag}`}
              subtitle="Press Enter to select this tag"
              icon={Icon.Tag}
              actions={
                <ActionPanel>
                  <Action
                    title="Select Tag"
                    icon={Icon.CheckCircle}
                    onAction={() => toggleTag(tag)}
                  />
                  <Action
                    title={saveActionTitle}
                    icon={Icon.Check}
                    shortcut={{ modifiers: ["cmd"], key: "s" }}
                    onAction={handleSave}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}

      {!canCreateTag && visibleExistingTags.length === 0 ? (
        <List.EmptyView
          title={
            selectedTags.length > 0
              ? `${selectedTags.length} tag${selectedTags.length === 1 ? "" : "s"} selected`
              : "No tags yet"
          }
          description={
            selectedTags.length > 0
              ? `Press Cmd+S to ${entry ? "update" : "save"} resource`
              : `Start typing to create a new tag, or press Cmd+S to ${entry ? "update" : "save"} without tags`
          }
          icon={selectedTags.length > 0 ? Icon.CheckCircle : Icon.Tag}
          actions={
            <ActionPanel>
              <Action
                title={saveActionTitle}
                icon={Icon.Check}
                shortcut={{ modifiers: ["cmd"], key: "s" }}
                onAction={handleSave}
              />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}

function resolveInitialType(
  entry: LibraryEntry | undefined,
  detectedType: BuiltinEntryType,
  visibleTypeIds: string[],
): string {
  if (entry?.type && visibleTypeIds.includes(entry.type)) {
    return entry.type;
  }

  if (visibleTypeIds.includes(detectedType)) {
    return detectedType;
  }

  return visibleTypeIds[0] ?? detectedType;
}

function buildEntryInput(
  draft: DraftResource,
  tags: string[],
  semanticType: Parameters<typeof mapResourceInputToEntryFields>[0],
  runtimeType: string,
): NewEntryInput {
  const resource = draft.resource.trim();

  return {
    title: draft.title,
    type: runtimeType,
    groupPath: [],
    tags,
    ...mapResourceInputToEntryFields(semanticType, resource),
  };
}

type AutoSaveResult =
  | { kind: "saved" }
  | { kind: "skipped"; reason: string };

/**
 * Persist a deeplink-launched resource without showing the add-entry UI.
 *
 * Returns `skipped` (with a user-visible toast already shown) when the
 * launch context lacks the fields required to save unattended; the caller
 * should then fall back to the normal two-step UI so the user can finish.
 */
async function runAutoSave(
  resolved: ResolvedAddEntryLaunchContext,
  runtimeRegistry: RuntimeRegistry,
): Promise<AutoSaveResult> {
  const title = resolved.title.trim();
  const resource = resolved.resource.trim();

  if (!title) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Cannot auto-save without a title",
      message: "Provide `title` in the deeplink launch context, or finish in the form.",
    });
    return { kind: "skipped", reason: "missing-title" };
  }

  if (!resource) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Cannot auto-save without content",
      message: "Provide `content` in the deeplink launch context.",
    });
    return { kind: "skipped", reason: "missing-content" };
  }

  if (!isRuntimeTypePersistable(resolved.type)) {
    await showToast({
      style: Toast.Style.Failure,
      title: "This resource type cannot be saved yet",
      message: `${resolved.type} needs serializer support before it can be persisted.`,
    });
    return { kind: "skipped", reason: "type-not-persistable" };
  }

  const semanticType = getRuntimeTypeDefinition(
    runtimeRegistry,
    resolved.type,
  ).extends;
  const input = buildEntryInput(
    { title, type: resolved.type, resource },
    normalizeTags(resolved.tags),
    semanticType,
    resolved.type,
  );

  try {
    await saveEntry(input);
    await showHUD("Added resource");
    await popToRoot();
    return { kind: "saved" };
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to save resource",
      message: error instanceof Error ? error.message : String(error),
    });
    return { kind: "skipped", reason: "save-failed" };
  }
}
