export const PROJECT_ROLE_OPTIONS = [
  { value: "prd", title: "PRD" },
  { value: "technical-doc", title: "Technical Docs" },
  { value: "design", title: "Design" },
  { value: "test-account", title: "Test Account" },
  { value: "environment", title: "Environment" },
  { value: "api-doc", title: "API Docs" },
  { value: "issue", title: "Issue" },
  { value: "pull-request", title: "Pull Request" },
  { value: "notes", title: "Notes" },
  { value: "other", title: "Other" },
];

export const PROJECT_ROLE_ORDER = PROJECT_ROLE_OPTIONS.map(
  (option) => option.value,
);

export function filterRoleOptions(
  searchText: string,
): Array<{ value: string; title: string }> {
  const query = searchText.trim().toLowerCase();
  if (!query) return PROJECT_ROLE_OPTIONS;

  return PROJECT_ROLE_OPTIONS.filter(
    (option) =>
      option.title.toLowerCase().includes(query) ||
      option.value.toLowerCase().includes(query),
  );
}

export function isCustomRole(searchText: string): boolean {
  const query = searchText.trim().toLowerCase();
  if (!query) return false;
  return !PROJECT_ROLE_OPTIONS.some(
    (option) => option.value.toLowerCase() === query,
  );
}
