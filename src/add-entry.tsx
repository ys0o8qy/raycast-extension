import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  List,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect, useState } from "react";
import {
  detectResourceType,
  getAllTags,
  normalizeTag,
  normalizeTags,
  tagMatchesSearch,
} from "./resource";
import { loadEntries, saveEntry, updateEntry } from "./storage";
import { EntryType, ENTRY_TYPES, LibraryEntry, NewEntryInput } from "./types";

interface ResourceDetailsValues {
  title: string;
  type: EntryType;
  resource: string;
}

interface DraftResource {
  title: string;
  type: EntryType;
  resource: string;
}

export default function AddEntryCommand() {
  return <ResourceFormFlow />;
}

export function ResourceFormFlow(props: {
  entry?: LibraryEntry;
  onSaved?: () => void;
}) {
  const { entry, onSaved } = props;
  const [draft, setDraft] = useState<DraftResource | undefined>();
  const [clipboardDefaults, setClipboardDefaults] = useState<
    Pick<DraftResource, "type" | "resource">
  >({
    type: "text",
    resource: "",
  });

  useEffect(() => {
    if (entry) {
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
  }, [entry]);

  if (draft) {
    return <TagStep draft={draft} entry={entry} onSaved={onSaved} />;
  }

  return (
    <DetailsStep
      entry={entry}
      clipboardDefaults={clipboardDefaults}
      onContinue={(nextDraft) => setDraft(nextDraft)}
    />
  );
}

function DetailsStep(props: {
  entry?: LibraryEntry;
  clipboardDefaults: Pick<DraftResource, "type" | "resource">;
  onContinue: (draft: DraftResource) => void;
}) {
  const { entry, clipboardDefaults, onContinue } = props;
  const initialResource = entry
    ? entry.properties.URL || entry.properties.PATH || entry.body
    : clipboardDefaults.resource;
  const initialType = entry?.type || clipboardDefaults.type;
  const [resource, setResource] = useState(initialResource);
  const [type, setType] = useState<EntryType>(initialType);

  useEffect(() => {
    setResource(initialResource);
    setType(initialType);
  }, [initialResource, initialType]);

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
          if (!entry) {
            setType(detectResourceType({ text: value }));
          }
        }}
      />
      <Form.Dropdown
        id="type"
        title="Resource Type"
        value={type}
        onChange={(selectedType) => setType(selectedType as EntryType)}
      >
        {ENTRY_TYPES.map((type) => (
          <Form.Dropdown.Item key={type} value={type} title={type} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

function TagStep(props: {
  draft: DraftResource;
  entry?: LibraryEntry;
  onSaved?: () => void;
}) {
  const { draft, entry, onSaved } = props;
  const { pop } = useNavigation();
  const { data = [], isLoading } = useCachedPromise(loadEntries);
  const existingTags = getAllTags(data);
  const [selectedTags, setSelectedTags] = useState<string[]>(() =>
    normalizeTags(entry?.tags || []),
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
    const input = buildEntryInput(draft, tags);

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

  return (
    <List
      isLoading={isLoading || isSaving}
      navigationTitle="Choose Tags"
      searchBarPlaceholder="Search or create tags..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
    >
      {!normalizedQuery ? (
        <List.Section title="Continue">
          <List.Item
            title={entry ? "Update Resource" : "Save Resource"}
            subtitle={
              selectedTags.length > 0
                ? `${selectedTags.length} tags selected`
                : "No tags selected"
            }
            icon={Icon.Check}
            actions={
              <ActionPanel>
                <Action
                  title={entry ? "Update Resource" : "Save Resource"}
                  icon={Icon.Check}
                  onAction={handleSave}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}

      {canCreateTag ? (
        <List.Section title="Create">
          <List.Item
            title={`Create #${normalizedQuery}`}
            icon={Icon.PlusCircle}
            actions={
              <ActionPanel>
                <Action
                  title="Create Tag"
                  icon={Icon.Plus}
                  onAction={createTag}
                />
                <Action
                  title={entry ? "Update Resource" : "Save Resource"}
                  icon={Icon.Check}
                  onAction={handleSave}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}

      {selectedTags.length > 0 ? (
        <List.Section title="Selected Tags" subtitle={`${selectedTags.length}`}>
          {selectedTags.map((tag) => (
            <List.Item
              key={tag}
              title={`#${tag}`}
              icon={Icon.CheckCircle}
              accessories={[{ text: "Selected" }]}
              actions={
                <ActionPanel>
                  <Action
                    title="Remove Tag"
                    icon={Icon.XMarkCircle}
                    onAction={() => toggleTag(tag)}
                  />
                  <Action
                    title={entry ? "Update Resource" : "Save Resource"}
                    icon={Icon.Check}
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
          title="Existing Tags"
          subtitle={`${visibleExistingTags.length}`}
        >
          {visibleExistingTags.map((tag) => (
            <List.Item
              key={tag}
              title={`#${tag}`}
              icon={Icon.Tag}
              actions={
                <ActionPanel>
                  <Action
                    title="Select Tag"
                    icon={Icon.CheckCircle}
                    onAction={() => toggleTag(tag)}
                  />
                  <Action
                    title={entry ? "Update Resource" : "Save Resource"}
                    icon={Icon.Check}
                    onAction={handleSave}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}

function buildEntryInput(draft: DraftResource, tags: string[]): NewEntryInput {
  const resource = draft.resource.trim();
  const input: NewEntryInput = {
    title: draft.title,
    type: draft.type,
    groupPath: [],
    tags,
  };

  switch (draft.type) {
    case "link":
      return { ...input, url: resource };
    case "image":
      return /^https?:\/\//i.test(resource)
        ? { ...input, url: resource }
        : { ...input, path: resource.replace(/^file:\/\//i, "") };
    case "schema":
      return { ...input, body: resource };
    case "text":
      return { ...input, body: resource };
  }
}
