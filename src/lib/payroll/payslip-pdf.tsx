import "server-only";

import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { OrgBranding } from "@/lib/export/branding";

/**
 * Branded PDF payslip for a single payroll item. Earnings + deductions
 * breakdown, net pay, and employer cost — company logo/name from Settings.
 * Amounts are pre-formatted strings (the action formats with the company
 * currency) so this stays pure layout.
 */

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 44, paddingHorizontal: 36, fontSize: 9.5, color: "#1e293b" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: "#4f46e5",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 30, height: 30, borderRadius: 4, objectFit: "contain" },
  companyName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  docTitle: { textAlign: "right", color: "#64748b" },
  docTitleStrong: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  empRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  empLabel: { color: "#64748b", fontSize: 8 },
  empValue: { fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  columns: { flexDirection: "row", gap: 16 },
  col: { flex: 1 },
  colTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6, color: "#0f172a", textTransform: "uppercase", letterSpacing: 0.5 },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  lineLabel: { color: "#334155" },
  lineAmt: { fontFamily: "Helvetica-Bold" },
  subtotal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, marginTop: 2, fontFamily: "Helvetica-Bold" },
  netBox: {
    marginTop: 18,
    padding: 12,
    backgroundColor: "#ecfdf5",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  netLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#065f46" },
  netAmt: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#047857" },
  employer: { marginTop: 8, flexDirection: "row", justifyContent: "space-between", color: "#64748b", fontSize: 8.5 },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", color: "#94a3b8", fontSize: 7.5 },
});

export interface PayslipLine {
  label: string;
  amount: string;
}

export interface PayslipPdfData {
  branding: OrgBranding;
  employeeName: string;
  employeeCode: string;
  periodLabel: string;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  grossText: string;
  totalDeductionsText: string;
  netText: string;
  employerCostText: string;
  generatedAt: string;
}

function PayslipDoc(d: PayslipPdfData) {
  return (
    <Document title={`Payslip — ${d.employeeName} — ${d.periodLabel}`} author={d.branding.companyName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brand}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {d.branding.logoUrl ? <Image src={d.branding.logoUrl} style={styles.logo} /> : null}
            <Text style={styles.companyName}>{d.branding.companyName}</Text>
          </View>
          <View style={styles.docTitle}>
            <Text style={styles.docTitleStrong}>PAYSLIP</Text>
            <Text>{d.periodLabel}</Text>
          </View>
        </View>

        <View style={styles.empRow}>
          <View>
            <Text style={styles.empLabel}>EMPLOYEE</Text>
            <Text style={styles.empValue}>{d.employeeName}</Text>
          </View>
          <View>
            <Text style={styles.empLabel}>EMPLOYEE ID</Text>
            <Text style={styles.empValue}>{d.employeeCode}</Text>
          </View>
          <View>
            <Text style={styles.empLabel}>PERIOD</Text>
            <Text style={styles.empValue}>{d.periodLabel}</Text>
          </View>
        </View>

        <View style={styles.columns}>
          <View style={styles.col}>
            <Text style={styles.colTitle}>Earnings</Text>
            {d.earnings.length === 0 ? <Text style={styles.lineLabel}>—</Text> : null}
            {d.earnings.map((e, i) => (
              <View key={i} style={styles.line}>
                <Text style={styles.lineLabel}>{e.label}</Text>
                <Text style={styles.lineAmt}>{e.amount}</Text>
              </View>
            ))}
            <View style={styles.subtotal}>
              <Text>Gross</Text>
              <Text>{d.grossText}</Text>
            </View>
          </View>

          <View style={styles.col}>
            <Text style={styles.colTitle}>Deductions</Text>
            {d.deductions.length === 0 ? <Text style={styles.lineLabel}>—</Text> : null}
            {d.deductions.map((e, i) => (
              <View key={i} style={styles.line}>
                <Text style={styles.lineLabel}>{e.label}</Text>
                <Text style={styles.lineAmt}>{e.amount}</Text>
              </View>
            ))}
            <View style={styles.subtotal}>
              <Text>Total deductions</Text>
              <Text>{d.totalDeductionsText}</Text>
            </View>
          </View>
        </View>

        <View style={styles.netBox}>
          <Text style={styles.netLabel}>NET PAY</Text>
          <Text style={styles.netAmt}>{d.netText}</Text>
        </View>
        <View style={styles.employer}>
          <Text>Total cost to employer (gross + contributions)</Text>
          <Text>{d.employerCostText}</Text>
        </View>

        <View style={styles.footer}>
          <Text>{d.branding.companyName}</Text>
          <Text>Generated {d.generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderPayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  return renderToBuffer(<PayslipDoc {...data} />);
}
