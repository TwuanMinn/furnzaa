import "server-only";

import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { OrgBranding } from "./branding";
import type { ExportTableData } from "./types";

/**
 * Branded PDF renderer for every export. One layout for all datasets:
 * company logo + name header (from Settings), document title, filter summary,
 * zebra-striped table, page numbers and a generated-at footer.
 */

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 44, paddingHorizontal: 32, fontSize: 8.5, color: "#1e293b" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: "#4f46e5",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 28, height: 28, borderRadius: 4, objectFit: "contain" },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  meta: { textAlign: "right", color: "#64748b", fontSize: 8 },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2, color: "#0f172a" },
  subtitle: { color: "#64748b", marginBottom: 10 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#eef2ff",
    borderBottomWidth: 1,
    borderBottomColor: "#c7d2fe",
    fontFamily: "Helvetica-Bold",
  },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  rowAlt: { backgroundColor: "#f8fafc" },
  cell: { paddingVertical: 4, paddingHorizontal: 4 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#94a3b8",
    fontSize: 7.5,
  },
});

export interface PdfExportOptions {
  branding: OrgBranding;
  title: string;
  /** e.g. `Search: "sofa" · Status: Delivered · 132 rows` */
  filterSummary: string;
  table: ExportTableData;
  generatedBy: string;
}

function BrandedTablePdf({ branding, title, filterSummary, table, generatedBy }: PdfExportOptions) {
  const totalWidth = table.headers.reduce((acc, h) => acc + h.width, 0) || 1;
  const widthPct = (w: number) => `${((w / totalWidth) * 100).toFixed(2)}%`;
  const generatedAt = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  return (
    <Document title={`${branding.companyName} — ${title}`} author={branding.companyName}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.brand}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {branding.logoUrl ? <Image src={branding.logoUrl} style={styles.logo} /> : null}
            <Text style={styles.companyName}>{branding.companyName}</Text>
          </View>
          <View style={styles.meta}>
            {branding.addressLine ? <Text>{branding.addressLine}</Text> : null}
            {branding.contactEmail ? <Text>{branding.contactEmail}</Text> : null}
          </View>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{filterSummary}</Text>

        <View style={styles.tableHeader} fixed>
          {table.headers.map((h, i) => (
            <Text
              key={i}
              style={[styles.cell, { width: widthPct(h.width), textAlign: h.align }]}
            >
              {h.label}
            </Text>
          ))}
        </View>
        {table.rows.map((row, r) => (
          <View key={r} style={r % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row} wrap={false}>
            {row.map((cell, c) => {
              const h = table.headers[c];
              return (
                <Text
                  key={c}
                  style={[styles.cell, { width: widthPct(h?.width ?? 1), textAlign: h?.align ?? "left" }]}
                >
                  {cell}
                </Text>
              );
            })}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>
            Generated {generatedAt} by {generatedBy}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Render the branded table PDF to a Buffer (route handlers stream it back). */
export async function renderTablePdf(options: PdfExportOptions): Promise<Buffer> {
  return renderToBuffer(<BrandedTablePdf {...options} />);
}
