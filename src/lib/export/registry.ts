import "server-only";

import type { ExportDataset } from "./types";
import { customersExportDataset } from "@/lib/datasets/customers";
import { usersExportDataset } from "@/lib/datasets/users";
import { ordersExportDataset } from "@/lib/datasets/orders";
import { activityExportDataset } from "@/lib/datasets/activity";
import { productsExportDataset } from "@/lib/datasets/products";
import { movementsExportDataset } from "@/lib/datasets/inventory";
import { profitExportDataset } from "@/lib/datasets/profit";
import { crmCustomersExportDataset, vouchersExportDataset } from "@/lib/datasets/crm";
import { costCalculationsExportDataset } from "@/lib/datasets/cost-calculations";
import { analyticsExportDataset } from "@/lib/datasets/analytics";
import { trendsExportDataset } from "@/lib/datasets/trends";
import { feedbackExportDataset } from "@/lib/datasets/feedback";
import { roiInvestmentsExportDataset } from "@/lib/datasets/roi-investments";
import { roiMonthlyExportDataset } from "@/lib/datasets/roi-monthly";

/**
 * Every exportable dataset, keyed by slug. The export route and print view
 * resolve datasets here; each module registers its own definition as it lands.
 */
// Datasets are stored type-erased (ExportDataset<never>); the route only ever
// pipes fetchRows output back into the same dataset's columns, so this is safe.
const EXPORT_DATASETS: Record<string, ExportDataset<never>> = {
  customers: customersExportDataset as unknown as ExportDataset<never>,
  users: usersExportDataset as unknown as ExportDataset<never>,
  orders: ordersExportDataset as unknown as ExportDataset<never>,
  activity: activityExportDataset as unknown as ExportDataset<never>,
  products: productsExportDataset as unknown as ExportDataset<never>,
  "inventory-movements": movementsExportDataset as unknown as ExportDataset<never>,
  profit: profitExportDataset as unknown as ExportDataset<never>,
  "crm-customers": crmCustomersExportDataset as unknown as ExportDataset<never>,
  vouchers: vouchersExportDataset as unknown as ExportDataset<never>,
  "cost-calculations": costCalculationsExportDataset as unknown as ExportDataset<never>,
  analytics: analyticsExportDataset as unknown as ExportDataset<never>,
  trends: trendsExportDataset as unknown as ExportDataset<never>,
  feedback: feedbackExportDataset as unknown as ExportDataset<never>,
  "roi-investments": roiInvestmentsExportDataset as unknown as ExportDataset<never>,
  "roi-monthly": roiMonthlyExportDataset as unknown as ExportDataset<never>,
};

export function getExportDataset(slug: string): ExportDataset<never> | null {
  return EXPORT_DATASETS[slug] ?? null;
}
