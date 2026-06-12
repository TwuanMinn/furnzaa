import { requirePermission, ForbiddenError, UnauthorizedError } from "@/lib/rbac/guards";
import { jsonError } from "@/lib/api/response";
import { listQueryFromUrl } from "@/lib/datatable/server";
import { getExportDataset } from "@/lib/export/registry";
import { buildCsv } from "@/lib/export/csv";
import { getOrgBranding } from "@/lib/export/branding";
import { renderTablePdf } from "@/lib/export/pdf";
import { EXPORT_LIMITS, toTableData } from "@/lib/export/types";
import { logActivity } from "@/lib/activity/log";

/**
 * GET /api/export/[dataset]?format=csv|pdf&…same list params as the table.
 * ONE export service for every module: resolves the dataset, enforces its
 * permission server-side (RLS scopes the rows on top), streams the file, and
 * writes an activity-log entry.
 */
export async function GET(req: Request, ctx: { params: Promise<{ dataset: string }> }) {
  const { dataset: slug } = await ctx.params;
  const dataset = getExportDataset(slug);
  if (!dataset) return jsonError("Unknown export dataset", 404);

  let user;
  try {
    user = await requirePermission(dataset.permission);
  } catch (e) {
    if (e instanceof UnauthorizedError) return jsonError("Unauthorized", 401, "unauthorized");
    if (e instanceof ForbiddenError) return jsonError(e.message, 403, "forbidden");
    throw e;
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const query = listQueryFromUrl(url);
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    const rows = await dataset.fetchRows(query, user, EXPORT_LIMITS[format]);
    const table = toTableData(dataset, rows);

    void logActivity({
      actor: user,
      action: `${slug}.export`,
      module: dataset.module,
      targetType: slug,
      summary: `Exported ${rows.length} ${dataset.title.toLowerCase()} row(s) as ${format.toUpperCase()}`,
      after: { format, rowCount: rows.length, query },
    });

    if (format === "csv") {
      const csv = buildCsv(
        table.headers.map((h) => h.label),
        table.rows,
      );
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${dataset.slug}-${stamp}.csv"`,
        },
      });
    }

    const branding = await getOrgBranding();
    const filterSummary = [
      query.q ? `Search: "${query.q}"` : null,
      ...Object.entries(query.filters ?? {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`),
      `${rows.length} row(s)`,
    ]
      .filter(Boolean)
      .join("  ·  ");

    const pdf = await renderTablePdf({
      branding,
      title: dataset.title,
      filterSummary,
      table,
      generatedBy: user.fullName || user.email,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${dataset.slug}-${stamp}.pdf"`,
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Export failed", 500);
  }
}
