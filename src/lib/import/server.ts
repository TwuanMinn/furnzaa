import "server-only";

import type { ActivityModule } from "@/lib/activity/log";
import type { SessionUser } from "@/lib/rbac/guards";
import type { PermissionKey } from "@/lib/rbac/permissions";
import type { ImportCommitResult, ImportField, ValidatedRow } from "./types";

/**
 * Import-dataset contract (server side). The shared import route validates
 * rows against `fields` (same rules the client previewed with) and hands the
 * valid ones to `insertRows`, which writes in ≤1,000-row batches and reports
 * per-row failures (e.g. duplicate codes) without aborting the whole import.
 */
export interface ImportDataset {
  title: string;
  slug: string;
  /** Activity-log module the import is recorded under. */
  module: ActivityModule;
  permission: PermissionKey;
  fields: ImportField[];
  insertRows: (rows: ValidatedRow[], user: SessionUser) => Promise<ImportCommitResult>;
}

/** Split rows into insert batches (default 1,000 per statement). */
export function chunk<T>(rows: T[], size = 1_000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
