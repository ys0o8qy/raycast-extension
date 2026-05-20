import { pinyin } from "pinyin-pro";
import { normalizeTag } from "../resource";
import { Project } from "./types";

export function filterProjectsBySearch(
  projects: Project[],
  searchText: string,
): Project[] {
  const tokens = searchText
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) {
    return projects;
  }

  return projects.filter((project) => {
    const index = buildProjectSearchIndex(project);
    return tokens.every((token) => index.includes(normalizeTag(token)));
  });
}

function buildProjectSearchIndex(project: Project): string {
  const text = [
    project.title,
    project.status,
    project.owner ?? "",
    project.dueDate ?? "",
    project.notes,
    ...project.aliases,
    ...project.tags,
  ]
    .join(" ")
    .toLowerCase();
  const normalized = normalizeTag(text);

  return `${normalized} ${buildFirstLetterIndex(normalized)}`;
}

function buildFirstLetterIndex(value: string): string {
  return pinyin(value, {
    pattern: "first",
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
  }).join("");
}
