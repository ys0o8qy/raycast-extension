import { randomUUID } from "node:crypto";
import { parseOrg } from "../org/parser";
import { displayRole, extractProjectData, normalizeRole } from "./parser";
import { ProjectInput, ProjectMembershipInput } from "./types";

const PROJECTS_ROOT_HEADING = "* Projects";

export function appendProjectToOrg(
  content: string,
  input: ProjectInput,
): string {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  const project = normalizeProjectInput(input);
  const projectBlock = buildProjectBlock(project);

  if (!normalized) {
    return `${PROJECTS_ROOT_HEADING}\n${projectBlock}\n`;
  }

  const lines = normalized.split("\n");
  const rootIndex = findProjectsRootIndex(lines);

  if (rootIndex === -1) {
    return `${normalized}\n\n${PROJECTS_ROOT_HEADING}\n${projectBlock}\n`;
  }

  const insertIndex = findRootEndIndex(lines, rootIndex);
  lines.splice(insertIndex, 0, "", projectBlock);

  return normalizeOrgOutput(lines.join("\n"));
}

export function updateProjectInOrg(
  content: string,
  projectId: string,
  input: ProjectInput,
): string {
  const project = findProjectOrThrow(content, projectId);
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const normalizedInput = normalizeProjectInput({
    ...input,
    id: projectId,
  });
  const replacement = buildProjectBlock(
    normalizedInput,
    extractProjectMembershipBlocks(
      lines,
      project.sourceStartLine,
      project.sourceEndLine,
    ),
  );

  lines.splice(
    project.sourceStartLine,
    project.sourceEndLine - project.sourceStartLine,
    ...replacement.split("\n"),
  );

  return normalizeOrgOutput(lines.join("\n"));
}

export function archiveProjectInOrg(
  content: string,
  projectId: string,
): string {
  const project = findProjectOrThrow(content, projectId);
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  lines.splice(
    project.sourceStartLine,
    project.sourceEndLine - project.sourceStartLine,
  );
  return normalizeOrgOutput(lines.join("\n"));
}

export function appendProjectMembershipToOrg(
  content: string,
  projectId: string,
  input: ProjectMembershipInput,
): string {
  const project = findProjectOrThrow(content, projectId);
  const data = extractProjectData(parseOrg(content));
  const existing = data.memberships.find(
    (membership) =>
      membership.projectId === projectId &&
      membership.entryId === input.entryId,
  );

  if (existing) {
    return content;
  }

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const block = buildMembershipBlock(input);
  lines.splice(project.sourceEndLine, 0, "", block);

  return normalizeOrgOutput(lines.join("\n"));
}

export function removeProjectMembershipFromOrg(
  content: string,
  projectId: string,
  entryId: string,
): string {
  const data = extractProjectData(parseOrg(content));
  const membership = data.memberships.find(
    (candidate) =>
      candidate.projectId === projectId && candidate.entryId === entryId,
  );

  if (!membership) {
    return content;
  }

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  lines.splice(
    membership.sourceStartLine,
    membership.sourceEndLine - membership.sourceStartLine,
  );

  return normalizeOrgOutput(lines.join("\n"));
}

function buildProjectBlock(
  input: Required<ProjectInput>,
  membershipBlocks: string[] = [],
): string {
  const propertyLines: Array<[string, string | undefined]> = [
    ["PROJECT_ID", input.id],
  ];

  return [
    `** ${input.title.trim()}`,
    ":PROPERTIES:",
    ...propertyLines
      .filter(([, value]) => Boolean(value && value.trim()))
      .map(([key, value]) => `:${key}: ${value}`),
    ":END:",
    ...membershipBlocks,
  ].join("\n");
}

function buildMembershipBlock(input: ProjectMembershipInput): string {
  const role = normalizeRole(input.role);
  const order = input.order ?? 1000;
  const propertyLines: Array<[string, string | undefined]> = [
    ["ENTRY_ID", input.entryId],
    ["ROLE", role],
    ["ORDER", String(order)],
    ["TITLE", input.titleOverride],
    ["NOTE", input.note],
  ];

  return [
    `*** ${displayRole(role)}`,
    ":PROPERTIES:",
    ...propertyLines
      .filter(([, value]) => Boolean(value && value.trim()))
      .map(([key, value]) => `:${key}: ${value}`),
    ":END:",
  ].join("\n");
}

function normalizeProjectInput(input: ProjectInput): Required<ProjectInput> {
  return {
    id: input.id?.trim() || `proj_${randomUUID()}`,
    title: input.title.trim(),
  };
}


function findProjectOrThrow(content: string, projectId: string) {
  const project = extractProjectData(parseOrg(content)).projects.find(
    (candidate) => candidate.id === projectId,
  );

  if (!project) {
    throw new Error(`Could not find project ${projectId}`);
  }

  return project;
}

function extractProjectMembershipBlocks(
  lines: string[],
  startLine: number,
  endLine: number,
): string[] {
  const blocks: string[] = [];
  let index = startLine + 1;

  while (index < endLine) {
    const line = lines[index];
    if (/^\*\*\*\s+/.test(line)) {
      const blockStart = index;
      index += 1;
      while (index < endLine && !/^\*\*\*\s+/.test(lines[index])) {
        index += 1;
      }
      blocks.push(lines.slice(blockStart, index).join("\n").trimEnd());
      continue;
    }
    index += 1;
  }

  return blocks;
}

function findProjectsRootIndex(lines: string[]): number {
  return lines.findIndex((line) => line.trim() === PROJECTS_ROOT_HEADING);
}

function findRootEndIndex(lines: string[], rootIndex: number): number {
  for (let index = rootIndex + 1; index < lines.length; index += 1) {
    if (/^\*\s+/.test(lines[index])) {
      return index;
    }
  }

  return lines.length;
}

function normalizeOrgOutput(content: string): string {
  return `${content.replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}
