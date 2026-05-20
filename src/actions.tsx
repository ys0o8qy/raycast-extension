import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  List,
  open,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { ResourceFormFlow } from "./add-entry";
import { runAction } from "./action-runner";
import { resolveEntryActionsState } from "./entry-actions-state";
import { EntryDetail } from "./preview";
import { buildRuntimeRegistry } from "./runtime";
import { PROJECT_ROLE_OPTIONS } from "./projects/roles";
import { filterProjectsBySearch } from "./projects/search";
import {
  addProjectMembership,
  loadProjectData,
  removeProjectMembership,
} from "./projects/storage";
import { Project } from "./projects/types";
import { LibraryEntry, ResolvedAction, RuntimeRegistry } from "./types";

const FALLBACK_RUNTIME_REGISTRY = buildRuntimeRegistry({
  version: 1,
  actions: {},
  types: {},
});

export function EntryActions(props: {
  entry?: LibraryEntry;
  runtimeRegistry?: RuntimeRegistry;
  onChanged?: () => void;
  onReload?: () => void;
  projectContext?: {
    projectId: string;
    onChanged?: () => void;
  };
}) {
  const { entry, runtimeRegistry, onChanged, onReload, projectContext } =
    props ?? {};
  const { showDetailsIsPrimary, resolvedActions, url, localPath } =
    resolveEntryActionsState(
      runtimeRegistry ?? FALLBACK_RUNTIME_REGISTRY,
      entry,
    );

  async function handleResolvedAction(action: ResolvedAction) {
    try {
      await runAction(action, {
        builtins: {
          "copy-to-clipboard": (value) => Clipboard.copy(value),
          "open-in-browser": (value) => open(value),
          "open-path": (value) => open(value),
          "paste-to-frontmost-app": (value) => Clipboard.paste(value),
          "show-detail": () => undefined,
        },
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Failed to ${action.title.toLowerCase()}`,
        message: String(error),
      });
    }
  }

  return (
    <ActionPanel>
      {entry && showDetailsIsPrimary ? (
        <Action.Push
          title="Show Details"
          icon={Icon.AppWindowSidebarLeft}
          target={<EntryDetail entry={entry} />}
        />
      ) : null}
      {resolvedActions.map((action) => (
        <Action
          key={action.id}
          title={action.title}
          icon={getActionIcon(action)}
          onAction={() => handleResolvedAction(action)}
        />
      ))}
      {entry && !showDetailsIsPrimary ? (
        <Action.Push
          title="Show Details"
          icon={Icon.AppWindowSidebarLeft}
          target={<EntryDetail entry={entry} />}
        />
      ) : null}
      {entry ? (
        <Action.Push
          title="Edit Resource"
          icon={Icon.Pencil}
          shortcut={{ modifiers: ["cmd"], key: "e" }}
          target={<ResourceFormFlow entry={entry} onSaved={onChanged} />}
        />
      ) : null}
      {entry ? (
        <Action.Push
          title="Add to Project"
          icon={Icon.PlusCircle}
          target={<ProjectPicker entry={entry} onChanged={onChanged} />}
        />
      ) : null}
      {entry && projectContext ? (
        <Action
          title="Remove from Project"
          icon={Icon.XMarkCircle}
          onAction={async () => {
            await removeProjectMembership(projectContext.projectId, entry.id);
            await showHUD("Removed from project");
            projectContext.onChanged?.();
            onChanged?.();
          }}
        />
      ) : null}
      {localPath ? (
        <Action.CopyToClipboard title="Copy Local Path" content={localPath} />
      ) : null}
      {url ? <Action.CopyToClipboard title="Copy URL" content={url} /> : null}
      {entry ? (
        <Action.CopyToClipboard title="Copy Title" content={entry.title} />
      ) : null}
      {entry?.body ? (
        <Action.CopyToClipboard title="Copy Body" content={entry.body} />
      ) : null}
      {onReload ? (
        <Action
          title="Reload Resources"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
          onAction={onReload}
        />
      ) : null}
    </ActionPanel>
  );
}

function ProjectPicker(props: { entry: LibraryEntry; onChanged?: () => void }) {
  const { entry, onChanged } = props;
  const { pop } = useNavigation();
  const { data = { projects: [], memberships: [] }, isLoading } =
    useCachedPromise(loadProjectData);
  const [searchText, setSearchText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const projects = filterProjectsBySearch(
    data.projects.filter((project) => project.status !== "archived"),
    searchText,
  );

  async function addToProject(project: Project, role: string) {
    try {
      setIsSaving(true);
      await addProjectMembership(project.id, {
        entryId: entry.id,
        role,
        order:
          data.memberships.filter(
            (membership) => membership.projectId === project.id,
          ).length *
            10 +
          10,
      });
      await showHUD("Added to project");
      onChanged?.();
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add to project",
        message: String(error),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <List
      isLoading={isLoading || isSaving}
      navigationTitle="Add to Project"
      searchBarPlaceholder="Search projects..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
    >
      {projects.map((project) => (
        <List.Item
          key={project.id}
          title={project.title}
          subtitle={project.status}
          icon={Icon.Folder}
          actions={
            <ActionPanel>
              <ActionPanel.Submenu title="Add as Role" icon={Icon.PlusCircle}>
                {PROJECT_ROLE_OPTIONS.map((role) => (
                  <Action
                    key={role.value}
                    title={role.title}
                    onAction={() => addToProject(project, role.value)}
                  />
                ))}
              </ActionPanel.Submenu>
            </ActionPanel>
          }
        />
      ))}
      {projects.length === 0 ? (
        <List.EmptyView
          title="No projects"
          description="Create a project from Search Projects first"
          icon={Icon.Folder}
        />
      ) : null}
    </List>
  );
}

function getActionIcon(action: ResolvedAction): Icon {
  if (action.mode === "command") {
    return Icon.Terminal;
  }

  switch (action.builtin) {
    case "copy-to-clipboard":
      return Icon.Clipboard;
    case "open-in-browser":
      return Icon.Globe;
    case "open-path":
      return Icon.Folder;
    case "paste-to-frontmost-app":
      return Icon.TextCursor;
    case "show-detail":
      return Icon.AppWindowSidebarLeft;
  }
}
