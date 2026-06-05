import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise, usePromise } from "@raycast/utils";
import { useState } from "react";
import {
  connectToGist,
  disconnectGist,
  getSyncStatus,
  isTokenValid,
  pullFromGist,
  pushToGist,
  setupGist,
} from "./sync/sync-service";
import { SyncStatus } from "./sync/types";
import { resetSyncState, markDirty, getLastPushAttemptTime, getSyncIntervalMs } from "./sync/coordinator";

export default function SyncGistCommand() {
  const {
    data: status,
    isLoading,
    revalidate,
  } = useCachedPromise(getSyncStatus);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Sync Gist"
    >
      <List.Section title="Sync Status">
        <List.Item
          title={status?.configured ? "Connected" : "Not Configured"}
          icon={
            status?.configured
              ? { source: Icon.CheckCircle, tintColor: "green" }
              : Icon.XMarkCircle
          }
          detail={<SyncStatusDetail status={status} />}
          actions={
            <SyncActions
              status={status}
              onChanged={revalidate}
            />
          }
        />
      </List.Section>
    </List>
  );
}

function SyncStatusDetail(props: { status?: SyncStatus }) {
  const { status } = props;

  if (!status) {
    return <List.Item.Detail markdown="Loading..." />;
  }

  if (!status.configured) {
    const lines: string[] = [
      "# Sync Gist",
      "",
      "Back up your resource library to a private GitHub Gist.",
      "",
      "### What this does",
      "- **Periodic sync**: Checks for changes every 3 hours and pushes if needed",
      "- **Pull on demand**: Restore your library on another machine",
      "",
      "### Getting started",
      `1. Create a [GitHub personal access token](https://github.com/settings/tokens) with **gist** scope`,
      "2. Paste the token in the extension preferences",
      "3. Come back here and choose **Create Gist Backup**",
    ];

    if (!status.localFileExists) {
      lines.push(
        "",
        "> ⚠️ Your Org file is not found at the configured path. Set a valid `orgFilePath` in preferences first.",
      );
    }

    return <List.Item.Detail markdown={lines.join("\n")} />;
  }

  const lastAttempt = getLastPushAttemptTime();
  const intervalMs = getSyncIntervalMs();
  const nextCheckTime = lastAttempt > 0 ? lastAttempt + intervalMs : Date.now() + intervalMs;
  const remainingMs = Math.max(0, nextCheckTime - Date.now());
  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  const lines = [
    "# Sync Gist",
    "",
    "### Gist",
    `[${status.gistUrl}](${status.gistUrl})`,
    "",
    "### Last Synced",
    status.lastSyncedAt
      ? new Date(status.lastSyncedAt).toLocaleString()
      : "Never",
    "",
    "### Next Check",
    lastAttempt === 0
      ? `In ~${remainingHours}h ${remainingMinutes}m`
      : `In ~${remainingHours}h ${remainingMinutes}m (every 3h)`,
    "",
  ];

  if (status.pendingChanges) {
    lines.push("> ⚡ Local changes pending — will be pushed at next check.");
  } else {
    lines.push("> ✅ In sync with remote.");
  }

  if (status.includeConfig) {
    lines.push("", "*Config file is included in sync.*");
  }

  if (status.error) {
    lines.push("", `> ❌ ${status.error}`);
  }

  return <List.Item.Detail markdown={lines.join("\n")} />;
}

function SyncActions(props: { status?: SyncStatus; onChanged: () => void }) {
  const { status, onChanged } = props;
  const { push } = useNavigation();

  return (
    <ActionPanel>
      {status?.configured ? (
        <>
          <Action
            title="Push Now"
            icon={Icon.Upload}
            shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            onAction={async () => {
              const toast = await showToast({
                style: Toast.Style.Animated,
                title: "Pushing to Gist...",
              });
              try {
                resetSyncState();
                const result = await pushToGist();
                toast.style = Toast.Style.Success;
                toast.title =
                  result.kind === "created"
                    ? "Gist created"
                    : "Gist updated";
                toast.message = result.gistUrl;
                onChanged();
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Push failed";
                toast.message =
                  error instanceof Error
                    ? error.message
                    : "Unknown error";
              }
            }}
          />
          <Action
            title="Pull from Gist"
            icon={Icon.Download}
            shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
            onAction={async () => {
              const toast = await showToast({
                style: Toast.Style.Animated,
                title: "Pulling from Gist...",
              });
              try {
                resetSyncState();
                const result = await pullFromGist();
                if (result.kind === "up-to-date") {
                  toast.style = Toast.Style.Success;
                  toast.title = "Already up to date";
                } else {
                  toast.style = Toast.Style.Success;
                  toast.title = "Pulled from Gist";
                  toast.message = `Updated ${new Date(
                    result.remoteUpdatedAt,
                  ).toLocaleString()}`;
                }
                onChanged();
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Pull failed";
                toast.message =
                  error instanceof Error
                    ? error.message
                    : "Unknown error";
              }
            }}
          />
          <Action.OpenInBrowser
            title="Open Gist in Browser"
            icon={Icon.Globe}
            url={status.gistUrl ?? ""}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
          />
          <Action.Push
            title="Connect to Different Gist"
            icon={Icon.Link}
            target={
              <ConnectGistForm
                onConnected={onChanged}
                defaultIncludeConfig={status.includeConfig}
              />
            }
          />
          <Action
            title="Disconnect"
            icon={Icon.Trash}
            shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
            onAction={async () => {
              resetSyncState();
              await disconnectGist();
              onChanged();
              await showHUD("Disconnected from Gist");
            }}
          />
        </>
      ) : (
        <>
          <Action.Push
            title="Create Gist Backup"
            icon={Icon.Plus}
            target={<SetupGistForm onSetup={onChanged} />}
          />
          <Action.Push
            title="Connect to Existing Gist"
            icon={Icon.Link}
            target={<ConnectGistForm onConnected={onChanged} />}
          />
        </>
      )}
    </ActionPanel>
  );
}

function SetupGistForm(props: { onSetup: () => void }) {
  const { onSetup } = props;
  const { pop } = useNavigation();
  const [includeConfig, setIncludeConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    setIsSaving(true);
    try {
      await setupGist(includeConfig);
      onSetup();
      pop();
      await showHUD("Gist backup created");
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to create Gist",
        message:
          error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Form
      navigationTitle="Create Gist Backup"
      isLoading={isSaving}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create Gist"
            icon={Icon.Plus}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Setup"
        text="A private GitHub Gist will be created with your Org file. Changes will be pushed automatically every 3 hours."
      />
      <Form.Checkbox
        id="includeConfig"
        title="Sync Config File"
        label="Also upload resource-library.config.json"
        value={includeConfig}
        onChange={setIncludeConfig}
      />
    </Form>
  );
}

function ConnectGistForm(props: {
  onConnected: () => void;
  defaultIncludeConfig?: boolean;
}) {
  const { onConnected, defaultIncludeConfig } = props;
  const { pop } = useNavigation();
  const [includeConfig, setIncludeConfig] = useState(
    defaultIncludeConfig ?? false,
  );
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(values: { gistId: string }) {
    const raw = values.gistId.trim();
    // Extract Gist ID from URL if a full URL was pasted
    const gistId = raw.includes("gist.github.com")
      ? raw.split("/").pop()?.split("#")[0] ?? raw
      : raw;

    if (!gistId) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Gist ID is required",
      });
      return;
    }

    setIsSaving(true);
    try {
      await connectToGist(gistId, includeConfig);
      onConnected();
      pop();
      await showHUD("Connected to Gist");
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to connect",
        message:
          error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Form
      navigationTitle="Connect to Gist"
      isLoading={isSaving}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Connect"
            icon={Icon.Link}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Connect"
        text="Enter the Gist ID or full Gist URL from your other machine."
      />
      <Form.TextField
        id="gistId"
        title="Gist ID or URL"
        placeholder="a1b2c3d4e5f6... or https://gist.github.com/..."
        autoFocus
      />
      <Form.Checkbox
        id="includeConfig"
        title="Sync Config File"
        label="Also sync resource-library.config.json"
        value={includeConfig}
        onChange={setIncludeConfig}
      />
    </Form>
  );
}
