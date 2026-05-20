import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectDesignPath = join(
  process.cwd(),
  "docs/superpowers/specs/2026-05-20-project-resource-collections-design.md",
);

test("project collection design document exists", () => {
  assert.equal(existsSync(projectDesignPath), true);
});

test("package does not expose tag-backed group commands", () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as {
    commands: Array<{
      name: string;
      title: string;
      description: string;
    }>;
  };

  assert.equal(
    manifest.commands.some((command) => command.name === "search-groups"),
    false,
  );
  const browseTags = manifest.commands.find(
    (command) => command.name === "browse-tags",
  );

  assert.equal(browseTags?.title, "Browse Tags");
  assert.equal(browseTags?.description, "Browse saved resources by tag");
});

test("package exposes a first-class project search command", () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as {
    commands: Array<{
      name: string;
      title: string;
      description: string;
      icon: string;
      mode: string;
    }>;
  };

  const searchProjects = manifest.commands.find(
    (command) => command.name === "search-projects",
  );

  assert.equal(searchProjects?.title, "Search Projects");
  assert.equal(
    searchProjects?.description,
    "Search project collections and related resources",
  );
  assert.equal(searchProjects?.icon, "search-projects.png");
  assert.equal(searchProjects?.mode, "view");
});

test("resource actions no longer expose tag-backed group management", () => {
  const source = readFileSync(join(process.cwd(), "src/actions.tsx"), "utf8");

  assert.doesNotMatch(source, /Add to Group/);
  assert.doesNotMatch(source, /Remove from Group/);
  assert.doesNotMatch(source, /Remove from This Group/);
  assert.doesNotMatch(source, /GroupPicker/);
  assert.doesNotMatch(source, /groupContextTag/);
});
