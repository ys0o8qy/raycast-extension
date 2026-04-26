import test from "node:test";
import assert from "node:assert/strict";
import {
  loadResourceLibraryConfig,
  validateResourceLibraryConfig,
} from "../src/config";

test("loadResourceLibraryConfig returns an empty version-1 config when no path is set", async () => {
  const config = await loadResourceLibraryConfig({
    getPreferences: () => ({ orgFilePath: "/tmp/library.org", configFilePath: " " }),
    readFile: async () => {
      throw new Error("readFile should not be called when no config path is set");
    },
  });

  assert.deepEqual(config, {
    version: 1,
    actions: {},
    types: {},
  });
});

test("loadResourceLibraryConfig parses and validates JSON from the configured path", async () => {
  const config = await loadResourceLibraryConfig({
    getPreferences: () => ({
      orgFilePath: "/tmp/library.org",
      configFilePath: "/tmp/resource-library.config.json",
    }),
    readFile: async (path) => {
      assert.equal(path, "/tmp/resource-library.config.json");
      return JSON.stringify({
        version: 1,
        actions: {
          "copy-title": {
            title: "Copy Title",
            mode: "builtin",
            builtin: "copy-to-clipboard",
            requires: ["title"],
            value: "{{title}}",
          },
        },
        types: {
          snippet: {
            extends: "builtin:text",
            defaultAction: "copy-title",
            actions: ["copy-title"],
          },
        },
      });
    },
  });

  assert.equal(config.types.snippet?.extends, "builtin:text");
  assert.equal(config.actions["copy-title"]?.builtin, "copy-to-clipboard");
  assert.deepEqual(config.actions["copy-title"]?.requires, ["title"]);
});

test("validateResourceLibraryConfig preserves optional action requires arrays", () => {
  const config = validateResourceLibraryConfig({
    version: 1,
    actions: {
      "open-related": {
        title: "Open Related",
        mode: "command",
        command: "tool",
        requires: ["url", "body"],
      },
    },
    types: {
      snippet: {
        extends: "builtin:text",
        actions: ["open-related"],
      },
    },
  });

  assert.deepEqual(config.actions["open-related"]?.requires, ["url", "body"]);
});

test("loadResourceLibraryConfig surfaces config read failures with the path", async () => {
  await assert.rejects(
    () =>
      loadResourceLibraryConfig({
        getPreferences: () => ({
          orgFilePath: "/tmp/library.org",
          configFilePath: "/tmp/missing.json",
        }),
        readFile: async () => {
          throw new Error("ENOENT");
        },
      }),
    /failed to read resource library config at \/tmp\/missing\.json: error: enoent/i,
  );
});

test("loadResourceLibraryConfig surfaces JSON parse failures with the path", async () => {
  await assert.rejects(
    () =>
      loadResourceLibraryConfig({
        getPreferences: () => ({
          orgFilePath: "/tmp/library.org",
          configFilePath: "/tmp/bad.json",
        }),
        readFile: async () => "{",
      }),
    /failed to parse resource library config at \/tmp\/bad\.json:/i,
  );
});

test("validateResourceLibraryConfig rejects malformed config objects", () => {
  assert.throws(
    () =>
      validateResourceLibraryConfig({
        version: 1,
        actions: [],
        types: {},
      }),
    /config field actions must be an object/i,
  );

  assert.throws(
    () =>
      validateResourceLibraryConfig({
        version: 1,
        actions: {},
        types: {
          snippet: {
            actions: ["copy-body"],
          },
        },
      }),
    /type snippet is missing required field extends/i,
  );

  assert.throws(
    () =>
      validateResourceLibraryConfig({
        version: 1,
        actions: {
          "copy-title": {
            title: "Copy Title",
            mode: "builtin",
          },
        },
        types: {},
      }),
    /action copy-title field builtin is required/i,
  );

  assert.throws(
    () =>
      validateResourceLibraryConfig({
        version: 1,
        actions: {
          "run-script": {
            title: "Run Script",
            mode: "command",
          },
        },
        types: {},
      }),
    /action run-script field command must be a non-empty string/i,
  );

  assert.throws(
    () =>
      validateResourceLibraryConfig({
        version: 1,
        actions: {
          "copy-title": {
            title: "Copy Title",
            mode: "builtin",
            builtin: "copy-to-clipboard",
            requires: ["title", 7],
          },
        },
        types: {},
      }),
    /action copy-title field requires must be an array of strings/i,
  );
});
