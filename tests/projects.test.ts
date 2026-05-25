import test from "node:test";
import assert from "node:assert/strict";
import { parseOrg } from "../src/org/parser";
import {
  appendProjectToOrg,
  appendProjectMembershipToOrg,
  archiveProjectInOrg,
  removeProjectMembershipFromOrg,
} from "../src/projects/serializer";
import { extractProjectData } from "../src/projects/parser";
import { buildProjectViewModel } from "../src/projects/view-model";
import { filterProjectsBySearch } from "../src/projects/search";
import { LibraryEntry } from "../src/types";

const PROJECT_ORG = `* Projects
** Payment Redesign
:PROPERTIES:
:PROJECT_ID: proj_payment
:STATUS: active
:OWNER: alice
:DUE: 2026-06-15
:ALIASES: pay-v2, checkout redesign
:TAGS: payment frontend
:END:
Project notes for checkout.

*** PRD
:PROPERTIES:
:ENTRY_ID: prd-1
:ROLE: prd
:ORDER: 10
:END:

*** Technical Design
:PROPERTIES:
:ENTRY_ID: tech-1
:ROLE: technical-doc
:ORDER: 20
:NOTE: Keep architecture updated.
:END:

*** Missing Reference
:PROPERTIES:
:ENTRY_ID: missing-1
:ROLE: environment
:ORDER: 30
:END:
`;

test("extractProjectData parses projects and memberships from the Projects root", () => {
  const data = extractProjectData(parseOrg(PROJECT_ORG));

  assert.deepEqual(data.projects, [
    {
      id: "proj_payment",
      title: "Payment Redesign",
      status: "active",
      aliases: ["pay-v2", "checkout redesign"],
      owner: "alice",
      dueDate: "2026-06-15",
      tags: ["frontend", "payment"],
      notes: "Project notes for checkout.",
      sourceStartLine: 1,
      sourceEndLine: 34,
    },
  ]);
  assert.deepEqual(data.memberships, [
    {
      projectId: "proj_payment",
      entryId: "prd-1",
      role: "prd",
      titleOverride: undefined,
      note: undefined,
      order: 10,
      sourceStartLine: 12,
      sourceEndLine: 19,
    },
    {
      projectId: "proj_payment",
      entryId: "tech-1",
      role: "technical-doc",
      titleOverride: undefined,
      note: "Keep architecture updated.",
      order: 20,
      sourceStartLine: 19,
      sourceEndLine: 27,
    },
    {
      projectId: "proj_payment",
      entryId: "missing-1",
      role: "environment",
      titleOverride: undefined,
      note: undefined,
      order: 30,
      sourceStartLine: 27,
      sourceEndLine: 34,
    },
  ]);
});

test("filterProjectsBySearch matches title aliases owner status tags notes and Chinese first letters", () => {
  const [project] = extractProjectData(parseOrg(PROJECT_ORG)).projects;
  const chineseProject = {
    ...project,
    id: "proj_chinese",
    title: "支付改版",
    aliases: [],
    owner: "bob",
    notes: "收银台资料",
    tags: ["支付"],
  };

  assert.deepEqual(filterProjectsBySearch([project], "checkout"), [project]);
  assert.deepEqual(filterProjectsBySearch([project], "alice active"), [
    project,
  ]);
  assert.deepEqual(filterProjectsBySearch([project], "frontend"), [project]);
  assert.deepEqual(filterProjectsBySearch([chineseProject], "zfgb"), [
    chineseProject,
  ]);
  assert.deepEqual(filterProjectsBySearch([project], "missing"), []);
});

test("buildProjectViewModel groups entries by role and records missing resources", () => {
  const data = extractProjectData(parseOrg(PROJECT_ORG));
  const entries = [
    createEntry({ id: "tech-1", title: "Technical Design" }),
    createEntry({ id: "prd-1", title: "Product Requirements" }),
  ];

  const viewModel = buildProjectViewModel(
    data.projects[0],
    data.memberships,
    entries,
  );

  assert.deepEqual(
    viewModel.sections.map((section) => ({
      role: section.role,
      titles: section.entries.map(({ entry }) => entry.title),
    })),
    [
      { role: "prd", titles: ["Product Requirements"] },
      { role: "technical-doc", titles: ["Technical Design"] },
    ],
  );
  assert.deepEqual(viewModel.missingEntryIds, ["missing-1"]);
});

test("project serializer appends projects and membership nodes under a Projects root", () => {
  const withProject = appendProjectToOrg("", {
    id: "proj_payment",
    title: "Payment Redesign",
  });
  const withMembership = appendProjectMembershipToOrg(
    withProject,
    "proj_payment",
    {
      entryId: "prd-1",
      role: "prd",
      order: 10,
      note: "Main PRD",
    },
  );

  assert.match(withMembership, /^\* Projects$/m);
  assert.match(withMembership, /^\*\* Payment Redesign$/m);
  assert.match(withMembership, /^:PROJECT_ID: proj_payment$/m);
  assert.match(withMembership, /^\*\*\* PRD$/m);
  assert.match(withMembership, /^:ENTRY_ID: prd-1$/m);
  assert.match(withMembership, /^:NOTE: Main PRD$/m);
  // Simplified projects no longer write STATUS, OWNER, ALIASES, DUE, or TAGS
  assert.doesNotMatch(withMembership, /^:STATUS:/m);
});

test("project serializer archives projects by removing the project block and drops memberships", () => {
  const archived = archiveProjectInOrg(PROJECT_ORG, "proj_payment");
  const withoutMembership = removeProjectMembershipFromOrg(
    PROJECT_ORG,
    "proj_payment",
    "tech-1",
  );

  // Archive removes the project block entirely — no project title, no status
  assert.doesNotMatch(archived, /Payment Redesign/);
  assert.doesNotMatch(withoutMembership, /^:ENTRY_ID: tech-1$/m);
  assert.match(withoutMembership, /^:ENTRY_ID: prd-1$/m);
});

function createEntry(overrides: Partial<LibraryEntry>): LibraryEntry {
  return {
    id: "entry-1",
    title: "Untitled",
    type: "text",
    tags: [],
    properties: {},
    body: "",
    groupPath: [],
    groupLabel: "Ungrouped",
    sourceHeadline: "** Untitled",
    sourceStartLine: 0,
    sourceEndLine: 1,
    ...overrides,
  };
}
