import { promises as fs } from "node:fs";
import { parseOrg } from "../org/parser";
import { loadEntries, readOrgFile, getOrgFilePath } from "../storage";
import {
  appendProjectMembershipToOrg,
  appendProjectToOrg,
  archiveProjectInOrg,
  removeProjectMembershipFromOrg,
  updateProjectInOrg,
} from "./serializer";
import { extractProjectData } from "./parser";
import { ProjectData, ProjectInput, ProjectMembershipInput } from "./types";

export async function loadProjectData(): Promise<ProjectData> {
  try {
    const content = await readOrgFile();
    return extractProjectData(parseOrg(content));
  } catch {
    return { projects: [], memberships: [] };
  }
}

export async function loadProjectDataWithEntries() {
  const [projectData, entries] = await Promise.all([
    loadProjectData(),
    loadEntries(),
  ]);

  return { ...projectData, entries };
}

export async function saveProject(input: ProjectInput): Promise<void> {
  await updateOrgContent((content) => appendProjectToOrg(content, input));
}

export async function updateProject(
  projectId: string,
  input: ProjectInput,
): Promise<void> {
  await updateOrgContent((content) =>
    updateProjectInOrg(content, projectId, input),
  );
}

export async function archiveProject(projectId: string): Promise<void> {
  await updateOrgContent((content) => archiveProjectInOrg(content, projectId));
}

export async function addProjectMembership(
  projectId: string,
  input: ProjectMembershipInput,
): Promise<void> {
  await updateOrgContent((content) =>
    appendProjectMembershipToOrg(content, projectId, input),
  );
}

export async function removeProjectMembership(
  projectId: string,
  entryId: string,
): Promise<void> {
  await updateOrgContent((content) =>
    removeProjectMembershipFromOrg(content, projectId, entryId),
  );
}

async function updateOrgContent(
  updater: (content: string) => string,
): Promise<void> {
  const path = getOrgFilePath();
  let content = "";

  try {
    content = await fs.readFile(path, "utf8");
  } catch {
    // Project creation can initialize the file just like resource creation.
  }

  await fs.writeFile(path, updater(content), "utf8");
}
