import { requirePermission, ForbiddenError, UnauthorizedError } from "@/lib/rbac/guards";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getImportDataset } from "@/lib/import/registry";
import {
  IMPORT_BATCH_SIZE,
  IMPORT_MAX_ROWS,
  validateRows,
  type ImportCommitResult,
} from "@/lib/import/types";
import { logActivity } from "@/lib/activity/log";

/**
 * Shared CSV-import endpoint.
 *   GET  /api/import/[dataset]            → field spec for the mapping wizard
 *   POST /api/import/[dataset]            → commit mapped rows (re-validated
 *        server-side, inserted in ≤1,000-row batches; per-row error report)
 * The client streams large files in chunks of IMPORT_BATCH_SIZE rows.
 */

async function resolve(slug: string) {
  const dataset = getImportDataset(slug);
  if (!dataset) return { error: jsonError("Unknown import dataset", 404) } as const;
  try {
    return { dataset, user: await requirePermission(dataset.permission) } as const;
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return { error: jsonError("Unauthorized", 401, "unauthorized") } as const;
    if (e instanceof ForbiddenError) return { error: jsonError(e.message, 403, "forbidden") } as const;
    throw e;
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ dataset: string }> }) {
  const { dataset: slug } = await ctx.params;
  const resolved = await resolve(slug);
  if ("error" in resolved) return resolved.error;
  const { dataset } = resolved;
  return jsonOk({
    title: dataset.title,
    fields: dataset.fields,
    batchSize: IMPORT_BATCH_SIZE,
    maxRows: IMPORT_MAX_ROWS,
  });
}

interface CommitBody {
  /** Mapped raw rows: { targetFieldKey: rawCellValue }. */
  rows: Record<string, string | null>[];
  /** 1-based row number of rows[0] in the source file (for error reports). */
  startRow?: number;
  /** True on the chunk that finishes the import (writes the audit entry). */
  final?: boolean;
  /** Running totals from previous chunks, echoed into the final audit entry. */
  totals?: { inserted: number; failed: number; fileName?: string };
}

export async function POST(req: Request, ctx: { params: Promise<{ dataset: string }> }) {
  const { dataset: slug } = await ctx.params;
  const resolved = await resolve(slug);
  if ("error" in resolved) return resolved.error;
  const { dataset, user } = resolved;

  let body: CommitBody;
  try {
    body = (await req.json()) as CommitBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  if (!Array.isArray(body.rows)) return jsonError("rows must be an array", 400);
  if (body.rows.length > IMPORT_BATCH_SIZE) {
    return jsonError(`Send at most ${IMPORT_BATCH_SIZE} rows per request`, 413);
  }

  // Server-side re-validation — the client preview is a convenience, not the gate.
  const { valid, errors: validationErrors } = validateRows(
    dataset.fields,
    body.rows,
    body.startRow ?? 1,
  );

  let result: ImportCommitResult = { inserted: 0, skipped: 0, errors: [] };
  if (valid.length > 0) {
    try {
      result = await dataset.insertRows(valid, user);
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Import failed", 500);
    }
  }

  // `skipped` counts ROWS (a row may carry several field errors).
  const invalidRowCount = body.rows.length - valid.length;
  const response: ImportCommitResult = {
    inserted: result.inserted,
    skipped: result.skipped + invalidRowCount,
    errors: [...validationErrors, ...result.errors],
  };

  if (body.final) {
    const inserted = (body.totals?.inserted ?? 0) + response.inserted;
    const failed = (body.totals?.failed ?? 0) + response.skipped;
    void logActivity({
      actor: user,
      action: `${slug}.import`,
      module: dataset.module,
      targetType: slug,
      summary: `Imported ${inserted} ${dataset.title.toLowerCase()} row(s) from CSV${
        failed ? ` (${failed} failed)` : ""
      }`,
      after: { inserted, failed, fileName: body.totals?.fileName ?? null },
    });
  }

  return jsonOk(response);
}
