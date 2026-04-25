import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
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
  normalizeTags,
  splitNewTags,
} from "./resource";
import { loadEntries, saveEntry, updateEntry } from "./storage";
import { EntryType, ENTRY_TYPES, LibraryEntry, NewEntryInput } from "./types";

interface ResourceDetailsValues {
  title: string;
  type: EntryType[];
  resource: string;
  description: string;
  schemaKind: string;
}

interface TagValues {
  tags: string[];
  newTags: string;
}

interface DraftResource {
  title: string;
  type: EntryType;
  resource: string;
  description: string;
  schemaKind: string;
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
      description: values.description,
      schemaKind: values.schemaKind,
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
      <Form.TagPicker
        id="type"
        title="Resource Type"
        value={[type]}
        onChange={(selectedTypes) => {
          const selectedType = selectedTypes[selectedTypes.length - 1] as
            | EntryType
            | undefined;
          if (!selectedType) {
            return;
          }
          setType(selectedType);
        }}
      >
        {ENTRY_TYPES.map((type) => (
          <Form.TagPicker.Item key={type} value={type} title={type} />
        ))}
      </Form.TagPicker>
      <Form.TextField
        id="description"
        title="Description"
        placeholder="Optional summary"
        defaultValue={entry?.properties.DESCRIPTION || ""}
      />
      <Form.TextField
        id="schemaKind"
        title="Schema Kind"
        placeholder="org-protocol, json-schema, etc."
        defaultValue={
          entry?.properties.SCHEMA_KIND ||
          (type === "schema" ? "org-protocol" : "")
        }
      />
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
  const visibleTags = normalizeTags([...existingTags, ...(entry?.tags || [])]);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(values: TagValues) {
    const tags = normalizeTags([
      ...values.tags,
      ...splitNewTags(values.newTags),
    ]);
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

  return (
    <Form
      isLoading={isLoading || isSaving}
      navigationTitle="Choose Tags"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={entry ? "Update Resource" : "Save Resource"}
            icon={Icon.Check}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Select existing tags, add new tags, or leave everything empty." />
      <Form.TagPicker
        id="tags"
        title="Tags"
        placeholder="Filter and select tags"
        defaultValue={entry?.tags || []}
      >
        {visibleTags.map((tag) => (
          <Form.TagPicker.Item key={tag} value={tag} title={tag} />
        ))}
      </Form.TagPicker>
      <Form.TextField
        id="newTags"
        title="New Tags"
        placeholder="Separate new tags with spaces or commas"
      />
    </Form>
  );
}

function buildEntryInput(draft: DraftResource, tags: string[]): NewEntryInput {
  const resource = draft.resource.trim();
  const input: NewEntryInput = {
    title: draft.title,
    type: draft.type,
    groupPath: [],
    tags,
    description: draft.description,
    schemaKind: draft.schemaKind,
  };

  switch (draft.type) {
    case "link":
      return { ...input, url: resource };
    case "image":
      return /^https?:\/\//i.test(resource)
        ? { ...input, url: resource }
        : { ...input, path: resource.replace(/^file:\/\//i, "") };
    case "schema":
      return {
        ...input,
        body: resource,
        schemaKind: draft.schemaKind || "org-protocol",
      };
    case "text":
      return { ...input, body: resource };
  }
}
