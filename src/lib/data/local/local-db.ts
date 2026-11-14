import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/config/env";
import { buildSeedData } from "@/lib/demo/seed";
import type { SeedData } from "@/lib/demo/seed";
import type { BillingAccount, VexoConnection } from "@/lib/domain/types";

/** All local tables: the seed shape plus server-only Vexo connections and billing accounts. */
export type LocalData = SeedData & { vexoConnections: VexoConnection[]; billingAccounts: BillingAccount[] };

export interface LocalDb {
  readonly data: LocalData;
  /** Persist the current tables (no-op for ":memory:"; warns once if the disk is not writable). */
  save(): void;
}

const MEMORY_PATH = ":memory:";
const TABLES: (keyof LocalData)[] = [
  "profiles",
  "patients",
  "assignments",
  "entries",
  "observations",
  "sourceRefs",
  "voiceSessions",
  "summaries",
  "approvals",
  "doctorReviews",
  "vexoConnections",
  "usageRecords",
  "billingAccounts",
];

interface Holder {
  dbPath: string;
  data: LocalData;
  warned: boolean;
}

const GLOBAL_KEY = Symbol.for("doctorloop.localDb");
type GlobalWithDb = typeof globalThis & { [GLOBAL_KEY]?: Holder };

function resolvePath(): string {
  const configured = env.localDbPath;
  return configured === MEMORY_PATH ? MEMORY_PATH : path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function freshData(now: Date): LocalData {
  return { ...structuredClone(buildSeedData(now)), vexoConnections: [], billingAccounts: [] };
}

function isLocalData(value: unknown): value is LocalData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return TABLES.every((table) => Array.isArray(record[table]));
}

function readFromDisk(dbPath: string): LocalData | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    return isLocalData(parsed) ? parsed : null;
  } catch {
    return null; // missing or corrupt: re-seed
  }
}

function writeToDisk(holder: Holder): void {
  if (holder.dbPath === MEMORY_PATH) return;
  try {
    fs.mkdirSync(path.dirname(holder.dbPath), { recursive: true });
    const tmp = `${holder.dbPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(holder.data));
    fs.renameSync(tmp, holder.dbPath);
  } catch (error) {
    if (!holder.warned) {
      holder.warned = true;
      console.warn("[DoctorLoop] Could not persist the local demo database; continuing in memory.", error);
    }
  }
}

function createHolder(dbPath: string, data: LocalData): Holder {
  const holder: Holder = { dbPath, data, warned: false };
  writeToDisk(holder);
  return holder;
}

function load(dbPath: string): Holder {
  const existing = dbPath === MEMORY_PATH ? null : readFromDisk(dbPath);
  return existing ? { dbPath, data: existing, warned: false } : createHolder(dbPath, freshData(new Date()));
}

/** Singleton on globalThis (survives Next.js dev module reloads). */
export function getLocalDb(): LocalDb {
  const g = globalThis as GlobalWithDb;
  const dbPath = resolvePath();
  let holder = g[GLOBAL_KEY];
  if (!holder || holder.dbPath !== dbPath || !isLocalData(holder.data)) {
    holder = load(dbPath);
    g[GLOBAL_KEY] = holder;
  }
  const current = holder;
  return { data: current.data, save: () => writeToDisk(current) };
}

/** Replace all data with a fresh seed relative to `now`. */
export function resetLocalDb(now: Date = new Date()): void {
  (globalThis as GlobalWithDb)[GLOBAL_KEY] = createHolder(resolvePath(), freshData(now));
}
