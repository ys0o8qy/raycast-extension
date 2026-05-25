#!/usr/bin/env node
/**
 * build-ui-report.mjs
 *
 * Extracts the UI structure from Raycast extension source files,
 * generates a visual HTML report, and diffs against the previous build.
 *
 * Focus: user-facing forms, lists, and action panels.
 *
 * Usage:
 *   node scripts/build-ui-report.mjs          # generate + diff
 *   node scripts/build-ui-report.mjs --open   # generate + open in browser
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const REPORTS_DIR = join(REPO_ROOT, ".build-reports");
const REPORT_FILE = join(REPORTS_DIR, "ui-report.json");
const HTML_FILE = join(REPORTS_DIR, "ui-report.html");

// ── UI Structure Extractor ───────────────────────────────────────────

/**
 * Parse a TSX file and extract UI components.
 * Uses a state-machine approach to handle multi-line JSX.
 */
function extractUIStructure(filePath) {
  try {
    const source = readFileSync(filePath, "utf8");
    const components = [];
    let current = null;
    let insideForm = null; // { fields[], dropdownItems[] }

    // Process line by line with JSX awareness
    const lines = source.split("\n");
    let braceDepth = 0;
    let parenDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim();

      // Track depths (approximate — handles common patterns)
      for (const ch of raw) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
        if (ch === "(") parenDepth++;
        if (ch === ")") parenDepth--;
      }

      // ── Component boundaries ──────────────────────────────
      const funcMatch = t.match(
        /^(?:export\s+)?(?:default\s+)?function\s+(\w+)/,
      );
      if (funcMatch) {
        const name = funcMatch[1];
        // Only track UI-rendering components
        const isUICandidate =
          /Form|Project|List|Action|Search|Browse|Add|Edit/i.test(name);
        if (isUICandidate) {
          current = {
            name,
            navigationTitles: [],
            formFields: [],
            actions: [],
            lists: [],
            startLine: i + 1,
          };
          braceDepth = 0;
          parenDepth = 0;
        }
      }

      if (!current) continue;

      // ── Form field detection (multi-line aware) ──────────

      // Detect form field opening tags
      const formFieldStart = t.match(
        /<Form\.(TextField|Dropdown|TextArea|Checkbox|DatePicker|TagPicker)\b/,
      );
      if (formFieldStart) {
        insideForm = {
          type: formFieldStart[1],
          id: null,
          title: null,
          placeholder: null,
          defaultValue: null,
          options: [],
        };
      }

      // Collect props from inside a form field
      if (insideForm) {
        const idM = t.match(/\bid=["']([^"']+)["']/);
        if (idM) insideForm.id = idM[1];
        const titleM = t.match(/\btitle=["']([^"']+)["']/);
        if (titleM) insideForm.title = titleM[1];
        const phM = t.match(/\bplaceholder=["']([^"']+)["']/);
        if (phM) insideForm.placeholder = phM[1];
        const dvM = t.match(/\bdefaultValue=\{([^}]+)\}/);
        if (dvM) insideForm.defaultValue = dvM[1].trim();

        // Dropdown items
        const dropItem = t.match(
          /<Form\.Dropdown\.Item\s+key=\{?["']([^"'}]+)["']\}?\s+value=\{?["']([^"'}]+)["']\}?\s+title=\{?["']([^"'}]+)["']\}?/,
        );
        if (dropItem) {
          insideForm.options.push({
            key: dropItem[1],
            value: dropItem[2],
            title: dropItem[3],
          });
        }

        // Field closing
        if (t.includes("/>") || t.includes("</Form.")) {
          // Only register fields that have an id (meaning they're real form inputs, not dropdown items)
          if (insideForm.id || insideForm.type === "Dropdown") {
            current.formFields.push({
              type: insideForm.type,
              id: insideForm.id || "?",
              title: insideForm.title || "?",
              placeholder: insideForm.placeholder || undefined,
              defaultValue: insideForm.defaultValue || undefined,
              options:
                insideForm.options.length > 0
                  ? insideForm.options
                  : undefined,
            });
          }
          insideForm = null;
        }
      }

      // ── Navigation titles ────────────────────────────────
      const navM = t.match(/navigationTitle=\{?"([^"}]+)"\}?/);
      if (navM) {
        current.navigationTitles.push(navM[1]);
      }

      // ── Actions ───────────────────────────────────────────
      const actionPushM = t.match(
        /<Action\.Push\s+title=\{?"([^"}]+)"\}?/,
      );
      if (actionPushM) {
        const iconM = t.match(/icon=\{([^}]+)\}/);
        current.actions.push({
          type: "Action.Push",
          title: actionPushM[1],
          icon: iconM?.[1]?.replace(/Icon\./, "") ?? undefined,
        });
      }

      const actionSubmitM = t.match(
        /<Action\.SubmitForm\s+title=\{?"([^"}]+)"\}?/,
      );
      if (actionSubmitM) {
        current.actions.push({
          type: "Action.SubmitForm",
          title: actionSubmitM[1],
        });
      }

      const submenuM = t.match(
        /<ActionPanel\.Submenu\s+title=\{?"([^"}]+)"\}?/,
      );
      if (submenuM) {
        current.actions.push({
          type: "ActionPanel.Submenu",
          title: submenuM[1],
        });
      }

      // Standalone Action (not Push/SubmitForm)
      const actionM = t.match(/<Action\s+title=\{?"([^"}]+)"\}?/);
      if (
        actionM &&
        !t.includes("Action.Push") &&
        !t.includes("Action.SubmitForm") &&
        !t.includes("ActionPanel")
      ) {
        const styleM = t.match(/style=\{Action\.Style\.(\w+)\}/);
        current.actions.push({
          type: "Action",
          title: actionM[1],
          destructive: styleM?.[1] === "Destructive",
        });
      }

      // ── End of component ──────────────────────────────────
      // Component ends when we hit a `}` at brace depth 0 in the function scope
      // (approximate — handles simple cases)
      if (braceDepth < 0 && t === "}" && !t.startsWith("  ")) {
        if (
          current.formFields.length > 0 ||
          current.actions.length > 0 ||
          current.lists.length > 0 ||
          current.navigationTitles.length > 0
        ) {
          components.push(current);
        }
        current = null;
      }
    }

    // Catch component that ends at EOF
    if (
      current &&
      (current.formFields.length > 0 ||
        current.actions.length > 0 ||
        current.lists.length > 0 ||
        current.navigationTitles.length > 0)
    ) {
      components.push(current);
    }

    return { file: basename(filePath), components };
  } catch {
    return {
      file: basename(filePath),
      components: [],
      error: "Could not read file",
    };
  }
}

// ── Report Generation ────────────────────────────────────────────────

function generateReport() {
  const files = [
    join(REPO_ROOT, "src", "search-projects.tsx"),
    join(REPO_ROOT, "src", "add-entry.tsx"),
    join(REPO_ROOT, "src", "search-library.tsx"),
    join(REPO_ROOT, "src", "actions.tsx"),
  ];

  const results = files.map(extractUIStructure);

  // Collect metrics
  const allForms = results.flatMap((r) =>
    r.components.flatMap((c) => c.formFields),
  );
  const allActions = results.flatMap((r) =>
    r.components.flatMap((c) => c.actions),
  );
  const fieldTypes = {};
  for (const f of allForms) {
    fieldTypes[f.type] = (fieldTypes[f.type] || 0) + 1;
  }

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      files: results.map((r) => r.file),
      totalComponents: results.reduce(
        (sum, r) => sum + r.components.length,
        0,
      ),
      totalFormFields: allForms.length,
      totalActions: allActions.length,
      fieldTypes,
    },
    files: results.map((r) => ({
      file: r.file,
      error: r.error,
      components: r.components.map((c) => ({
        name: c.name,
        navigationTitles: c.navigationTitles,
        formFields: c.formFields,
        formFieldCount: c.formFields.length,
        actions: c.actions,
        actionCount: c.actions.length,
      })),
    })),
  };

  return report;
}

// ── Diffing ─────────────────────────────────────────────────────────

function diffReports(previous, current) {
  if (!previous) return { type: "initial", changes: [] };

  const changes = [];
  const prevFiles = new Map(previous.files.map((f) => [f.file, f]));
  const currFiles = new Map(current.files.map((f) => [f.file, f]));

  for (const [file, curr] of currFiles) {
    const prev = prevFiles.get(file);
    if (!prev) {
      changes.push({ file, type: "new_file", detail: "File added" });
      continue;
    }

    const cfc = curr.components.reduce((s, c) => s + c.formFieldCount, 0);
    const pfc = prev.components.reduce((s, c) => s + c.formFieldCount, 0);
    if (cfc !== pfc) {
      changes.push({
        file,
        type: "form_fields",
        detail: `Form fields: ${pfc} → ${cfc} (${cfc > pfc ? "+" : ""}${cfc - pfc})`,
      });
    }

    // Detailed field diff
    const prevFields = new Map();
    prev.components.forEach((c) =>
      c.formFields.forEach((f) => prevFields.set(f.id, f)),
    );
    const currFields = new Map();
    curr.components.forEach((c) =>
      c.formFields.forEach((f) => currFields.set(f.id, f)),
    );

    for (const [id] of prevFields) {
      if (!currFields.has(id)) {
        const pf = prevFields.get(id);
        changes.push({
          file,
          type: "field_removed",
          detail: `Removed ${pf.type}: "${pf.id}"${pf.title ? ` (${pf.title})` : ""}`,
        });
      }
    }
    for (const [id, field] of currFields) {
      if (!prevFields.has(id)) {
        changes.push({
          file,
          type: "field_added",
          detail: `Added ${field.type}: "${field.id}"${field.title ? ` (${field.title})` : ""}`,
        });
      }
    }

    const cac = curr.components.reduce((s, c) => s + c.actionCount, 0);
    const pac = prev.components.reduce((s, c) => s + c.actionCount, 0);
    if (cac !== pac) {
      changes.push({
        file,
        type: "actions",
        detail: `Actions: ${pac} → ${cac} (${cac > pac ? "+" : ""}${cac - pac})`,
      });
    }
  }

  // Removed files
  for (const [file] of prevFiles) {
    if (!currFiles.has(file)) {
      changes.push({ file, type: "removed_file", detail: "File removed" });
    }
  }

  return {
    type: changes.length > 0 ? "changed" : "unchanged",
    changes,
  };
}

// ── HTML Generation ──────────────────────────────────────────────────

function generateHTML(report, diff) {
  const diffBadge =
    diff.type === "initial"
      ? '<span style="background:#fbbf24;color:#000;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">INITIAL</span>'
      : diff.type === "changed"
        ? `<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">${diff.changes.length} CHANGE${diff.changes.length !== 1 ? "S" : ""}</span>`
        : '<span style="background:#22c55e;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">UNCHANGED</span>';

  const diffHTML =
    diff.changes.length > 0
      ? `
    <div class="diff">
      <h2>🔍 Changes Detected</h2>
      <table>
        <thead><tr><th>File</th><th>Type</th><th>Detail</th></tr></thead>
        <tbody>${diff.changes
          .map(
            (c) => `
          <tr class="diff-${c.type}">
            <td class="mono">${c.file}</td>
            <td><span class="tag tag-${c.type}">${c.type}</span></td>
            <td>${c.detail}</td>
          </tr>`,
          )
          .join("")}</tbody>
      </table>
    </div>`
      : diff.type === "initial"
        ? `<div class="card info"><h2>🔍 Baseline Established</h2><p>This is the first build. No previous report to compare against. Future builds will diff against this baseline.</p></div>`
        : `<div class="card success"><h2>🔍 No Changes</h2><p>UI structure is identical to the previous build.</p></div>`;

  const fileSections = report.files
    .map(
      (f) => `
    <div class="card">
      <h3>📄 ${f.file}${f.error ? ` <span class="error">⚠ ${f.error}</span>` : ""}</h3>
      ${f.components
        .map(
          (c) => `
        <div class="component">
          <div class="comp-header">
            <span class="comp-name">${c.name}</span>
            ${c.navigationTitles.map((t) => `<span class="nav">→ ${t}</span>`).join("")}
            <span class="badge">${c.formFieldCount} fields</span>
            <span class="badge badge-action">${c.actionCount} actions</span>
          </div>
          ${c.formFields.length > 0
            ? `
          <div class="fields">
            ${c.formFields
              .map(
                (f) => `
            <div class="field">
              <span class="ftype ftype-${f.type.toLowerCase()}">${f.type}</span>
              <span class="fid">${f.id}</span>
              <span class="ftitle">${f.title}</span>
              ${f.placeholder ? `<span class="fph">"${f.placeholder}"</span>` : ""}
              ${f.defaultValue ? `<span class="fdv">default: ${f.defaultValue}</span>` : ""}
              ${f.options ? `<span class="fopts">→ ${f.options.map((o) => o.title).join(", ")}</span>` : ""}
            </div>`,
              )
              .join("")}
          </div>`
            : `<div class="empty">No form fields</div>`
          }
          ${c.actions.length > 0
            ? `
          <div class="actions-list">
            ${c.actions
              .map(
                (a) => `
            <div class="act ${a.destructive ? "act-destructive" : ""}">
              <span class="atype">${a.type}</span>
              <span>${a.title}</span>
              ${a.icon ? `<span class="aicon">${a.icon}</span>` : ""}
              ${a.destructive ? `<span class="adestr">DESTRUCTIVE</span>` : ""}
            </div>`,
              )
              .join("")}
          </div>`
            : `<div class="empty">No actions</div>`
          }
        </div>`
        )
        .join("")}
    </div>`,
    )
    .join("");

  const summaryFields = Object.entries(report.summary.fieldTypes)
    .map(
      ([type, count]) =>
        `<span class="stat">${type}: <strong>${count}</strong></span>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UI Report — ${new Date(report.timestamp).toLocaleString()}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#0b1120;color:#e2e8f0;padding:32px;max-width:1100px;margin:0 auto}
    h1{font-size:22px;color:#f1f5f9;margin-bottom:4px}
    .header{display:flex;align-items:center;gap:12px;margin-bottom:4px}
    .ts{color:#64748b;font-size:13px;margin-bottom:24px}
    .card{background:#131c2e;border:1px solid #1e293b;border-radius:10px;padding:20px;margin-bottom:20px}
    .card h2{font-size:16px;margin-bottom:12px;color:#cbd5e1}
    .card h3{font-size:17px;margin-bottom:14px;color:#f1f5f9}
    .info{border-left:3px solid #fbbf24}
    .success{border-left:3px solid #22c55e}
    .stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px}
    .stat{background:#1e293b;padding:4px 12px;border-radius:6px;font-size:13px;color:#94a3b8}
    .stat strong{color:#e2e8f0}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:8px 12px;background:#1e293b;color:#94a3b8;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.5px}
    td{padding:10px 12px;border-top:1px solid #1e293b}
    .mono{font-family:monospace;font-size:12px;color:#94a3b8}
    .tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase}
    .tag-field_removed{background:#7f1d1d;color:#fca5a5}
    .tag-field_added{background:#14532d;color:#86efac}
    .tag-form_fields,.tag-actions{background:#1e3a5f;color:#93c5fd}
    .component{margin-bottom:18px;padding:16px;background:#0f172a;border-radius:8px;border:1px solid #1e293b}
    .comp-header{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
    .comp-name{font-weight:700;font-size:15px;color:#f8fafc;font-family:monospace}
    .nav{color:#6366f1;font-size:12px}
    .badge{background:#1e293b;color:#94a3b8;padding:1px 8px;border-radius:4px;font-size:11px}
    .badge-action{background:#0f2d1a;color:#86efac}
    .field{display:flex;gap:8px;align-items:center;padding:5px 0;font-size:13px;border-bottom:1px solid #1e293b;flex-wrap:wrap}
    .field:last-child{border-bottom:0}
    .ftype{display:inline-block;padding:1px 8px;border-radius:4px;font-size:10px;font-weight:700;min-width:64px;text-align:center;text-transform:uppercase}
    .ftype-textfield{background:#312e81;color:#a5b4fc}
    .ftype-dropdown{background:#713f12;color:#fde68a}
    .ftype-textarea{background:#4a1942;color:#f0abfc}
    .ftype-checkbox{background:#064e3b;color:#6ee7b7}
    .ftype-datepicker{background:#1e3a5f;color:#93c5fd}
    .fid{color:#64748b;font-family:monospace;font-size:12px;min-width:60px}
    .ftitle{color:#e2e8f0}
    .fph{color:#475569;font-style:italic;font-size:12px}
    .fdv{color:#6366f1;font-size:11px}
    .fopts{color:#64748b;font-size:11px;width:100%;margin-top:2px}
    .fields{margin-bottom:6px}
    .act{display:flex;gap:8px;align-items:center;padding:3px 0;font-size:13px}
    .act-destructive{color:#fca5a5}
    .atype{background:#064e3b;color:#6ee7b7;padding:1px 8px;border-radius:4px;font-size:10px;font-weight:700}
    .act-destructive .atype{background:#7f1d1d;color:#fca5a5}
    .aicon{color:#64748b;font-size:12px}
    .adestr{color:#ef4444;font-size:10px;font-weight:700}
    .empty{color:#475569;font-size:13px;font-style:italic;padding:4px 0}
    .error{color:#fca5a5}
  </style>
</head>
<body>
  <div class="header">
    <h1>🧩 Raycast Extension UI Structure Report</h1>
    ${diffBadge}
  </div>
  <div class="ts">${new Date(report.timestamp).toLocaleString()}</div>

  <div class="card">
    <h2>📊 Summary</h2>
    <div class="stats">
      <span class="stat">Components: <strong>${report.summary.totalComponents}</strong></span>
      <span class="stat">Form Fields: <strong>${report.summary.totalFormFields}</strong></span>
      <span class="stat">Actions: <strong>${report.summary.totalActions}</strong></span>
      ${summaryFields}
    </div>
  </div>

  ${diffHTML}
  ${fileSections}
</body>
</html>`;
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });

  console.log("🔍 Extracting UI structure from source files...");
  const report = generateReport();

  let previousReport = null;
  if (existsSync(REPORT_FILE)) {
    try {
      previousReport = JSON.parse(readFileSync(REPORT_FILE, "utf8"));
    } catch {
      // ignore
    }
  }

  const diff = diffReports(previousReport, report);

  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(HTML_FILE, generateHTML(report, diff), "utf8");

  console.log(`\n📊 Report: ${HTML_FILE}`);
  console.log(`    ${report.summary.totalComponents} components, ${report.summary.totalFormFields} fields, ${report.summary.totalActions} actions`);
  console.log(`    Field types: ${JSON.stringify(report.summary.fieldTypes)}`);

  if (diff.type === "initial") {
    console.log("\n✨ Baseline established.");
  } else if (diff.type === "changed") {
    console.log(`\n⚠️  ${diff.changes.length} change(s):`);
    for (const c of diff.changes) {
      const e = c.type === "field_removed" ? "❌" : c.type === "field_added" ? "✅" : "🔄";
      console.log(`    ${e} [${c.file}] ${c.detail}`);
    }
  } else {
    console.log("\n✅ No UI changes.");
  }

  if (process.argv.includes("--open")) {
    execSync(`open "${HTML_FILE}"`);
  }
}

main();
