import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import Module from "node:module";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const outDir = "/tmp/raycast-org-bookmarks-entry-actions-debug";
const reportPath = path.join(repoRoot, "debug", "entry-actions-report.json");
const liveHtmlPath = path.join(repoRoot, "debug", "entry-actions-live.html");

process.env.NODE_PATH = path.join(repoRoot, "node_modules");
Module._initPaths();

execFileSync(
  path.join(repoRoot, "node_modules", ".bin", "tsc"),
  [
    "src/types.ts",
    "src/resource.ts",
    "src/action-runner.ts",
    "src/runtime.ts",
    "src/entry-actions-state.ts",
    "--module",
    "commonjs",
    "--target",
    "ES2022",
    "--esModuleInterop",
    "--skipLibCheck",
    "--types",
    "node",
    "--outDir",
    outDir,
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
  },
);

const { buildRuntimeRegistry } = await import(
  pathToFileUrl(path.join(outDir, "runtime.js")).href
);
const {
  getEmptyEntryActionsState,
  resolveEntryActionsState,
} = await import(pathToFileUrl(path.join(outDir, "entry-actions-state.js")).href);

function pathToFileUrl(filePath) {
  return new URL(`file://${filePath}`);
}

function createEntry(overrides = {}) {
  return {
    id: "debug-entry-1",
    title: "Debug Entry",
    type: "text",
    tags: ["debug", "notes"],
    properties: {},
    body: "hello from debug page",
    groupPath: [],
    groupLabel: "",
    sourceHeadline: "* Debug Entry",
    sourceStartLine: 0,
    sourceEndLine: 4,
    ...overrides,
  };
}

const runtimeRegistry = buildRuntimeRegistry({
  version: 1,
  actions: {},
  types: {},
});
const emptyState = getEmptyEntryActionsState();
const textState = resolveEntryActionsState(runtimeRegistry, createEntry());
const schemaState = resolveEntryActionsState(
  runtimeRegistry,
  createEntry({
    type: "schema",
    properties: {
      SCHEMA_COMMAND: "pbcopy",
      SCHEMA_ARGS: "--help",
    },
    body: "schema body",
  }),
);

const report = {
  generatedAt: new Date().toISOString(),
  pass:
    emptyState.resolvedActions.length === 0 &&
    emptyState.showDetailsIsPrimary === false &&
    textState.resolvedActions.map((action) => action.id).join(",") ===
      "paste-body,copy-body" &&
    schemaState.resolvedActions.map((action) => action.id).join(",") ===
      "schema-command,copy-body",
  checks: [
    {
      id: "missing-props-safe",
      pass:
        emptyState.resolvedActions.length === 0 &&
        emptyState.showDetailsIsPrimary === false,
      detail: emptyState,
    },
    {
      id: "text-default-actions",
      pass:
        textState.resolvedActions.map((action) => action.id).join(",") ===
        "paste-body,copy-body",
      detail: {
        actionIds: textState.resolvedActions.map((action) => action.id),
        showDetailsIsPrimary: textState.showDetailsIsPrimary,
      },
    },
    {
      id: "schema-compat-prepended",
      pass:
        schemaState.resolvedActions.map((action) => action.id).join(",") ===
        "schema-command,copy-body",
      detail: {
        actionIds: schemaState.resolvedActions.map((action) => action.id),
        showDetailsIsPrimary: schemaState.showDetailsIsPrimary,
      },
    },
  ],
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const templateHtml = await readFile(
  path.join(repoRoot, "debug", "entry-actions.html"),
  "utf8",
);
const liveHtml = templateHtml.replace(
  '<script id="report-data" type="application/json"></script>',
  `<script id="report-data" type="application/json">${JSON.stringify(report)}</script>`,
);
await writeFile(liveHtmlPath, liveHtml, "utf8");

console.log(`Wrote ${reportPath}`);
console.log(`Wrote ${liveHtmlPath}`);
