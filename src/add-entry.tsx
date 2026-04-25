import { Action, ActionPanel, Form, Icon, showHUD, showToast, Toast } from "@raycast/api";
import { useState } from "react";
import { saveEntry } from "./storage";
import { EntryType, ENTRY_TYPES, NewEntryInput } from "./types";

interface FormValues {
  title: string;
  type: EntryType;
  groupPath: string;
  tags: string;
  url: string;
  path: string;
  description: string;
  schemaKind: string;
  body: string;
}

const defaultValues: FormValues = {
  title: "",
  type: "bookmark",
  groupPath: "",
  tags: "",
  url: "",
  path: "",
  description: "",
  schemaKind: "",
  body: "",
};

function parseGroupPath(value: string): string[] {
  return value
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export default function AddEntryCommand() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(values: FormValues) {
    if (!values.title.trim()) {
      await showToast({ style: Toast.Style.Failure, title: "Title is required" });
      return;
    }

    const input: NewEntryInput = {
      title: values.title,
      type: values.type,
      groupPath: parseGroupPath(values.groupPath),
      tags: values.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      url: values.url,
      path: values.path,
      description: values.description,
      schemaKind: values.schemaKind,
      body: values.body,
    };

    try {
      setIsLoading(true);
      await saveEntry(input);
      await showHUD(`Added ${values.type} entry`);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to save entry", message: String(error) });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle="Add Org Library Entry"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Entry" icon={Icon.Plus} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Title" placeholder="Entry title" defaultValue={defaultValues.title} />
      <Form.Dropdown id="type" title="Type" defaultValue={defaultValues.type}>
        {ENTRY_TYPES.map((type) => (
          <Form.Dropdown.Item key={type} value={type} title={type} />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="groupPath"
        title="Group Path"
        placeholder="Development/Raycast"
        defaultValue={defaultValues.groupPath}
      />
      <Form.TextField id="tags" title="Tags" placeholder="comma,separated,tags" defaultValue={defaultValues.tags} />
      <Form.TextField id="url" title="URL" placeholder="https://example.com" defaultValue={defaultValues.url} />
      <Form.TextField id="path" title="Local Path" placeholder="/Users/me/image.png" defaultValue={defaultValues.path} />
      <Form.TextField id="description" title="Description" placeholder="Optional summary" defaultValue={defaultValues.description} />
      <Form.TextField
        id="schemaKind"
        title="Schema Kind"
        placeholder="e.g. json-schema"
        defaultValue={defaultValues.schemaKind}
      />
      <Form.TextArea id="body" title="Body" placeholder="Optional notes, snippet, or schema body" defaultValue={defaultValues.body} />
    </Form>
  );
}
