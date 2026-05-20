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
