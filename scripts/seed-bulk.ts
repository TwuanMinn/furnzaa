/* eslint-disable no-console */
/**
 * Opt-in BULK generator for scale/performance testing toward the 1M-customer,
 * multi-million-order target. NOT run by default.
 *
 *   SEED_BULK_CUSTOMERS=1000000 SEED_BULK_ORDERS=4000000 npm run seed:bulk
 *
 * Strategy for speed:
 *   • Client-generated UUIDs + order codes (no per-row RPC round-trips).
 *   • Batched inserts of 1,000 rows.
 *   • Orders carry totals directly; line items are skipped in bulk mode.
 *
 * Tip: for tens of millions of rows, prefer Postgres COPY / `supabase db` SQL
 * generators — this script is the app-level path and is intentionally simple.
 */
import { createClient } from "@supabase/supabase-js";
import { faker } from "@faker-js/faker";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("✖ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

faker.seed(7);

const N_CUSTOMERS = Number(process.env.SEED_BULK_CUSTOMERS ?? 50_000);
const N_ORDERS = Number(process.env.SEED_BULK_ORDERS ?? 200_000);
const CHUNK = 1_000;

const STATUSES = ["pending", "processing", "shipped", "delivered", "returned", "cancelled"];
const PRIORITIES = ["low", "medium", "high", "extreme"];
const PAYMENTS = ["paid", "unpaid", "refunded"];

async function insertChunked<T>(table: string, rows: T[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).insert(slice as never);
    if (error) throw new Error(`${table} insert failed @${i}: ${error.message}`);
  }
}

async function main() {
  console.time("bulk-seed");
  console.log(`→ Bulk seeding ${N_CUSTOMERS.toLocaleString()} customers, ${N_ORDERS.toLocaleString()} orders…`);

  // Existing staff/admin to assign orders to.
  const { data: users } = await supabase.from("users").select("id").limit(50);
  const userIds = (users ?? []).map((u: { id: string }) => u.id);

  // 1) Customers — keep ids to reference from orders.
  const customerIds: string[] = new Array(N_CUSTOMERS);
  let buffer: Array<Record<string, unknown>> = [];
  for (let i = 0; i < N_CUSTOMERS; i++) {
    const id = randomUUID();
    customerIds[i] = id;
    const name = faker.person.fullName();
    buffer.push({
      id,
      name,
      email: faker.internet.email({ firstName: name.split(" ")[0] }).toLowerCase(),
      phone: faker.phone.number({ style: "international" }),
    });
    if (buffer.length >= CHUNK) {
      await insertChunked("customers", buffer);
      buffer = [];
      if (i % 20_000 === 0) console.log(`   customers: ${i.toLocaleString()}`);
    }
  }
  if (buffer.length) await insertChunked("customers", buffer);
  console.log(`  ✓ ${N_CUSTOMERS.toLocaleString()} customers`);

  // 2) Orders — batched, totals inline, no items in bulk mode.
  buffer = [];
  for (let i = 0; i < N_ORDERS; i++) {
    const subtotal = faker.number.int({ min: 4900, max: 599900 });
    const buying = faker.date.past({ years: 2 });
    const status = faker.helpers.arrayElement(STATUSES);
    buffer.push({
      id: randomUUID(),
      order_code: `FZB-${(i + 1).toString().padStart(9, "0")}`,
      customer_id: customerIds[faker.number.int({ min: 0, max: N_CUSTOMERS - 1 })],
      buying_date: buying.toISOString().slice(0, 10),
      priority: faker.helpers.arrayElement(PRIORITIES),
      status,
      payment_status: faker.helpers.arrayElement(PAYMENTS),
      subtotal_cents: subtotal,
      tax_cents: 0,
      total_cents: subtotal,
      currency: "USD",
      delivery_date: status === "delivered" ? buying.toISOString().slice(0, 10) : null,
      assigned_staff_id: userIds.length ? faker.helpers.arrayElement(userIds) : null,
      created_by: userIds.length ? userIds[0] : null,
    });
    if (buffer.length >= CHUNK) {
      await insertChunked("orders", buffer);
      buffer = [];
      if (i % 50_000 === 0) console.log(`   orders: ${i.toLocaleString()}`);
    }
  }
  if (buffer.length) await insertChunked("orders", buffer);
  console.log(`  ✓ ${N_ORDERS.toLocaleString()} orders`);

  console.timeEnd("bulk-seed");
  console.log("✓ Bulk seed complete. Tip: run `npm run analytics:refresh` once analytics views exist (Phase 9).");
}

main().catch((err) => {
  console.error("✖ Bulk seed failed:", err);
  process.exit(1);
});
