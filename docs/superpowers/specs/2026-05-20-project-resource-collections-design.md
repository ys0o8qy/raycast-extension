# Project Resource Collections Design

## Summary

Project resource collections are the long-term model for grouping resources that belong to one development context, such as a feature request, PRD, technical design, test account, environment URL, issue, pull request, or rollout note.

Projects are first-class entities. Tags remain lightweight cross-cutting labels. A project answers "what do I need for this specific initiative?" while a tag answers "what category or attribute does this resource have?"

This replaces the short-lived tag-backed "group" concept. Do not implement projects by renaming tags to groups. Tags cannot carry project status, roles, ordering, ownership, or archive state without becoming an implicit and brittle project database.

Implementation status: the first iteration is shipped through `Search Projects`, `src/projects/`, and secondary `EntryActions` project membership actions. The extension points in this document remain future-facing.

## Goals

- Provide a dedicated project-first entry point for project work.
- Keep resources as reusable canonical entries in the Org library.
- Let one project aggregate different resource roles: PRD, technical design, test account reference, environment URL, API docs, issue, pull request, branch, meeting notes, and other supporting links or snippets.
- Support project metadata such as status, owner, due date, archive state, and notes.
- Preserve tags as auxiliary filters for cross-project discovery.
- Keep the storage format readable and recoverable as plain Org.
- Design boundaries that can later support richer project actions without coupling them to runtime type actions.

## Non-Goals

- Do not store secrets directly. Test account resources should store a safe reference, account label, vault item URL, or access instructions, not passwords or tokens.
- Do not implement hierarchical project folders in the first iteration.
- Do not make tags synonymous with projects.
- Do not move resource entries under project headings as the canonical storage path. Moving entries would make shared resources, updates, and stable IDs harder to reason about.

## UX Model

The primary project flow should be:

1. Open `Search Projects`.
2. Search project names, aliases, status, owners, and project notes.
3. Press Enter on a project.
4. Land in a project detail/list view with resource sections grouped by role.
5. Run the resource default action, open details, add an existing resource, add a new resource, change a resource role, remove it from the project, or archive the project.

Project detail sections should use predictable operational roles:

- PRD
- Technical Docs
- Design
- Test Accounts
- Environments
- API Docs
- Issues and PRs
- Notes
- Other

The role list should be open-ended in storage, but the UI should order known roles first and put unknown roles under `Other` or their custom label.

Tags remain visible in resource metadata and search. A project view may include tag filters inside the project, but tag filters should narrow project resources, not define membership.

## Information Architecture

Commands:

- `Search Resources`: global resource search. Tags work here.
- `Browse Tags`: tag discovery and cross-cutting exploration. This is not a project browser.
- `Add Resource`: creates canonical resources and can later attach the new resource to a project.
- `Search Projects`: dedicated project entry point. It lists project entities, not tags.
- `Add Project`: optional future command if project creation becomes common enough to deserve a top-level entry. Otherwise project creation can start as an action inside `Search Projects`.

Recommended first implementation:

- Add `Search Projects`.
- Create/edit/archive projects from actions inside `Search Projects`.
- Add existing resources to a project from `EntryActions`.
- Add a new resource directly from a project view by reusing the existing add-resource flow with a project attachment context.

## Data Model

Add project-specific types separate from `LibraryEntry`:

```ts
export interface Project {
  id: string;
  title: string;
  status: "active" | "paused" | "done" | "archived" | string;
  aliases: string[];
  owner?: string;
  dueDate?: string;
  tags: string[];
  notes: string;
  sourceStartLine: number;
  sourceEndLine: number;
}

export interface ProjectMembership {
  projectId: string;
  entryId: string;
  role: string;
  titleOverride?: string;
  note?: string;
  order: number;
}

export interface ProjectViewModel {
  project: Project;
  sections: Array<{
    role: string;
    entries: Array<{
      entry: LibraryEntry;
      membership: ProjectMembership;
    }>;
  }>;
  missingEntryIds: string[];
}
```

Membership is a relation between a project and a resource. It should not be modeled only as a property on `LibraryEntry`, because one resource can appear in more than one project and can have a different role in each project.

## Org Storage

Projects live under a dedicated root:

```org
* Projects
** Payment Redesign
:PROPERTIES:
:PROJECT_ID: proj_payment_redesign
:STATUS: active
:OWNER: alice
:DUE: 2026-06-15
:ALIASES: pay-v2, checkout-redesign
:TAGS: payment frontend
:END:
Notes about the project context.

*** PRD
:PROPERTIES:
:ENTRY_ID: resource_prd_123
:ROLE: prd
:ORDER: 10
:END:

*** Technical Design
:PROPERTIES:
:ENTRY_ID: resource_design_456
:ROLE: technical-doc
:ORDER: 20
:END:

*** Test Account
:PROPERTIES:
:ENTRY_ID: resource_account_789
:ROLE: test-account
:ORDER: 30
:NOTE: Staging buyer account reference only.
:END:
```

Important storage rules:

- Project nodes do not use `:TYPE:`. This prevents the current resource parser from treating projects as resources.
- Membership nodes reference resource `:ID:` values through `:ENTRY_ID:`.
- Resource entries remain in their runtime-type storage roots such as `* Links`, `* Text`, `* Schemas`, and `* Other`.
- Deleting a project removes memberships, not resources.
- Removing a resource from a project removes only that membership node.
- If a membership references a missing entry ID, the UI should show a recoverable missing-resource row instead of failing the whole project.

## Parser and Serializer Boundaries

Create project-specific modules instead of expanding generic resource parsing:

- `src/projects/types.ts`: project and membership types.
- `src/projects/parser.ts`: parse `* Projects` into `Project` and `ProjectMembership` records.
- `src/projects/serializer.ts`: create, update, archive, and remove project blocks and membership nodes.
- `src/projects/storage.ts`: public project persistence boundary used by commands/actions.
- `src/projects/view-model.ts`: join projects, memberships, and `LibraryEntry` records into render-ready sections.

Keep `src/storage.ts` as the public resource persistence boundary. Project storage may call `loadEntries()` for joins, but resource storage should not depend on project storage.

## Actions

Resource actions include:

- `Add to Project`
- `Remove from Project` when the current view has project context

Resource actions can later add:

- `Change Project Role`

These actions should work through project storage and membership updates. They must not mutate resource tags to simulate project membership.

Project actions should include:

- `Open Project`
- `Add Existing Resource`
- `Add New Resource`
- `Edit Project`
- `Archive Project`

Project actions can later add:

- `Copy Project Summary`

The first action in `EntryActions` must remain the runtime-resolved resource default action. Project membership actions are secondary actions.

## Search

Project search indexes:

- project title
- aliases
- owner
- status
- notes
- project tags
- first-letter Chinese index, matching the existing resource/tag search behavior

Project resource search indexes only resources inside the selected project. It can reuse `filterEntriesBySearch` for title/body keywords and `#tag` filters, but the input set is the project membership list.

## Migration From Tag-Backed Groups

The tag-backed group implementation is obsolete and should be removed from runtime code.

Migration should be explicit and optional:

1. List high-cardinality or project-like tags as project candidates.
2. Let the user choose which tags become projects.
3. Create project records for selected tags.
4. Create memberships from entries carrying those tags.
5. Leave original tags in place by default, because tags may still be useful cross-project attributes.
6. Offer a later cleanup action to remove migrated tags if desired.

There should be no automatic migration on startup.

## Error Handling

- Missing project root: treat as an empty project list.
- Duplicate `PROJECT_ID`: show a failure toast and leave the file unchanged on writes.
- Missing `ENTRY_ID`: render a missing-resource row with copyable ID.
- Malformed project metadata: parse the project with safe defaults and expose the raw issue in project details.
- Write failure: surface the filesystem error and do not update in-memory UI as if the write succeeded.

## Verification Plan

Focused unit coverage:

- project parser extracts projects and memberships from Org.
- project serializer creates stable project blocks.
- project view model groups entries by role and reports missing resources.
- project search matches title, alias, owner, status, notes, tags, and Chinese first letters.
- resource actions do not implement project membership by mutating tags.

Build coverage:

- compiled node tests with the repository `NODE_PATH` workaround when running from `/tmp`.
- `npm run build`
- `npm run generate-icons`
- `./node_modules/.bin/ray build`

## Open Extension Points

- Role templates per project type, such as feature, incident, release, research, or customer request.
- Project status filters and archive defaults.
- Project summary export to Markdown.
- Manifest-defined project actions, separate from resource runtime actions.
- Optional project templates that create expected empty sections.

## Design Decision

Use projects as first-class collections and tags as secondary attributes. This gives project work a stable home for status, roles, ordering, archive behavior, and future workflow actions while keeping resource tags useful for broad filtering.
