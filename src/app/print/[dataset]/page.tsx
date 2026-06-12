import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { getExportDataset } from "@/lib/export/registry";
import { getOrgBranding } from "@/lib/export/branding";
import { EXPORT_LIMITS, toTableData } from "@/lib/export/types";
import type { ListQuery } from "@/lib/datatable/types";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

/**
 * Branded print view — /print/[dataset]?…same params as the table. Lives
 * OUTSIDE the app shell so only the document prints. Auth + the dataset's
 * permission are enforced here (plus RLS underneath); the toolbar triggers
 * window.print() and is hidden by the print stylesheet.
 */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ dataset: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ dataset: slug }, sp] = await Promise.all([params, searchParams]);
  const dataset = getExportDataset(slug);
  if (!dataset) notFound();

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/print/${slug}`);
  if (!user.permissions.has(dataset.permission)) redirect("/dashboard");

  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (key.startsWith("f_") && typeof value === "string" && value !== "") {
      filters[key.slice(2)] = value;
    }
  }
  const query: ListQuery = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    sort: typeof sp.sort === "string" ? sp.sort : undefined,
    dir: sp.dir === "asc" || sp.dir === "desc" ? sp.dir : undefined,
    filters,
  };

  const [branding, rows] = await Promise.all([
    getOrgBranding(),
    dataset.fetchRows(query, user, EXPORT_LIMITS.print),
  ]);
  const table = toTableData(dataset, rows);
  const filterSummary = [
    query.q ? `Search: "${query.q}"` : null,
    ...Object.entries(filters).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`),
    `${rows.length} row(s)`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="mx-auto max-w-6xl bg-white p-8 text-slate-900 print:max-w-none print:p-0">
      <PrintToolbar />

      <header className="mb-6 flex items-start justify-between border-b-2 border-indigo-600 pb-4">
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- print view; plain img avoids the optimizer
            <img src={branding.logoUrl} alt="" className="size-10 rounded object-contain" />
          ) : null}
          <div>
            <p className="text-xl font-bold tracking-tight">{branding.companyName}</p>
            <p className="text-sm text-slate-500">{dataset.title}</p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          {branding.addressLine ? <p>{branding.addressLine}</p> : null}
          {branding.contactEmail ? <p>{branding.contactEmail}</p> : null}
          <p>
            Generated{" "}
            {new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} by{" "}
            {user.fullName || user.email}
          </p>
        </div>
      </header>

      <p className="mb-4 text-xs text-slate-500">{filterSummary}</p>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-indigo-200 bg-indigo-50 text-left">
            {table.headers.map((h, i) => (
              <th
                key={i}
                className="px-2 py-1.5 font-semibold"
                style={{ textAlign: h.align }}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="break-inside-avoid border-b border-slate-200 even:bg-slate-50">
              {row.map((cell, c) => (
                <td key={c} className="px-2 py-1.5" style={{ textAlign: table.headers[c]?.align }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {table.rows.length === 0 ? (
            <tr>
              <td colSpan={table.headers.length} className="px-2 py-8 text-center text-slate-400">
                No rows match the current filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
