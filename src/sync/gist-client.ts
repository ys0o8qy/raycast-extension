import {
  GistAuthError,
  GistNetworkError,
  GistNotFoundError,
  GistRateLimitError,
  GistResponse,
  SyncPreferences,
} from "./types";

interface GistClientOptions {
  getPreferences?: () => SyncPreferences;
  fetchFn?: typeof fetch;
}

const GITHUB_API_BASE = "https://api.github.com";

function getSyncPreferences(): SyncPreferences {
  const { getPreferenceValues } = require("@raycast/api") as typeof import("@raycast/api");
  return getPreferenceValues<SyncPreferences>();
}

function getToken(preferences: SyncPreferences): string {
  const token = preferences.githubPersonalAccessToken?.trim();
  if (!token) {
    throw new GistAuthError("GitHub personal access token is not configured");
  }
  return token;
}

function headers(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function handleResponse(response: Response, context: string): Promise<Response> {
  if (response.ok) {
    return response;
  }

  if (response.status === 401) {
    throw new GistAuthError();
  }

  if (response.status === 404) {
    // Gist ID extracted from the URL path if available
    const gistId = context.includes("/gists/") ? context.split("/gists/")[1]?.split("/")[0] : "unknown";
    throw new GistNotFoundError(gistId || context);
  }

  if (response.status === 403 || response.status === 429) {
    const body = await response.text().catch(() => "");
    const isRateLimit =
      body.includes("rate limit") ||
      body.includes("secondary rate limit") ||
      response.headers.get("x-ratelimit-remaining") === "0";
    if (isRateLimit) {
      throw new GistRateLimitError();
    }
    throw new GistAuthError(`GitHub API returned ${response.status}: insufficient permissions`);
  }

  throw new GistNetworkError(`GitHub API returned ${response.status} for ${context}`);
}

export async function validateToken(
  options: GistClientOptions = {},
): Promise<boolean> {
  const getPreferences = options.getPreferences ?? getSyncPreferences;
  const fetchFn = options.fetchFn ?? fetch;
  const preferences = getPreferences();

  let token: string;
  try {
    token = getToken(preferences);
  } catch {
    return false;
  }

  try {
    const response = await fetchFn(`${GITHUB_API_BASE}/user`, {
      headers: headers(token),
    });
    await handleResponse(response, "token validation");
    return true;
  } catch (error) {
    if (error instanceof GistAuthError) {
      return false;
    }
    throw error;
  }
}

export async function createGist(
  content: string,
  filename: string,
  options: GistClientOptions = {},
): Promise<{ gistId: string; gistUrl: string }> {
  const getPreferences = options.getPreferences ?? getSyncPreferences;
  const fetchFn = options.fetchFn ?? fetch;
  const preferences = getPreferences();
  const token = getToken(preferences);

  const body = JSON.stringify({
    description: "Resource Library",
    public: false,
    files: {
      [filename]: { content },
    },
  });

  const response = await fetchFn(`${GITHUB_API_BASE}/gists`, {
    method: "POST",
    headers: headers(token),
    body,
  });

  await handleResponse(response, "create gist");
  const gist = (await response.json()) as GistResponse;

  return {
    gistId: gist.id,
    gistUrl: gist.html_url,
  };
}

export async function getGist(
  gistId: string,
  options: GistClientOptions = {},
): Promise<{ files: Record<string, { filename: string; content: string }>; updatedAt: string; etag: string | null }> {
  const getPreferences = options.getPreferences ?? getSyncPreferences;
  const fetchFn = options.fetchFn ?? fetch;
  const preferences = getPreferences();
  const token = getToken(preferences);

  const response = await fetchFn(`${GITHUB_API_BASE}/gists/${encodeURIComponent(gistId)}`, {
    headers: headers(token),
  });

  await handleResponse(response, `/gists/${gistId}`);
  const gist = (await response.json()) as GistResponse;

  const files: Record<string, { filename: string; content: string }> = {};
  for (const [name, file] of Object.entries(gist.files)) {
    if (file.content !== undefined) {
      files[name] = { filename: file.filename, content: file.content };
    }
  }

  return {
    files,
    updatedAt: gist.updated_at,
    etag: response.headers.get("etag") ?? null,
  };
}

export async function updateGist(
  gistId: string,
  files: Record<string, { content: string }>,
  options: GistClientOptions = {},
): Promise<{ etag: string | null }> {
  const getPreferences = options.getPreferences ?? getSyncPreferences;
  const fetchFn = options.fetchFn ?? fetch;
  const preferences = getPreferences();
  const token = getToken(preferences);

  const body = JSON.stringify({ files });

  const response = await fetchFn(
    `${GITHUB_API_BASE}/gists/${encodeURIComponent(gistId)}`,
    {
      method: "PATCH",
      headers: headers(token),
      body,
    },
  );

  await handleResponse(response, `/gists/${gistId}`);

  return {
    etag: response.headers.get("etag") ?? null,
  };
}
