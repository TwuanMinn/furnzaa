import "server-only";

import type { ImportDataset } from "./server";
import { customersImportDataset } from "@/lib/datasets/customers";
import { usersImportDataset } from "@/lib/datasets/users";
import { ordersImportDataset } from "@/lib/datasets/orders";
import { productsImportDataset } from "@/lib/datasets/products";
import { trendsImportDataset } from "@/lib/datasets/trends";
import { feedbackImportDataset } from "@/lib/datasets/feedback";

/**
 * Every importable dataset, keyed by slug. The shared import route resolves
 * field specs + insert handlers here; modules register as they land.
 */
const IMPORT_DATASETS: Record<string, ImportDataset> = {
  customers: customersImportDataset,
  users: usersImportDataset,
  orders: ordersImportDataset,
  products: productsImportDataset,
  trends: trendsImportDataset,
  feedback: feedbackImportDataset,
};

export function getImportDataset(slug: string): ImportDataset | null {
  return IMPORT_DATASETS[slug] ?? null;
}
