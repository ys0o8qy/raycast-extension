import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Icon,
  List,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { suggestTagMerges, TagMergeSuggestion } from "./ai-tag-suggest";
import { log } from "./logger";
import { getAllTags, normalizeTags } from "./resource";
import { loadEntries, updateEntry } from "./storage";
import { LibraryEntry, NewEntryInput } from "./types";

interface TagStats {
  tag: string;
  count: number;
  isOrphan: boolean;
  isBroad: boolean;
}

const ORPHAN_THRESHOLD = 1;
const BROAD_THRESHOLD = 100;

/** Stage of the governance flow. */
type Stage = "stats" | "synonyms" | "execute";

export default function TagGovernanceCommand() {
  const { data = [], isLoading, revalidate } =
    useCachedPromise(loadEntries);
  const existingTags = useMemo(() => getAllTags(data), [data]);

  // Compute tag stats
  const stats = useMemo<TagStats[]>(() => {
    const counts = new Map<string, number>();
    for (const entry of data) {
      for (const tag of entry.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({
        tag,
        count,
        isOrphan: count <= ORPHAN_THRESHOLD,
        isBroad: count >= BROAD_THRESHOLD,
      }))
      .sort((a, b) => a.count - b.count);
  }, [data]);

  return (
    <TagGovernanceFlow
      entries={data}
      stats={stats}
      existingTags={existingTags}
      isLoading={isLoading}
      onChanged={revalidate}
    />
  );
}

function TagGovernanceFlow(props: {
  entries: LibraryEntry[];
  stats: TagStats[];
  existingTags: string[];
  isLoading: boolean;
  onChanged: () => void;
}) {
  const { entries, stats, existingTags, isLoading, onChanged } = props;
  const [stage, setStage] = useState<Stage>("stats");

  // Synonym detection state
  const [mergeSuggestions, setMergeSuggestions] = useState<TagMergeSuggestion[]>([]);
  const [approvedMerges, setApprovedMerges] = useState<TagMergeSuggestion[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);

  /** Tag → number of entries that have that tag. */
  const tagCountMap = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      for (const tag of entry.tags) {
        map.set(tag, (map.get(tag) ?? 0) + 1);
      }
    }
    return map;
  }, [entries]);

  const orphans = stats.filter((s) => s.isOrphan);
  const broad = stats.filter((s) => s.isBroad);

  /**
   * Find candidate synonym pairs using Levenshtein edit distance.
   * Only pairs with distance 1-2 (after normalizing) are considered.
   */
  function findCandidatePairs(): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    const tags = existingTags;

    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const dist = levenshteinDistance(tags[i], tags[j]);
        if (dist >= 1 && dist <= 2) {
          pairs.push([tags[i], tags[j]]);
        }
      }
    }
    return pairs;
  }

  async function detectSynonyms() {
    setIsDetecting(true);
    setStage("synonyms");

    const pairs = findCandidatePairs();
    log("tag-governance", "candidates", `Found ${pairs.length} candidate pairs via edit distance`);

    if (pairs.length === 0) {
      setMergeSuggestions([]);
      setIsDetecting(false);
      return;
    }

    const suggestions = await suggestTagMerges(pairs);
    setMergeSuggestions(suggestions);
    setIsDetecting(false);
  }

  function approveMerge(suggestion: TagMergeSuggestion) {
    setApprovedMerges((prev) => {
      if (prev.some((m) => m.from === suggestion.from && m.to === suggestion.to)) {
        return prev;
      }
      return [...prev, suggestion];
    });
  }

  function ignoreMerge(suggestion: TagMergeSuggestion) {
    setMergeSuggestions((prev) =>
      prev.filter(
        (m) => !(m.from === suggestion.from && m.to === suggestion.to),
      ),
    );
  }

  async function executeMerges() {
    // Count affected entries before executing
    const mergeMap = new Map<string, string>();
    for (const { from, to } of approvedMerges) {
      mergeMap.set(from, to);
    }

    const affectedEntries = entries.filter((entry) =>
      entry.tags.some((t) => mergeMap.has(t)),
    );
    const affectedCount = affectedEntries.length;
    const mergeCount = approvedMerges.length;

    const confirmed = await confirmAlert({
      title: `Execute ${mergeCount} Tag Merge${mergeCount > 1 ? "s" : ""}?`,
      message: `This will modify ${affectedCount} resource${affectedCount > 1 ? "s" : ""}. This action cannot be undone.`,
      primaryAction: {
        title: "Execute Merges",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) return;

    setStage("execute");
    log(
      "tag-governance",
      "execute-start",
      `Executing ${approvedMerges.length} tag merges`,
    );

    let updated = 0;
    let errors = 0;

    for (const entry of entries) {
      const newTags = normalizeTags(
        entry.tags.map((t) => mergeMap.get(t) ?? t),
      );

      if (arraysEqual(entry.tags, newTags)) continue;

      const input: NewEntryInput = {
        title: entry.title,
        type: entry.type,
        tags: newTags,
        groupPath: [],
        url: entry.properties.URL,
        path: entry.properties.PATH,
        schemaKind: entry.properties.SCHEMA_KIND,
        schemaCommand: entry.properties.SCHEMA_COMMAND,
        schemaArgs: entry.properties.SCHEMA_ARGS,
        body: entry.body,
      };

      try {
        await updateEntry(entry.id, input);
        updated++;
      } catch (error) {
        errors++;
        log("tag-governance", "execute-error", `Failed: ${entry.title}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log("tag-governance", "execute-done", `Updated: ${updated}, errors: ${errors}`);
    onChanged();

    await showHUD(`Merged tags in ${updated} resources`);
    setApprovedMerges([]);
    setMergeSuggestions([]);
    setStage("stats");
  }

  // ---- Stage: stats ----
  if (stage === "stats") {
    return (
      <List
        isLoading={isLoading}
        navigationTitle="Tag Governance"
        searchBarPlaceholder="Search tags..."
        filtering
        actions={
          <ActionPanel>
            <Action
              title="Detect Synonyms"
              icon={Icon.MagnifyingGlass}
              shortcut={{ modifiers: ["cmd"], key: "return" }}
              onAction={detectSynonyms}
            />
          </ActionPanel>
        }
      >
        {orphans.length > 0 ? (
          <List.Section
            title="Orphan Tags"
            subtitle={`${orphans.length} tags with 1 resource`}
          >
            {orphans.map((s) => (
              <List.Item
                key={s.tag}
                title={`#${s.tag}`}
                subtitle={`${s.count} resource${s.count === 1 ? "" : "s"}`}
                icon={Icon.Warning}
                actions={
                  <ActionPanel>
                    <Action
                      title="Detect Synonyms"
                      icon={Icon.MagnifyingGlass}
                      shortcut={{ modifiers: ["cmd"], key: "return" }}
                      onAction={detectSynonyms}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ) : null}

        {broad.length > 0 ? (
          <List.Section
            title="Broad Tags"
            subtitle={`${broad.length} tags with ≥${BROAD_THRESHOLD} resources`}
          >
            {broad.map((s) => (
              <List.Item
                key={s.tag}
                title={`#${s.tag}`}
                subtitle={`${s.count} resources`}
                icon={Icon.List}
                actions={
                  <ActionPanel>
                    <Action
                      title="Detect Synonyms"
                      icon={Icon.MagnifyingGlass}
                      shortcut={{ modifiers: ["cmd"], key: "return" }}
                      onAction={detectSynonyms}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ) : null}

        {stats.length > 0 ? (
          <List.Section
            title="All Tags"
            subtitle={`${stats.length} total`}
          >
            {stats.map((s) => (
              <List.Item
                key={s.tag}
                title={`#${s.tag}`}
                subtitle={`${s.count} resource${s.count === 1 ? "" : "s"}`}
                icon={
                  s.isOrphan
                    ? Icon.Warning
                    : s.isBroad
                      ? Icon.List
                      : Icon.Tag
                }
                actions={
                  <ActionPanel>
                    <Action
                      title="Detect Synonyms"
                      icon={Icon.MagnifyingGlass}
                      shortcut={{ modifiers: ["cmd"], key: "return" }}
                      onAction={detectSynonyms}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ) : null}

        {stats.length === 0 ? (
          <List.EmptyView
            title="No tags yet"
            description="Add resources with tags to analyze your tag space"
            icon={Icon.Tag}
          />
        ) : null}
      </List>
    );
  }

  // ---- Stage: synonyms ----
  if (stage === "synonyms") {
    const remainingMerges = mergeSuggestions.filter(
      (s) =>
        !approvedMerges.some(
          (a) => a.from === s.from && a.to === s.to,
        ),
    );

    /** Compute affected entries for a given merge suggestion. */
    function getAffectedEntries(fromTag: string): LibraryEntry[] {
      return entries.filter((e) => e.tags.includes(fromTag));
    }

    /** Count of unique entries affected by all approved merges. */
    const totalAffectedApproved = (() => {
      const mergedTagSet = new Set(approvedMerges.map((m) => m.from));
      return entries.filter((e) => e.tags.some((t) => mergedTagSet.has(t))).length;
    })();

    /** Build a detail view for a merge suggestion. */
    function renderMergeDetail(m: TagMergeSuggestion) {
      const affected = getAffectedEntries(m.from);
      return (
        <List.Item.Detail
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label
                title="From"
                text={`#${m.from}`}
              />
              <List.Item.Detail.Metadata.Label
                title="To"
                text={`#${m.to}`}
              />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label
                title="Reason"
                text={m.reason}
              />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label
                title="Affected Resources"
                text={`${affected.length} resource${affected.length === 1 ? "" : "s"}`}
              />
              {affected.length > 0 && affected.map((e) => (
                <List.Item.Detail.Metadata.Label
                  key={e.id}
                  title=""
                  text={e.title}
                />
              ))}
            </List.Item.Detail.Metadata>
          }
        />
      );
    }

    return (
      <List
        isLoading={isDetecting}
        navigationTitle="Synonym Detection"
        searchBarPlaceholder="Filter merge suggestions..."
        filtering={!isDetecting}
        actions={
          <ActionPanel>
            <Action
              title={`Execute ${approvedMerges.length} Merges`}
              icon={Icon.CheckCircle}
              shortcut={{ modifiers: ["cmd"], key: "return" }}
              onAction={executeMerges}
            />
          </ActionPanel>
        }
      >
        {approvedMerges.length > 0 ? (
          <List.Section
            title="Approved Merges"
            subtitle={`${approvedMerges.length} merge${approvedMerges.length === 1 ? "" : "s"} · ${totalAffectedApproved} resource${totalAffectedApproved === 1 ? "" : "s"} affected`}
          >
            {approvedMerges.map((m) => (
              <List.Item
                key={`${m.from}→${m.to}`}
                title={`#${m.from} → #${m.to}`}
                subtitle={(() => {
                  const n = tagCountMap.get(m.from) ?? 0;
                  return `${m.reason} · ${n} resource${n === 1 ? "" : "s"}`;
                })()}
                icon={Icon.CheckCircle}
              />
            ))}
          </List.Section>
        ) : null}

        {remainingMerges.length > 0 ? (
          <List.Section
            title="Suggested Merges"
            subtitle={`${remainingMerges.length} to review`}
          >
            {remainingMerges.map((m) => (
              <List.Item
                key={`${m.from}→${m.to}`}
                title={`#${m.from} → #${m.to}`}
                subtitle={(() => {
                  const n = tagCountMap.get(m.from) ?? 0;
                  return `${m.reason} · ${n} resource${n === 1 ? "" : "s"}`;
                })()}
                icon={Icon.Switch}
                actions={
                  <ActionPanel>
                    <Action
                      title="Approve Merge"
                      icon={Icon.CheckCircle}
                      onAction={() => approveMerge(m)}
                    />
                    <Action
                      title="Ignore"
                      icon={Icon.XMarkCircle}
                      onAction={() => ignoreMerge(m)}
                    />
                    <Action
                      title={`Execute ${approvedMerges.length} Merges`}
                      icon={Icon.CheckCircle}
                      shortcut={{ modifiers: ["cmd"], key: "return" }}
                      onAction={executeMerges}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ) : null}

        {!isDetecting &&
        remainingMerges.length === 0 &&
        approvedMerges.length === 0 ? (
          <List.EmptyView
            title="No synonyms found"
            description="Your tag space looks clean! No merge suggestions detected."
            icon={Icon.CheckCircle}
            actions={
              <ActionPanel>
                <Action
                  title="Back to Stats"
                  icon={Icon.ArrowLeft}
                  onAction={() => setStage("stats")}
                />
              </ActionPanel>
            }
          />
        ) : null}

        {isDetecting ? (
          <List.EmptyView
            title="Detecting synonyms…"
            description="Analyzing tag pairs with AI"
            icon={Icon.MagnifyingGlass}
          />
        ) : null}
      </List>
    );
  }

  // ---- Stage: execute ----
  return (
    <List isLoading navigationTitle="Tag Governance">
      <List.EmptyView
        title="Executing merges…"
        description={`Applying ${approvedMerges.length} tag merges`}
        icon={Icon.SaveDocument}
      />
    </List>
  );
}

// ---- Helpers ----

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}
