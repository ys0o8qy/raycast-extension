import { LibraryEntry } from "../types";
import {
  Project,
  ProjectMembership,
  ProjectRoleSection,
  ProjectViewModel,
} from "./types";
import { PROJECT_ROLE_ORDER } from "./roles";

export function buildProjectViewModel(
  project: Project,
  memberships: ProjectMembership[],
  entries: LibraryEntry[],
): ProjectViewModel {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const sectionsByRole = new Map<string, ProjectRoleSection>();
  const missingEntryIds: string[] = [];

  for (const membership of memberships
    .filter((candidate) => candidate.projectId === project.id)
    .sort((left, right) => left.order - right.order)) {
    const entry = entriesById.get(membership.entryId);
    if (!entry) {
      missingEntryIds.push(membership.entryId);
      continue;
    }

    const role = membership.role || "other";
    const section =
      sectionsByRole.get(role) ??
      ({
        role,
        entries: [],
      } satisfies ProjectRoleSection);

    section.entries.push({ entry, membership });
    sectionsByRole.set(role, section);
  }

  const sections = Array.from(sectionsByRole.values()).sort((left, right) =>
    compareRoles(left.role, right.role),
  );

  return { project, sections, missingEntryIds };
}

function compareRoles(left: string, right: string): number {
  const leftIndex = PROJECT_ROLE_ORDER.indexOf(left);
  const rightIndex = PROJECT_ROLE_ORDER.indexOf(right);

  if (leftIndex !== -1 || rightIndex !== -1) {
    return normalizeRoleIndex(leftIndex) - normalizeRoleIndex(rightIndex);
  }

  return left.localeCompare(right);
}

function normalizeRoleIndex(index: number): number {
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}
