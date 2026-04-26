import {
  ChildProcess,
  ChildProcessByStdio,
  spawn as nodeSpawn,
  SpawnOptions,
} from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  ActionDefinition,
  BuiltinActionId,
  LibraryEntry,
  ResolvedAction,
  ResolvedBuiltinAction,
  ResolvedCommandAction,
} from "./types";

const TEMPLATE_PATTERN = /{{\s*([^{}]+?)\s*}}/g;

export interface BuiltinActionPrimitives {
  "copy-to-clipboard"?: (value: string) => Promise<void> | void;
  "open-in-browser"?: (value: string) => Promise<void> | void;
  "open-path"?: (value: string) => Promise<void> | void;
  "paste-to-frontmost-app"?: (value: string) => Promise<void> | void;
  "show-detail"?: () => Promise<void> | void;
}

export type SpawnFunction = (
  command: string,
  args?: ReadonlyArray<string>,
  options?: SpawnOptions,
) => ChildProcess;

export interface RunActionOptions {
  builtins?: BuiltinActionPrimitives;
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnFunction;
}

const SCHEMA_COMMAND_ACTION_ID = "schema-command";

export function expandTemplate(template: string, entry: LibraryEntry): string {
  return template.replace(TEMPLATE_PATTERN, (_match, token) =>
    resolveTemplateValue(String(token).trim(), entry),
  );
}

export function splitCommandActionArgs(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const char of value.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    args.push(current);
  }

  return args;
}

export function resolveActionDefinition(
  id: string,
  definition: ActionDefinition,
  entry: LibraryEntry,
): ResolvedAction {
  if (definition.mode === "builtin") {
    if (!definition.builtin) {
      throw new Error(`Builtin action ${id} is missing a builtin target`);
    }

    const resolved: ResolvedBuiltinAction = {
      id,
      title: definition.title,
      mode: "builtin",
      builtin: definition.builtin,
    };

    if (definition.value !== undefined) {
      resolved.value = expandTemplate(definition.value, entry);
    }

    return resolved;
  }

  if (!definition.command) {
    throw new Error(`Command action ${id} is missing a command`);
  }

  const resolved: ResolvedCommandAction = {
    id,
    title: definition.title,
    mode: "command",
    command: expandTemplate(definition.command, entry),
    args: (definition.args ?? []).map((arg) => expandTemplate(arg, entry)),
    env: Object.fromEntries(
      Object.entries(definition.env ?? {}).map(([key, value]) => [
        key,
        expandTemplate(value, entry),
      ]),
    ),
  };

  if (definition.stdin !== undefined) {
    resolved.stdin = expandTemplate(definition.stdin, entry);
  }

  return resolved;
}

export function resolveSchemaCommandAction(
  entry: LibraryEntry,
): ResolvedCommandAction | undefined {
  const command = entry.properties.SCHEMA_COMMAND?.trim();
  if (!command) {
    return undefined;
  }

  const definition: ActionDefinition = {
    title: "Run Schema Command",
    mode: "command",
    command,
    args: splitCommandActionArgs(entry.properties.SCHEMA_ARGS || ""),
    env: {
      RESOURCE_LIBRARY_ENTRY_ID: "{{id}}",
      RESOURCE_LIBRARY_ENTRY_TITLE: "{{title}}",
      RESOURCE_LIBRARY_ENTRY_TYPE: "{{type}}",
      RESOURCE_LIBRARY_ENTRY_TAGS: "{{tags_csv}}",
    },
    stdin: "{{body}}",
  };

  return resolveActionDefinition(
    SCHEMA_COMMAND_ACTION_ID,
    definition,
    entry,
  ) as ResolvedCommandAction;
}

export async function runAction(
  action: ResolvedAction,
  options: RunActionOptions = {},
): Promise<void> {
  if (action.mode === "builtin") {
    await runBuiltinAction(action, options.builtins ?? {});
    return;
  }

  await runCommandAction(action, options);
}

async function runBuiltinAction(
  action: ResolvedBuiltinAction,
  builtins: BuiltinActionPrimitives,
): Promise<void> {
  if (action.builtin === "show-detail") {
    const handler = builtins["show-detail"];
    if (!handler) {
      throw new Error(`Builtin action ${action.builtin} is not configured`);
    }
    await handler();
    return;
  }

  const value = action.value ?? "";
  const handler = getValueBuiltinHandler(action.builtin, builtins);
  await handler(value);
}

async function runCommandAction(
  action: ResolvedCommandAction,
  options: RunActionOptions,
): Promise<void> {
  const spawn = options.spawn ?? nodeSpawn;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(action.command, action.args, {
      env: {
        ...process.env,
        ...options.env,
        ...action.env,
      },
      shell: false,
      stdio: ["pipe", "ignore", "pipe"],
    }) as ChildProcessByStdio<Writable, null, Readable>;

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(stderr.trim() || `Command terminated with signal ${signal}`));
        return;
      }

      reject(new Error(stderr.trim() || `Command exited with code ${code}`));
    });

    child.stdin.end(action.stdin ?? "");
  });
}

function getValueBuiltinHandler(
  builtin: Exclude<BuiltinActionId, "show-detail">,
  builtins: BuiltinActionPrimitives,
): (value: string) => Promise<void> | void {
  const handler = builtins[builtin];
  if (!handler) {
    throw new Error(`Builtin action ${builtin} is not configured`);
  }

  return handler;
}

function resolveTemplateValue(token: string, entry: LibraryEntry): string {
  switch (token) {
    case "id":
      return entry.id;
    case "title":
      return entry.title;
    case "type":
      return entry.type;
    case "body":
      return entry.body;
    case "url":
      return entry.properties.URL ?? "";
    case "path":
      return entry.properties.PATH ?? "";
    case "tags_csv":
      return entry.tags.join(",");
    case "tags_json":
      return JSON.stringify(entry.tags);
    case "path_or_url":
      return entry.properties.PATH ?? entry.properties.URL ?? "";
    default:
      if (token.startsWith("property.")) {
        return entry.properties[token.slice("property.".length)] ?? "";
      }

      return "";
  }
}
