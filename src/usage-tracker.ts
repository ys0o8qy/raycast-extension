import { LocalStorage } from "@raycast/api";

const STORAGE_KEY = "resource-usage";

const OPEN_WEIGHT = 2;
const COPY_WEIGHT = 3;
const HALF_LIFE_HOURS = 48;
const DECAY_RATE = Math.log(2) / HALF_LIFE_HOURS;

interface UsageRecord {
  opens: number;
  copies: number;
  lastOpenAt: string;
  lastCopyAt: string;
}

type UsageStore = Record<string, UsageRecord>;

async function readStore(): Promise<UsageStore> {
  try {
    const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as UsageStore;
  } catch {
    return {};
  }
}

async function writeStore(store: UsageStore): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function hoursSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return Infinity;
  return (Date.now() - then) / (1000 * 60 * 60);
}

function decayWeight(hours: number): number {
  if (!isFinite(hours) || hours < 0) return 0;
  return Math.exp(-DECAY_RATE * hours);
}

export async function recordOpen(entryId: string): Promise<void> {
  const store = await readStore();
  const now = new Date().toISOString();
  const existing = store[entryId];
  store[entryId] = {
    opens: (existing?.opens ?? 0) + 1,
    copies: existing?.copies ?? 0,
    lastOpenAt: now,
    lastCopyAt: existing?.lastCopyAt ?? now,
  };
  await writeStore(store);
}

export async function recordCopy(entryId: string): Promise<void> {
  const store = await readStore();
  const now = new Date().toISOString();
  const existing = store[entryId];
  store[entryId] = {
    opens: existing?.opens ?? 0,
    copies: (existing?.copies ?? 0) + 1,
    lastOpenAt: existing?.lastOpenAt ?? now,
    lastCopyAt: now,
  };
  await writeStore(store);
}

export async function loadUsageScores(): Promise<Record<string, number>> {
  const store = await readStore();
  const scores: Record<string, number> = {};

  for (const [entryId, record] of Object.entries(store)) {
    const openHours = hoursSince(record.lastOpenAt);
    const copyHours = hoursSince(record.lastCopyAt);

    const rawScore =
      record.opens * OPEN_WEIGHT * decayWeight(openHours) +
      record.copies * COPY_WEIGHT * decayWeight(copyHours);

    scores[entryId] = Math.log(1 + rawScore);
  }

  return scores;
}
