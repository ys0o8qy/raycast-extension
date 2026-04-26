import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import {
  expandTemplate,
  resolveSchemaCommandAction,
  resolveActionDefinition,
  runAction,
  splitCommandActionArgs,
} from "../src/action-runner";
import { ActionDefinition, LibraryEntry, ResolvedCommandAction } from "../src/types";

test("expandTemplate resolves core entry placeholders", () => {
  const entry = createEntry({
    type: "image",
    tags: ["docs", "raycast"],
    body: "Body text",
    properties: {
      URL: "https://example.com/resource",
      PATH: "/tmp/resource.png",
    },
  });

  assert.equal(
    expandTemplate(
      "{{id}}|{{title}}|{{type}}|{{body}}|{{url}}|{{path}}|{{tags_csv}}|{{tags_json}}|{{path_or_url}}",
      entry,
    ),
    'entry-1|Untitled|image|Body text|https://example.com/resource|/tmp/resource.png|docs,raycast|["docs","raycast"]|/tmp/resource.png',
  );
});

test("expandTemplate reads arbitrary properties", () => {
  const entry = createEntry({
    properties: {
      URL: "https://example.com",
      CUSTOM_VALUE: "hello",
    },
  });

  assert.equal(
    expandTemplate("{{property.CUSTOM_VALUE}} {{property.MISSING}} {{property.URL}}", entry),
    "hello  https://example.com",
  );
});

test("resolveActionDefinition expands command args, env, and stdin templates", () => {
  const entry = createEntry({
    body: "echo hello",
    properties: {
      PATH: "/tmp/script.txt",
      CUSTOM_VALUE: "custom",
    },
  });
  const definition: ActionDefinition = {
    title: "Run Script",
    mode: "command",
    command: "tool",
    args: ["--entry", "{{id}}", "--source", "{{path_or_url}}"],
    env: {
      ENTRY_TITLE: "{{title}}",
      CUSTOM_VALUE: "{{property.CUSTOM_VALUE}}",
    },
    stdin: "{{body}}",
  };

  const resolved = resolveActionDefinition("run-script", definition, entry);

  assert.deepEqual(resolved, {
    id: "run-script",
    title: "Run Script",
    mode: "command",
    command: "tool",
    args: ["--entry", "entry-1", "--source", "/tmp/script.txt"],
    env: {
      ENTRY_TITLE: "Untitled",
      CUSTOM_VALUE: "custom",
    },
    stdin: "echo hello",
  } satisfies ResolvedCommandAction);
});

test("splitCommandActionArgs supports quoted arguments", () => {
  assert.deepEqual(
    splitCommandActionArgs('--mode fast --name "hello world" plain\\ value'),
    ["--mode", "fast", "--name", "hello world", "plain value"],
  );
});

test("resolveSchemaCommandAction expands schema command args, env, and stdin", () => {
  const entry = createEntry({
    type: "schema",
    title: "Schema Title",
    tags: ["docs", "schema"],
    body: "schema body",
    properties: {
      SCHEMA_COMMAND: "pbcopy",
      SCHEMA_ARGS: '--flag "{{title}}" plain\\ value',
    },
  });

  assert.deepEqual(resolveSchemaCommandAction(entry), {
    id: "schema-command",
    title: "Run Schema Command",
    mode: "command",
    command: "pbcopy",
    args: ["--flag", "Schema Title", "plain value"],
    env: {
      RESOURCE_LIBRARY_ENTRY_ID: "entry-1",
      RESOURCE_LIBRARY_ENTRY_TITLE: "Schema Title",
      RESOURCE_LIBRARY_ENTRY_TYPE: "schema",
      RESOURCE_LIBRARY_ENTRY_TAGS: "docs,schema",
    },
    stdin: "schema body",
  });
});

test("runAction executes command actions without piping unread stdout", async () => {
  const calls: Array<{
    command: string;
    args: ReadonlyArray<string> | undefined;
    options: unknown;
  }> = [];
  const stdinWrites: string[] = [];

  await runAction(
    {
      id: "run-script",
      title: "Run Script",
      mode: "command",
      command: "tool",
      args: ["--flag"],
      env: { CHILD_ENV: "yes" },
      stdin: "body text",
    },
    {
      env: { BASE_ENV: "base" },
      spawn(command, args, options) {
        calls.push({ command, args, options });

        const child = new FakeChildProcess((value) => {
          stdinWrites.push(value);
        });

        queueMicrotask(() => child.emit("close", 0, null));
        return child as never;
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "tool");
  assert.deepEqual(calls[0].args, ["--flag"]);
  assert.equal((calls[0].options as { shell?: boolean }).shell, false);
  assert.deepEqual(
    (calls[0].options as { stdio?: unknown }).stdio,
    ["pipe", "ignore", "pipe"],
  );
  assert.equal(
    ((calls[0].options as { env: Record<string, string> }).env).BASE_ENV,
    "base",
  );
  assert.equal(
    ((calls[0].options as { env: Record<string, string> }).env).CHILD_ENV,
    "yes",
  );
  assert.deepEqual(stdinWrites, ["body text"]);
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

class FakeChildProcess extends EventEmitter {
  stderr = new PassThrough();
  stdout = new PassThrough();
  stdin: Writable;

  constructor(onEnd: (value: string) => void) {
    super();
    this.stdin = new Writable({
      write(chunk, _encoding, callback) {
        onEnd(chunk.toString());
        callback();
      },
    });
  }
}
