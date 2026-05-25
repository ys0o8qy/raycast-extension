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
import { EntryActions } from "./actions";
import { ResourceFormFlow } from "./add-entry";
import { renderEntryMarkdown } from "./preview";
import { filterEntriesBySearch } from "./resource";
import { buildRuntimeRegistry } from "./runtime";
import { loadRuntimeRegistry } from "./storage";
import { LibraryEntry } from "./types";
import { displayRole } from "./projects/parser";
import { PROJECT_ROLE_OPTIONS } from "./projects/roles";
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
          icon={Icon.Folder}
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
        target={<ProjectResourcesView projectId={project.id} />}
      />
      <Action.Push
        title="Create Project"
        icon={Icon.Plus}
        target={<ProjectForm onSaved={onChanged} />}
      />
      <Action.Push
        title="Edit Project"
        icon={Icon.Pencil}
        target={<ProjectForm project={project} onSaved={onChanged} />}
      />
      <Action
        title="Archive Project"
        icon={Icon.Tray}
        style={Action.Style.Destructive}
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
  const entries = data?.entries ?? [];
  const viewModel = buildProjectViewModel(project, projectMemberships, entries);
  const nextOrder =
    projectMemberships.filter(
      (membership) => membership.projectId === project.id,
    ).length *
      10 +
    10;

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
                subtitle={entry.type}
                icon={iconForType(entry.type)}
                detail={
                  <List.Item.Detail markdown={renderEntryMarkdown(entry)} />
                }
                actions={
                  <EntryActions
                    entry={entry}
                    runtimeRegistry={runtimeRegistry}
                    onChanged={revalidate}
                    projectContext={{
                      projectId: project.id,
                      onChanged: revalidate,
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
          title="No resources in this project"
          description="Add existing resources from the action panel"
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
      {viewModel.sections.length > 0 ? (
        <List.Item
          title="Project Actions"
          icon={Icon.Gear}
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

  async function attachCreatedResource(entryId: string, role: string) {
    try {
      await addProjectMembership(project.id, {
        entryId,
        role,
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
    <ActionPanel>
      <Action.Push
        title="Add Existing Resource"
        icon={Icon.PlusCircle}
        target={
          <ProjectResourcePicker project={project} onChanged={onChanged} />
        }
      />
      <ActionPanel.Submenu title="Add New Resource as Role" icon={Icon.Plus}>
        {PROJECT_ROLE_OPTIONS.map((role) => (
          <Action.Push
            key={role.value}
            title={role.title}
            target={
              <ResourceFormFlow
                onSaved={(entryId) =>
                  attachCreatedResource(entryId, role.value)
                }
              />
            }
          />
        ))}
      </ActionPanel.Submenu>
      <Action.Push
        title="Edit Project"
        icon={Icon.Pencil}
        target={<ProjectForm project={project} onSaved={onChanged} />}
      />
    </ActionPanel>
  );
}

function ProjectResourcePicker(props: {
  project: Project;
  onChanged: () => void;
}) {
  const { project, onChanged } = props;
  const { pop } = useNavigation();
  const { data, isLoading } = useCachedPromise(loadProjectDataWithEntries);
  const [searchText, setSearchText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const existingEntryIds = new Set(
    (data?.memberships ?? [])
      .filter((membership) => membership.projectId === project.id)
      .map((membership) => membership.entryId),
  );
  const entries = filterEntriesBySearch(
    (data?.entries ?? []).filter((entry) => !existingEntryIds.has(entry.id)),
    searchText,
  );

  async function addEntry(entry: LibraryEntry, role: string) {
    try {
      setIsSaving(true);
      await addProjectMembership(project.id, {
        entryId: entry.id,
        role,
        order: existingEntryIds.size * 10 + 10,
      });
      await showHUD("Added to project");
      onChanged();
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add resource",
        message: String(error),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <List
      isLoading={isLoading || isSaving}
      searchBarPlaceholder="Search resources to add..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      throttle
    >
      {entries.map((entry) => (
        <List.Item
          key={entry.id}
          title={entry.title}
          subtitle={entry.type}
          icon={iconForType(entry.type)}
          actions={
            <ActionPanel>
              <ActionPanel.Submenu title="Add as Role" icon={Icon.PlusCircle}>
                {PROJECT_ROLE_OPTIONS.map((role) => (
                  <Action
                    key={role.value}
                    title={role.title}
                    onAction={() => addEntry(entry, role.value)}
                  />
                ))}
              </ActionPanel.Submenu>
            </ActionPanel>
          }
        />
      ))}
      {entries.length === 0 ? (
        <List.EmptyView
          title="No resources available"
          description="Create resources first, then add them to this project"
          icon={Icon.Document}
        />
      ) : null}
    </List>
  );
}

function ProjectForm(props: { project?: Project; onSaved: () => void }) {
  const { project, onSaved } = props;
  const { pop } = useNavigation();

  async function handleSubmit(values: ProjectFormValues) {
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
  };
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
