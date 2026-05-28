import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  confirmAlert,
  Form,
  Icon,
  Keyboard,
  LaunchProps,
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
import {
  loadEntries,
  loadRuntimeRegistry,
  saveEntry,
  updateEntry,
} from "./storage";
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
import { suggestTags } from "./ai-tag-suggest";
import {
  BuiltinEntryType,
  LibraryEntry,
  NewEntryInput,
  RuntimeRegistry,
} from "./types";
import { PROJECT_ROLE_OPTIONS } from "./projects/roles";

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
  onSaved?: (entryId: string) => void | Promise<void>;
  launchContext?: AddEntryLaunchContext;
  projectRole?: string;
  onProjectRoleChange?: (role: string) => void;
}) {
  const { entry, onSaved, launchContext, projectRole, onProjectRoleChange } =
    props;
  const { pop } = useNavigation();
  const { data: runtimeRegistry = FALLBACK_RUNTIME_REGISTRY } =
    useCachedPromise(loadRuntimeRegistry);
  const { data: allEntries = [] } = useCachedPromise(loadEntries);
  const existingTags = getAllTags(allEntries);
  const visibleTypeIds = selectVisibleTypeIds([
    ...getRuntimeTypeIds(runtimeRegistry),
    entry?.type || "",
  ]);
  // Editing an existing entry never honors a deeplink launch context
  const resolvedLaunchContext = entry
    ? undefined
    : resolveAddEntryLaunchContext(launchContext, runtimeRegistry);

  // ── Auto-save (deeplink) ────────────────────────────────────────
  const autoSaveTriggeredRef = useRef(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "idle" | "running" | "skipped" | "saved"
  >(resolvedLaunchContext?.autoSave ? "running" : "idle");

  // ── Form state ──────────────────────────────────────────────────
  const initialResource = entry
    ? entry.properties.URL || entry.properties.PATH || entry.body
    : "";

  const [resource, setResource] = useState(initialResource);
  const [type, setType] = useState(() =>
    resolveInitialType(entry, "text", visibleTypeIds),
  );
  const [isTypeAutoDetected, setIsTypeAutoDetected] = useState(!entry);
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);

  // ── Clipboard defaults (new entry only) ─────────────────────────
  const [clipboardDefaults, setClipboardDefaults] = useState<{
    type: BuiltinEntryType;
    resource: string;
  }>({ type: "text", resource: "" });

  // ── AI tag suggestion state ─────────────────────────────────────
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [tagSearchInput, setTagSearchInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Clipboard detection ─────────────────────────────────────────
  useEffect(() => {
    if (entry || resolvedLaunchContext) return;
    async function loadClipboard() {
      const content = await Clipboard.read();
      const res = content.file || content.text || "";
      const detectedType = detectResourceType({
        text: content.text,
        file: content.file,
      });
      setClipboardDefaults({ type: detectedType, resource: res });
      if (!type || type === "text") {
        setType(
          visibleTypeIds.includes(detectedType)
            ? detectedType
            : visibleTypeIds[0] ?? "text",
        );
      }
      setResource(res);
      setIsTypeAutoDetected(true);
    }
    loadClipboard().catch(() => {
      // Clipboard access is a convenience
    });
  }, [entry, resolvedLaunchContext]);

  // Cleanup suggestion timer on unmount
  useEffect(() => {
    return () => {
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!resolvedLaunchContext || !resolvedLaunchContext.autoSave) return;
    if (autoSaveTriggeredRef.current) return;
    autoSaveTriggeredRef.current = true;

    void runAutoSave(resolvedLaunchContext, runtimeRegistry).then(
      async (result) => {
        if (result.kind === "saved") {
          setAutoSaveStatus("saved");
          await onSaved?.(result.entryId);
        } else {
          setAutoSaveStatus("skipped");
        }
      },
    );
  }, [resolvedLaunchContext, runtimeRegistry, onSaved]);

  // ── Type detection handlers ─────────────────────────────────────
  function handleResourceChange(value: string) {
    setResource(value);
    if (isTypeAutoDetected) {
      const detected = detectResourceType({ text: value });
      if (visibleTypeIds.includes(detected)) {
        setType(detected);
      }
    }
  }

  function handleAutoDetectType() {
    const detected = detectResourceType({ text: resource });
    if (visibleTypeIds.includes(detected)) {
      setType(detected);
    }
    setIsTypeAutoDetected(true);
  }

  function handleTypeChange(newType: string) {
    setType(newType);
    setIsTypeAutoDetected(false);
  }

  // ── Tag input (comma-separated) ────────────────────────────────
  function handleTagInputChange(value: string) {
    if (value.includes(",")) {
      const segments = value
        .split(",")
        .map((s) => normalizeTag(s))
        .filter(Boolean);
      const newTags = segments.filter((t) => !tags.includes(t));
      if (newTags.length > 0) {
        setTags((prev) => normalizeTags([...prev, ...newTags]));
      }
      setTagSearchInput("");
      setTagSuggestions([]);
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
      return;
    }
    setTagSearchInput(value);

    // Debounced tag suggestions for ActionPanel quick-select
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    const normalized = normalizeTag(value);
    if (normalized) {
      suggestionTimerRef.current = setTimeout(() => {
        const matches = existingTags
          .filter(
            (tag) =>
              tagMatchesSearch(tag, normalized) && !tags.includes(tag),
          )
          .slice(0, 5);
        setTagSuggestions(matches);
      }, 100); // reduced from 150ms for faster feedback
    } else {
      setTagSuggestions([]);
    }
  }

  function addSuggestedTag(tag: string) {
    if (!tags.includes(tag)) {
      setTags((prev) => normalizeTags([...prev, tag]));
    }
    setTagSearchInput("");
    setTagSuggestions([]);
  }

  // ── AI tag suggestion ───────────────────────────────────────────
  async function handleSuggestTags() {
    setIsSuggesting(true);
    setSuggestedTags([]);
    try {
      const suggestions = await suggestTags(
        resource || "",
        resource,
        existingTags,
      );
      const newTags = suggestions.filter((t) => !tags.includes(t));
      setSuggestedTags(newTags);
      setIsSuggesting(false);

      if (newTags.length > 0) {
        const tagList = newTags.map((t) => `#${t}`).join(", ");
        const shouldAdd = await confirmAlert({
          title: `${newTags.length} Tag${newTags.length > 1 ? "s" : ""} Suggested`,
          message: tagList,
          primaryAction: { title: "Add All" },
          dismissAction: { title: "Skip" },
        });
        if (shouldAdd) {
          setTags((prev) =>
            normalizeTags([...prev, ...newTags]),
          );
        }
      } else {
        await showToast({
          style: Toast.Style.Success,
          title: "No new tags to suggest",
          message: "All relevant tags are already selected",
        });
      }
    } catch (error) {
      setIsSuggesting(false);
      await showToast({
        style: Toast.Style.Failure,
        title: "Tag suggestion failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ── Save ────────────────────────────────────────────────────────
  async function handleSave(values: { title: string }) {
    const title = (values.title || "").trim();

    if (!title) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Resource name is required",
      });
      return;
    }

    const content = resource.trim();
    if (!content) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Resource content is required",
      });
      return;
    }

    if (!isRuntimeTypePersistable(type)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "This resource type cannot be saved yet",
        message: `${type} needs serializer support before it can be persisted.`,
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

    const semanticType = getRuntimeTypeDefinition(runtimeRegistry, type).extends;
    const normalizedTags = normalizeTags(tags);
    const input = buildEntryInput(
      { title, type, resource: content },
      normalizedTags,
      semanticType,
      type,
    );

    const savingToast = await showToast({
      style: Toast.Style.Animated,
      title: entry ? "Updating resource…" : "Saving resource…",
    });

    try {
      let savedEntryId = entry?.id ?? "";
      if (entry) {
        await updateEntry(entry.id, input);
        savingToast.style = Toast.Style.Success;
        savingToast.title = "Resource updated";
      } else {
        savedEntryId = await saveEntry(input);
        savingToast.style = Toast.Style.Success;
        savingToast.title = "Resource saved";
      }
      await onSaved?.(savedEntryId);
      pop();
    } catch (error) {
      savingToast.style = Toast.Style.Failure;
      savingToast.title = "Failed to save resource";
      savingToast.message = String(error);
    }
  }

  // ── Auto-save loading state ─────────────────────────────────────
  if (autoSaveStatus === "running" || autoSaveStatus === "saved") {
    return (
      <Form isLoading navigationTitle="Saving Resource">
        <Form.Description text="Saving resource…" />
      </Form>
    );
  }

  const typeLabel = isTypeAutoDetected
    ? "Resource Type (auto-detected)"
    : "Resource Type";

  return (
    <Form
      navigationTitle={entry ? "Edit Resource" : "Add Resource"}
      actions={
        <ActionPanel>
          {tagSuggestions.length > 0 ? (
            <Action
              title={`Add "#${tagSuggestions[0]}"`}
              icon={Icon.ArrowRight}
              shortcut={
                { modifiers: [], key: "return" as Keyboard.KeyEquivalent }
              }
              onAction={() => addSuggestedTag(tagSuggestions[0])}
            />
          ) : null}
          <Action.SubmitForm
            title={entry ? "Save Changes" : "Save Resource"}
            icon={Icon.SaveDocument}
            shortcut={{ modifiers: ["cmd"], key: "s" }}
            onSubmit={handleSave}
          />
          <Action
            title={isSuggesting ? "Analyzing…" : "Suggest Tags"}
            icon={isSuggesting ? Icon.CircleProgress : Icon.Stars}
            shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
            onAction={handleSuggestTags}
          />
          <Action
            title="Auto-Detect Type"
            icon={Icon.MagnifyingGlass}
            onAction={handleAutoDetectType}
          />
          {tagSuggestions.length > 1 ? (
            <ActionPanel.Section title="More Matching Tags">
              {tagSuggestions.slice(1).map((tag, i) => (
                <Action
                  key={tag}
                  title={`Add "#${tag}"`}
                  icon={Icon.Tag}
                  shortcut={
                    i < 8
                      ? { modifiers: ["cmd"], key: String(i + 2) as Keyboard.KeyEquivalent }
                      : undefined
                  }
                  onAction={() => addSuggestedTag(tag)}
                />
              ))}
            </ActionPanel.Section>
          ) : null}
        </ActionPanel>
      }
    >
      {autoSaveStatus === "skipped" ? (
        <Form.Description
          title="Auto-save skipped"
          text="Fill in the missing fields below."
        />
      ) : null}

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
        onChange={handleResourceChange}
      />

      <Form.Dropdown
        id="type"
        title={typeLabel}
        value={type}
        onChange={handleTypeChange}
      >
        {visibleTypeIds.map((typeId) => (
          <Form.Dropdown.Item key={typeId} value={typeId} title={typeId} />
        ))}
      </Form.Dropdown>

      {/* ── Tag input (comma-separated) ─────────────────────────── */}
      <Form.Description
        title={
          tags.length > 0
            ? tags.map((t) => `#${t}`).join("  ")
            : "No tags yet"
        }
        text={tags.length > 0 ? "" : 'Type a tag name and press "," to add'}
      />

      <Form.TextField
        id="tagInput"
        title="Add a tag…"
        placeholder={
          tagSuggestions.length > 0
            ? `↵ to add "#${tagSuggestions[0]}", "," to create`
            : tags.length > 0
              ? '"," to add another'
              : 'Type a tag, press "," to add'
        }
        value={tagSearchInput}
        onChange={handleTagInputChange}
      />

      {tagSearchInput ? (
        <Form.Description
          title={buildTagSuggestions(
            tagSearchInput,
            existingTags,
            tags,
            5,
          )}
          text=""
        />
      ) : null}

      {isSuggesting ? (
        <Form.Description
          title="AI Suggestions"
          text="Analyzing resource content…"
        />
      ) : suggestedTags.length > 0 ? (
        <Form.Description
          title="AI Suggestions Available"
          text={`${suggestedTags.length} tag${suggestedTags.length > 1 ? "s" : ""} ready. Type \",\" to add suggested tags.`}
        />
      ) : null}

      {projectRole !== undefined && onProjectRoleChange ? (
        <Form.Dropdown
          id="role"
          title="Project Role"
          value={projectRole}
          onChange={onProjectRoleChange}
        >
          {PROJECT_ROLE_OPTIONS.map((option) => (
            <Form.Dropdown.Item
              key={option.value}
              value={option.value}
              title={option.title}
            />
          ))}
        </Form.Dropdown>
      ) : null}
    </Form>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

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

// ── Deeplink auto-save ──────────────────────────────────────────

type AutoSaveResult =
  | { kind: "saved"; entryId: string }
  | { kind: "skipped"; reason: string };

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
      message:
        "Provide `title` in the deeplink launch context, or finish in the form.",
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
    const entryId = await saveEntry(input);
    await showHUD("Added resource");
    await popToRoot();
    return { kind: "saved", entryId };
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to save resource",
      message: error instanceof Error ? error.message : String(error),
    });
    return { kind: "skipped", reason: "save-failed" };
  }
}

// ── Inline tag suggestion helper ────────────────────────────────

/**
 * Build a hint string showing matching existing tags for the given input.
 * Filters out already-selected tags from suggestions.
 */
function buildTagSuggestions(
  input: string,
  existingTags: string[],
  selectedTags: string[],
  maxResults: number,
): string {
  const normalized = normalizeTag(input);
  if (!normalized) return "";

  const matches = existingTags
    .filter(
      (tag) =>
        tagMatchesSearch(tag, normalized) && !selectedTags.includes(tag),
    )
    .slice(0, maxResults);

  if (matches.length === 0) {
    return `Press "," to create "#${normalized}"`;
  }

  const matchList =
    `↵ #${matches[0]}` +
    (matches.length > 1
      ? " · " +
        matches
          .slice(1)
          .map((t, i) => `⌘${i + 2} #${t}`)
          .join(" · ")
      : "");
  const isExactMatch = matches.some((t) => t === normalized);
  return isExactMatch
    ? `${matchList} · "," to create`
    : `${matchList} — or "," to create "#${normalized}"`;
}
