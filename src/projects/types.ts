import { LibraryEntry } from "../types";

export interface Project {
  id: string;
  title: string;
  status: string;
  aliases: string[];
  owner?: string;
  dueDate?: string;
  tags: string[];
  notes: string;
  sourceStartLine: number;
  sourceEndLine: number;
}

export interface ProjectInput {
  id?: string;
  title: string;
  status?: string;
  aliases?: string[];
  owner?: string;
  dueDate?: string;
  tags?: string[];
  notes?: string;
}

export interface ProjectMembership {
  projectId: string;
  entryId: string;
  role: string;
  titleOverride?: string;
  note?: string;
  order: number;
  sourceStartLine: number;
  sourceEndLine: number;
}

export interface ProjectMembershipInput {
  entryId: string;
  role: string;
  titleOverride?: string;
  note?: string;
  order?: number;
}

export interface ProjectData {
  projects: Project[];
  memberships: ProjectMembership[];
}

export interface ProjectRoleSection {
  role: string;
  entries: Array<{
    entry: LibraryEntry;
    membership: ProjectMembership;
  }>;
}

export interface ProjectViewModel {
  project: Project;
  sections: ProjectRoleSection[];
  missingEntryIds: string[];
}
