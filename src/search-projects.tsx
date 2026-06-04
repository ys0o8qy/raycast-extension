import {
  Action,
  ActionPanel,
  Color,
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
import { EntryActions } from "./actions";
import { ResourceFormFlow } from "./add-entry";
import { filterEntriesBySearch } from "./resource";
import { ResourceDetail } from "./resource-detail";
import { buildRuntimeRegistry } from "./runtime";
import { loadRuntimeRegistry } from "./storage";
import { LibraryEntry } from "./types";
import { buildCompactResourceSubtitle, iconForType } from "./list-helpers";
import { displayRole } from "./projects/parser";
import { RolePicker } from "./projects/role-picker";
import { filterProjectsBySearch } from "./projects/search";
import {
  addProjectMembership,
  archiveProject,
  loadProjectDataWithEntries,
  saveProject,
  updateProject,
} from "./projects/storage";
import { Project, ProjectInput } from "./projects/types";
import { buildProjectViewModel } from "./projects/view-model";

const FALLBACK_RUNTIME_REGISTRY = buildRuntimeRegistry({
  version: 1,
  actions: {},
  types: {},
});

interface ProjectFormValues {
  title: string;
  status: string;
  owner: string;
}

export default function SearchProjectsCommand() {
  const { data, isLoading, revalidate } = useCachedPromise(
    loadProjectDataWithEntries,
  );
  const [searchText, setSearchText] = useState("");
  const projects = filterProjectsBySearch(
    data?.projects ?? [],
    searchText,
  );
  const membershipCounts = new Map<string, number>();
  for (const membership of data?.memberships ?? []) {
    membershipCounts.set(
      membership.projectId,
      (membershipCounts.get(membership.projectId) ?? 0) + 1,
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search projects..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      throttle
    >
      {projects.map((project) => (
        <List.Item
          key={project.id}
          title={project.title}
          subtitle={buildProjectSubtitle(
            project,
            membershipCounts.get(project.id) ?? 0,
          )}
          icon={projectIcon(project)}
          actions={
            <ProjectListActions project={project} onChanged={revalidate} />
          }
        />
      ))}
      {projects.length === 0 ? (
        <List.EmptyView
          title={searchText.trim() ? "No matching projects" : "No projects yet"}
          description={
            searchText.trim()
              ? "Try a different project search"
              : "Create a project to gather PRDs, technical docs, test accounts, and related resources"
          }
          icon={Icon.Folder}
          actions={
            <ActionPanel>
              <Action.Push
                title="Create Project"
                icon={Icon.Plus}
                target={<ProjectForm onSaved={revalidate} />}
              />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}

function projectIcon(project: Project): { source: Icon; tintColor: Color } {
  switch (project.status) {
    case "archived":
      return { source: Icon.Folder, tintColor: Color.SecondaryText };
    case "done":
      return { source: Icon.Folder, tintColor: Color.Green };
    case "on-hold":
      return { source: Icon.Folder, tintColor: Color.Orange };
    default:
      return { source: Icon.Folder, tintColor: Color.Blue };
  }
}

function buildProjectSubtitle(project: Project, resourceCount: number): string {
  if (project.status === "archived") {
    return "(archived)";
  }
  const parts = [
    `${resourceCount} resource${resourceCount === 1 ? "" : "s"}`,
  ];
  if (project.status && project.status !== "active") {
    parts.push(project.status);
  }
  if (project.owner) {
    parts.push(project.owner);
  }
  return parts.join(" · ");
}

function ProjectListActions(props: {
  project: Project;
  onChanged: () => void;
}) {
  const { project, onChanged } = props;

  async function handleArchive() {
    try {
      await archiveProject(project.id);
      await showHUD("Archived project");
      onChanged();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to archive project",
        message: String(error),
      });
    }
  }

  return (
    <ActionPanel>
      <Action.Push
        title="Open Project"
        icon={Icon.ArrowRight}
        shortcut={{ modifiers: ["cmd"], key: "o" }}
        target={<ProjectResourcesView projectId={project.id} />}
      />
      <Action.Push
        title="Create Project"
        icon={Icon.Plus}
        shortcut={{ modifiers: ["cmd"], key: "n" }}
        target={<ProjectForm onSaved={onChanged} />}
      />
      <Action.Push
        title="Edit Project"
        icon={Icon.Pencil}
        shortcut={{ modifiers: ["cmd"], key: "e" }}
        target={<ProjectForm project={project} onSaved={onChanged} />}
      />
      <Action
        title="Archive Project"
        icon={Icon.Tray}
        style={Action.Style.Destructive}
        shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
        onAction={handleArchive}
      />
    </ActionPanel>
  );
}

function ProjectResourcesView(props: { projectId: string }) {
  const { projectId } = props;
  const { data, isLoading, revalidate } = useCachedPromise(
    loadProjectDataWithEntries,
  );
  const { data: runtimeRegistry = FALLBACK_RUNTIME_REGISTRY } =
    useCachedPromise(loadRuntimeRegistry);
  const [searchText, setSearchText] = useState("");
  const project = data?.projects.find(
    (candidate) => candidate.id === projectId,
  );

  if (!project) {
    return (
      <List isLoading={isLoading} navigationTitle="Project">
        <List.EmptyView title="Project not found" icon={Icon.Folder} />
      </List>
    );
  }

  const projectMemberships = data?.memberships ?? [];
  const allEntries = data?.entries ?? [];
  const viewModel = buildProjectViewModel(project, projectMemberships, allEntries);
  const nextOrder =
    projectMemberships.filter(
      (membership) => membership.projectId === project.id,
    ).length *
      10 +
    10;

  // IDs of resources already in this project
  const projectEntryIds = new Set(
    projectMemberships
      .filter((membership) => membership.projectId === project.id)
      .map((membership) => membership.entryId),
  );

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      navigationTitle={project.title}
      searchBarPlaceholder="Search project resources..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      throttle
      actions={
        <ProjectResourceListActions
          project={project}
          nextOrder={nextOrder}
          onChanged={revalidate}
        />
      }
    >
      {viewModel.sections.map((section) => {
        const visibleEntries = section.entries.filter(
          ({ entry }) => filterEntriesBySearch([entry], searchText).length > 0,
        );

        return visibleEntries.length > 0 ? (
          <List.Section
            key={section.role}
            title={displayRole(section.role)}
            subtitle={`${visibleEntries.length}`}
          >
            {visibleEntries.map(({ entry, membership }) => (
              <List.Item
                key={`${membership.projectId}:${membership.entryId}`}
                title={membership.titleOverride || entry.title}
                icon={iconForType(entry.type)}
                subtitle={buildCompactResourceSubtitle(entry)}
                detail={
                  <ResourceDetail entry={entry} projects={[project.title]} />
                }
                actions={
                  <EntryActions
                    entry={entry}
                    runtimeRegistry={runtimeRegistry}
                    onChanged={revalidate}
                    projectContext={{
                      projectId: project.id,
                      onChanged: revalidate,
                      project,
                      nextOrder,
                    }}
                  />
                }
              />
            ))}
          </List.Section>
        ) : null;
      })}

      {viewModel.missingEntryIds.length > 0 ? (
        <List.Section
          title="Missing Resources"
          subtitle={`${viewModel.missingEntryIds.length}`}
        >
          {viewModel.missingEntryIds.map((entryId) => (
            <List.Item
              key={entryId}
              title={entryId}
              subtitle="Referenced resource is missing"
              icon={Icon.Warning}
            />
          ))}
        </List.Section>
      ) : null}

      {viewModel.sections.length === 0 &&
      viewModel.missingEntryIds.length === 0 ? (
        <List.EmptyView
          title={searchText.trim() ? "No matching resources" : "No resources in this project"}
          description="Press ⌘N to add resources"
          icon={Icon.Folder}
          actions={
            <ProjectResourceListActions
              project={project}
              nextOrder={nextOrder}
              onChanged={revalidate}
            />
          }
        />
      ) : null}
    </List>
  );
}

function ProjectResourceListActions(props: {
  project: Project;
  nextOrder: number;
  onChanged: () => void;
}) {
  const { project, nextOrder, onChanged } = props;

  return (
    <ActionPanel>
      <Action.Push
        title="Add Resources…"
        icon={Icon.PlusCircle}
        shortcut={{ modifiers: ["cmd"], key: "n" }}
        target={
          <AddResourcesToProject
            project={project}
            nextOrder={nextOrder}
            onChanged={onChanged}
          />
        }
      />
      <Action.Push
        title="Add New Resource"
        icon={Icon.Plus}
        shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
        target={
          <NewResourceWithRoleFlow
            project={project}
            nextOrder={nextOrder}
            onChanged={onChanged}
          />
        }
      />
      <Action.Push
        title="Rename Project"
        icon={Icon.Pencil}
        shortcut={{ modifiers: ["cmd"], key: "e" }}
        target={<ProjectForm project={project} onSaved={onChanged} />}
      />
    </ActionPanel>
  );
}

/**
 * Dedicated resource picker for adding existing resources to a project.
 * Separated from the main project view so the search bar there only filters
 * project resources — not a dual-purpose filter+search.
 */
export function AddResourcesToProject(props: {
  project: Project;
  nextOrder: number;
  onChanged: () => void;
}) {
  const { project, nextOrder, onChanged } = props;
  const { data, isLoading } = useCachedPromise(loadProjectDataWithEntries);
  const { pop } = useNavigation();
  const [searchText, setSearchText] = useState("");
  const [optimisticIds, setOptimisticIds] = useState<Set<string>>(new Set());

  const allEntries = data?.entries ?? [];
  const projectMemberships = data?.memberships ?? [];
  const projectEntryIds = new Set(
    projectMemberships
      .filter((m) => m.projectId === project.id)
      .map((m) => m.entryId),
  );

  const availableEntries = filterEntriesBySearch(
    allEntries.filter(
      (entry) =>
        !projectEntryIds.has(entry.id) && !optimisticIds.has(entry.id),
    ),
    searchText,
  );

  async function addEntry(entry: LibraryEntry, role: string) {
    // Optimistic: immediately remove from available list
    setOptimisticIds((prev) => new Set([...prev, entry.id]));
    try {
      await addProjectMembership(project.id, {
        entryId: entry.id,
        role,
        order: nextOrder,
      });
      await showHUD("Added to project");
      onChanged();
      pop();
    } catch (error) {
      // Revert optimistic removal on failure
      setOptimisticIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add resource",
        message: String(error),
      });
    }
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      navigationTitle="Add Resources to Project"
      searchBarPlaceholder="Search resources…"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      throttle
    >
      {availableEntries.map((entry) => (
        <List.Item
          key={entry.id}
          title={entry.title}
          icon={iconForType(entry.type)}
          subtitle={buildCompactResourceSubtitle(entry)}
          detail={<ResourceDetail entry={entry} />}
          actions={
            <ActionPanel>
              <Action
                title="Add to Project"
                icon={Icon.PlusCircle}
                shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                onAction={() => addEntry(entry, "other")}
              />
              <Action.Push
                title="Add with Role…"
                icon={Icon.Tag}
                target={
                  <RolePicker
                    navigationTitle={`Add "${entry.title}"`}
                    onSelect={(role) => addEntry(entry, role)}
                  />
                }
              />
            </ActionPanel>
          }
        />
      ))}
      {availableEntries.length === 0 ? (
        <List.EmptyView
          title={
            searchText.trim()
              ? "No matching resources"
              : "No available resources"
          }
          description={
            searchText.trim()
              ? "Try a different search"
              : "All your resources are already in this project"
          }
          icon={Icon.Folder}
        />
      ) : null}
    </List>
  );
}

/**
 * Resource creation flow with inline role selection.
 * Shows ResourceFormFlow directly with a Project Role dropdown;
 * no separate RolePicker step is needed.
 */
export function NewResourceWithRoleFlow(props: {
  project: Project;
  nextOrder: number;
  onChanged: () => void;
}) {
  const { project, nextOrder, onChanged } = props;
  const [selectedRole, setSelectedRole] = useState<string>("other");

  async function handleSaved(entryId: string) {
    try {
      await addProjectMembership(project.id, {
        entryId,
        role: selectedRole,
        order: nextOrder,
      });
      await showHUD("Added to project");
      onChanged();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add resource to project",
        message: String(error),
      });
    }
  }

  return (
    <ResourceFormFlow
      onSaved={handleSaved}
      projectRole={selectedRole}
      onProjectRoleChange={setSelectedRole}
    />
  );
}

function ProjectForm(props: { project?: Project; onSaved: () => void }) {
  const { project, onSaved } = props;
  const { pop } = useNavigation();

  async function handleSubmit(values: ProjectFormValues) {
    const { title, status, owner } = values;
    if (!values.title.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Project name is required",
      });
      return;
    }

    const input = projectFormValuesToInput(values, project?.id);

    try {
      if (project) {
        await updateProject(project.id, input);
        await showHUD("Updated project");
      } else {
        await saveProject(input);
        await showHUD("Created project");
      }
      onSaved();
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: project
          ? "Failed to update project"
          : "Failed to create project",
        message: String(error),
      });
    }
  }

  return (
    <Form
      navigationTitle={project ? "Rename Project" : "Create Project"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={project ? "Rename Project" : "Create Project"}
            icon={Icon.Check}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Project Name"
        placeholder="Payment redesign"
        defaultValue={project?.title ?? ""}
      />
      <Form.Dropdown
        id="status"
        title="Status"
        defaultValue={project?.status ?? "active"}
      >
        <Form.Dropdown.Item value="active" title="Active" />
        <Form.Dropdown.Item value="done" title="Done" />
        <Form.Dropdown.Item value="on-hold" title="On Hold" />
        <Form.Dropdown.Item value="archived" title="Archived" />
      </Form.Dropdown>
      <Form.TextField
        id="owner"
        title="Owner"
        placeholder="Owner name (optional)"
        defaultValue={project?.owner ?? ""}
      />
    </Form>
  );
}

function projectFormValuesToInput(
  values: ProjectFormValues,
  projectId?: string,
): ProjectInput {
  return {
    id: projectId,
    title: values.title,
    status: values.status,
    owner: values.owner || undefined,
  };
}
