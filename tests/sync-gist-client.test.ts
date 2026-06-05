import test from "node:test";
import assert from "node:assert/strict";
import { createGist, getGist, updateGist, validateToken } from "../src/sync/gist-client";
import { SyncPreferences } from "../src/sync/types";

function makePreferences(overrides: Partial<SyncPreferences> = {}): SyncPreferences {
  return {
    githubPersonalAccessToken: "test-token",
    orgFilePath: "/test/library.org",
    ...overrides,
  };
}

function mockFetch(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({
        "content-type": "application/json",
        ...headers,
      }),
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  };
}

test("validateToken returns true for valid token", async () => {
  const result = await validateToken({
    getPreferences: () => makePreferences(),
    fetchFn: mockFetch(200, { login: "test-user" }),
  });

  assert.equal(result, true);
});

test("validateToken returns false for 401", async () => {
  const result = await validateToken({
    getPreferences: () => makePreferences(),
    fetchFn: mockFetch(401, { message: "Bad credentials" }),
  });

  assert.equal(result, false);
});

test("validateToken returns false when token is empty", async () => {
  const result = await validateToken({
    getPreferences: () => makePreferences({ githubPersonalAccessToken: "" }),
  });

  assert.equal(result, false);
});

test("createGist sends correct POST request", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  let capturedMethod = "";

  const result = await createGist("org content", "library.org", {
    getPreferences: () => makePreferences(),
    fetchFn: async (input, init) => {
      capturedUrl = input.toString();
      capturedMethod = init?.method ?? "";
      capturedBody = init?.body ? init.body.toString() : "";
      return {
        ok: true,
        status: 201,
        headers: new Headers(),
        json: async () => ({
          id: "new-gist-id",
          html_url: "https://gist.github.com/new-gist-id",
        }),
        text: async () => "",
      } as Response;
    },
  });

  assert.equal(capturedMethod, "POST");
  assert.ok(capturedUrl.includes("/gists"));
  const parsed = JSON.parse(capturedBody);
  assert.equal(parsed.description, "Resource Library");
  assert.equal(parsed.public, false);
  assert.equal(parsed.files["library.org"].content, "org content");

  assert.equal(result.gistId, "new-gist-id");
  assert.equal(result.gistUrl, "https://gist.github.com/new-gist-id");
});

test("getGist fetches and parses response", async () => {
  const getGistResult = await getGist("test-gist-id", {
    getPreferences: () => makePreferences(),
    fetchFn: mockFetch(
      200,
      {
        id: "test-gist-id",
        html_url: "https://gist.github.com/test-gist-id",
        updated_at: "2026-06-05T12:00:00Z",
        files: {
          "library.org": {
            filename: "library.org",
            content: "org file content",
          },
        },
      },
      { etag: "W/\"abc123\"" },
    ),
  });

  assert.equal(getGistResult.updatedAt, "2026-06-05T12:00:00Z");
  assert.equal(getGistResult.etag, "W/\"abc123\"");
  assert.equal(getGistResult.files["library.org"].content, "org file content");
});

test("getGist throws GistNotFoundError for 404", async () => {
  await assert.rejects(
    () =>
      getGist("deleted-gist-id", {
        getPreferences: () => makePreferences(),
        fetchFn: mockFetch(404, { message: "Not Found" }),
      }),
    /deleted-gist-id/,
  );
});

test("getGist throws GistAuthError for 401", async () => {
  await assert.rejects(
    () =>
      getGist("any-gist-id", {
        getPreferences: () => makePreferences(),
        fetchFn: mockFetch(401, { message: "Bad credentials" }),
      }),
    /token/,
  );
});

test("updateGist sends correct PATCH request", async () => {
  let capturedMethod = "";
  let capturedBody = "";

  const result = await updateGist(
    "test-gist-id",
    { "library.org": { content: "updated content" } },
    {
      getPreferences: () => makePreferences(),
      fetchFn: async (input, init) => {
        capturedMethod = init?.method ?? "";
        capturedBody = init?.body ? init.body.toString() : "";
        return {
          ok: true,
          status: 200,
          headers: new Headers({ etag: "W/\"new-etag\"" }),
          json: async () => ({}),
          text: async () => "",
        } as Response;
      },
    },
  );

  assert.equal(capturedMethod, "PATCH");
  const parsed = JSON.parse(capturedBody);
  assert.equal(parsed.files["library.org"].content, "updated content");
  assert.equal(result.etag, "W/\"new-etag\"");
});

test("updateGist throws GistNotFoundError for 404", async () => {
  await assert.rejects(
    () =>
      updateGist(
        "deleted-gist-id",
        { "library.org": { content: "x" } },
        {
          getPreferences: () => makePreferences(),
          fetchFn: mockFetch(404, { message: "Not Found" }),
        },
      ),
    /deleted-gist-id/,
  );
});
