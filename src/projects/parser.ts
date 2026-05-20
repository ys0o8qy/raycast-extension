import { normalizeTags } from "../resource";
import { OrgNode } from "../types";
import { Project, ProjectData, ProjectMembership } from "./types";

const PROJECTS_ROOT_TITLE = "Projects";

export function extractProjectData(nodes: OrgNode[]): ProjectData {
  const projectsRoot = nodes.find(
    (node) => node.level === 1 && node.title === PROJECTS_ROOT_TITLE,
  );

  if (!projectsRoot) {
    return { projects: [], memberships: [] };
  }

  const projects: Project[] = [];
  const memberships: ProjectMembership[] = [];

  for (const projectNode of projectsRoot.children) {
    const project = nodeToProject(projectNode);
    if (!project) {
      continue;
    }

    projects.push(project);
    memberships.push(...extractProjectMemberships(project.id, projectNode));
  }

  return { projects, memberships };
}

function nodeToProject(node: OrgNode): Project | undefined {
  const id = node.properties.PROJECT_ID?.trim();
  if (!id) {
    return undefined;
  }

  return {
    id,
    title: node.title,
    status: node.properties.STATUS?.trim() || "active",
    aliases: splitCommaList(node.properties.ALIASES),
    owner: optionalProperty(node.properties.OWNER),
    dueDate: optionalProperty(node.properties.DUE),
    tags: normalizeTags(splitSpaceList(node.properties.TAGS)),
    notes: node.body,
    sourceStartLine: node.sourceStartLine,
    sourceEndLine: node.sourceEndLine,
  };
}

function extractProjectMemberships(
  projectId: string,
  projectNode: OrgNode,
): ProjectMembership[] {
  const memberships: ProjectMembership[] = [];

  function visit(node: OrgNode) {
    const entryId = node.properties.ENTRY_ID?.trim();
    if (entryId) {
      memberships.push({
        projectId,
        entryId,
        role: normalizeRole(node.properties.ROLE || node.title),
        titleOverride: optionalProperty(node.properties.TITLE),
        note: optionalProperty(node.properties.NOTE),
        order: parseOrder(node.properties.ORDER),
        sourceStartLine: node.sourceStartLine,
        sourceEndLine: node.sourceEndLine,
      });
    }

    node.children.forEach(visit);
  }

  projectNode.children.forEach(visit);
  return memberships.sort((left, right) => left.order - right.order);
}

export function normalizeRole(role: string): string {
  return role.trim().toLowerCase().replace(/\s+/g, "-") || "other";
}

export function displayRole(role: string): string {
  if (role === "prd") {
    return "PRD";
  }
  if (role === "api-doc") {
    return "API Docs";
  }

  return role
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function optionalProperty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function splitCommaList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitSpaceList(value: string | undefined): string[] {
  return (value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOrder(value: string | undefined): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : 1000;
}
