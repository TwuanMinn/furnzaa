/* eslint-disable no-console */
/**
 * Seed: default Admin + a small, realistic demo dataset for EVERY module —
 * users, customers (with birthdays/regions), 3D-print product catalog,
 * inventory (via the atomic movement RPC), suppliers + a received PO,
 * BOM + a completed production order, orders with printing fields and
 * product-linked line items, CRM aggregates + tiers (via apply_order_to_crm),
 * vouchers, a segment, a campaign, an automation rule, notifications, messages.
 *
 * Run with:  npm run seed   (uses service-role key → bypasses RLS)
 * Idempotent: every section is guarded (re-running won't duplicate).
 * For large-scale performance data, see scripts/seed-bulk.ts.
 */
import { createClient } from "@supabase/supabase-js";
import { faker } from "@faker-js/faker";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("✖ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

faker.seed(42); // deterministic demo data

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@furnza.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Admin";
const STAFF_PASSWORD = "Password!23";

const STATUSES = ["pending", "processing", "shipped", "delivered", "returned", "cancelled"] as const;
const PRIORITIES = ["low", "medium", "high", "extreme"] as const;
const PAYMENTS = ["paid", "unpaid", "refunded"] as const;
const MATERIALS: Array<{ key: string; gram_cents: number; colors: string[] }> = [
  { key: "pla", gram_cents: 2, colors: ["Black", "White", "Galaxy Purple", "Sakura Pink"] },
  { key: "petg", gram_cents: 3, colors: ["Translucent", "Black", "Orange"] },
  { key: "abs", gram_cents: 3, colors: ["Black", "Gray"] },
  { key: "asa", gram_cents: 4, colors: ["White", "Black"] },
  { key: "tpu", gram_cents: 5, colors: ["Black", "Red"] },
  { key: "cf_blend", gram_cents: 10, colors: ["Carbon Black"] },
];
const REGIONS = ["North", "South", "East", "West", "Central"];

/**
 * Catalog: [name, category, cost, sell, initialStock, minStock].
 * Company currency is VND; money columns store đồng × 100
 * (e.g. 35000000 = 350.000₫).
 */
const CATALOG: Array<[string, string, number, number, number, number]> = [
  ["Articulated Dragon (Large)", "Printed Decor", 6000000, 35000000, 40, 10],
  ["Hex Desk Organizer", "Functional Parts", 3500000, 20000000, 60, 15],
  ["Phone Stand — Adjustable", "Functional Parts", 2000000, 13000000, 80, 20],
  ["Topographic Map Wall Art", "Printed Decor", 9000000, 60000000, 25, 8],
  ["Cable Management Clips (10-pack)", "Functional Parts", 1200000, 9000000, 150, 30],
  ["Custom Cookie Cutter Set", "Custom Orders", 1800000, 15000000, 50, 10],
  ["Drone Frame Kit", "Engineering", 15000000, 90000000, 15, 5],
  ["Planetary Gear Fidget", "Printed Decor", 2500000, 16000000, 70, 15],
  ["PLA Filament 1kg Spool", "Raw Filament", 28000000, 35000000, 100, 25],
  ["PETG Filament 1kg Spool", "Raw Filament", 32000000, 42000000, 80, 20],
  ["Desk Organizer Gift Kit", "Custom Orders", 0, 50000000, 0, 5], // produced via BOM
];

async function roleId(key: string): Promise<string> {
  const { data, error } = await supabase.from("roles").select("id").eq("key", key).single();
  if (error || !data) {
    throw new Error(`Role '${key}' not found. Did migrations run? (supabase db reset)  ${error?.message ?? ""}`);
  }
  return data.id as string;
}

async function findUserByEmail(email: string) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 1000 || page >= 10) return null;
    page += 1;
  }
}

async function ensureAuthUser(opts: {
  email: string; password: string; fullName: string; roleKey: string;
  department?: string; phone?: string;
}): Promise<string> {
  const existing = await findUserByEmail(opts.email);
  if (existing) return existing.id;
  const { data, error } = await supabase.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
    app_metadata: { role: opts.roleKey },
    user_metadata: {
      full_name: opts.fullName,
      role: opts.roleKey,
      department: opts.department,
      phone: opts.phone,
    },
  });
  if (error) throw error;
  return data.user!.id;
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data as T;
}

async function main() {
  console.log("→ Seeding Furnza…");

  const adminRoleId = await roleId("admin");
  const staffRoleId = await roleId("staff");

  // 1) Default Admin -----------------------------------------------------------
  const adminId = await ensureAuthUser({
    email: ADMIN_EMAIL, password: ADMIN_PASSWORD, fullName: ADMIN_NAME,
    roleKey: "admin", department: "Operations",
  });
  await supabase.from("users").update({ role_id: adminRoleId, full_name: ADMIN_NAME, department: "Operations" }).eq("id", adminId);
  console.log(`  ✓ Admin ready: ${ADMIN_EMAIL}`);

  // 2) Demo staff --------------------------------------------------------------
  const staffSpecs = [
    { email: "sara.lee@furnza.local", name: "Sara Lee", dept: "Fulfilment", phone: "+1-202-555-0151" },
    { email: "sam.ortiz@furnza.local", name: "Sam Ortiz", dept: "Fulfilment", phone: "+1-202-555-0162" },
    { email: "sofia.khan@furnza.local", name: "Sofia Khan", dept: "Support", phone: "+1-202-555-0173" },
  ];
  const staffIds: string[] = [];
  for (const s of staffSpecs) {
    const id = await ensureAuthUser({
      email: s.email, password: STAFF_PASSWORD, fullName: s.name, roleKey: "staff",
      department: s.dept, phone: s.phone,
    });
    await supabase.from("users").update({ role_id: staffRoleId, full_name: s.name, department: s.dept, phone: s.phone }).eq("id", id);
    staffIds.push(id);
  }
  console.log(`  ✓ ${staffIds.length} demo staff ready (password: ${STAFF_PASSWORD})`);

  // 3) Products & inventory (own guard) ----------------------------------------
  type SeedProduct = { id: string; name: string; selling: number; cost: number };
  let products: SeedProduct[] = [];
  const { count: productCount } = await supabase
    .from("products").select("*", { count: "estimated", head: true });

  if ((productCount ?? 0) > 0) {
    const { data } = await supabase
      .from("products").select("id, name, selling_price_cents, cost_price_cents").limit(50);
    products = (data ?? []).map((p: any) => ({
      id: p.id, name: p.name, selling: p.selling_price_cents, cost: p.cost_price_cents,
    }));
    console.log("  • Products already present — skipping catalog/inventory demo.");
  } else {
    // Categories
    const categoryNames = [...new Set(CATALOG.map(([, c]) => c))];
    const { data: cats, error: catErr } = await supabase
      .from("product_categories")
      .insert(categoryNames.map((name) => ({ name })))
      .select("id, name");
    if (catErr) throw catErr;
    const catId = new Map(cats!.map((c: any) => [c.name, c.id]));

    // Products (sku via the document-number RPC, honoring the settings prefix)
    for (const [name, cat, cost, sell, stock, minStock] of CATALOG) {
      const sku = await rpc<string>("next_document_number", { p_prefix: "SKU" });
      const { data: prod, error: prodErr } = await supabase
        .from("products")
        .insert({
          sku, name, category_id: catId.get(cat),
          barcode: faker.string.numeric(13),
          description: faker.commerce.productDescription(),
          cost_price_cents: cost, selling_price_cents: sell,
          minimum_stock: minStock, created_by: adminId, updated_by: adminId,
        })
        .select("id")
        .single();
      if (prodErr) throw prodErr;
      products.push({ id: prod!.id, name, selling: sell, cost });

      // Initial stock through the atomic ledger RPC (never direct writes).
      if (stock > 0) {
        await rpc("apply_inventory_movement", {
          p_product_id: prod!.id, p_movement_type: "purchase", p_quantity: stock,
          p_notes: "Opening stock",
        });
      }
    }
    console.log(`  ✓ ${products.length} products in ${cats!.length} categories (+opening stock)`);

    // Suppliers + a received purchase order (exercises receive→stock RPC)
    const { data: suppliers, error: supErr } = await supabase
      .from("suppliers")
      .insert([
        { company_name: "PolyFil Supplies Co.", contact_name: "Dana Reyes", email: "sales@polyfil.example", phone: "+1-415-555-0199" },
        { company_name: "MakerParts Direct", contact_name: "Lee Chen", email: "orders@makerparts.example", phone: "+1-415-555-0142" },
      ])
      .select("id");
    if (supErr) throw supErr;

    const poNumber = await rpc<string>("next_document_number", { p_prefix: "PO" });
    const spoolPla = products.find((p) => p.name.startsWith("PLA Filament"))!;
    const spoolPetg = products.find((p) => p.name.startsWith("PETG Filament"))!;
    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        po_number: poNumber, supplier_id: suppliers![0]!.id, status: "ordered",
        total_cost_cents: 20 * 28000000 + 10 * 32000000, created_by: adminId,
      })
      .select("id")
      .single();
    if (poErr) throw poErr;
    await supabase.from("purchase_order_items").insert([
      { purchase_order_id: po!.id, product_id: spoolPla.id, quantity: 20, unit_cost_cents: 28000000, line_total_cents: 560000000, sort_order: 0 },
      { purchase_order_id: po!.id, product_id: spoolPetg.id, quantity: 10, unit_cost_cents: 32000000, line_total_cents: 320000000, sort_order: 1 },
    ]);
    await rpc("receive_purchase_order", { p_po_id: po!.id });
    console.log(`  ✓ 2 suppliers, PO ${poNumber} received (+30 spools via purchase movements)`);

    // BOM + completed production order (consume components → finished goods)
    const kit = products.find((p) => p.name === "Desk Organizer Gift Kit")!;
    const organizer = products.find((p) => p.name === "Hex Desk Organizer")!;
    const clips = products.find((p) => p.name.startsWith("Cable Management"))!;
    await supabase.from("bill_of_materials").insert([
      { finished_product_id: kit.id, component_product_id: organizer.id, quantity_per_unit: 1 },
      { finished_product_id: kit.id, component_product_id: clips.id, quantity_per_unit: 2 },
    ]);
    const prodCode = await rpc<string>("next_document_number", { p_prefix: "PRD" });
    const { data: prodOrder, error: prodOrdErr } = await supabase
      .from("production_orders")
      .insert({
        code: prodCode, product_id: kit.id, quantity: 10, status: "in_progress",
        labor_cost_cents: 5000000, packaging_cost_cents: 2000000, overhead_cost_cents: 1000000,
        created_by: adminId, started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (prodOrdErr) throw prodOrdErr;
    await rpc("complete_production_order", { p_id: prodOrder!.id });
    console.log(`  ✓ BOM + production order ${prodCode} completed (10 kits produced)`);
  }

  // Guard: only seed customer/order/CRM/marketing demo once.
  const { count: customerCount } = await supabase
    .from("customers")
    .select("*", { count: "estimated", head: true });
  if ((customerCount ?? 0) > 0) {
    console.log("  • Demo customers already present — skipping order/CRM/marketing demo.");
    console.log("✓ Seed complete.");
    return;
  }

  // 4) Customers (with birthday + region for CRM/automation) -------------------
  const customerRows = Array.from({ length: 12 }).map(() => {
    const name = faker.person.fullName();
    return {
      name,
      email: faker.internet.email({ firstName: name.split(" ")[0] }).toLowerCase(),
      phone: faker.phone.number({ style: "international" }),
      birthday: faker.date.birthdate({ min: 20, max: 65, mode: "age" }).toISOString().slice(0, 10),
      region: faker.helpers.arrayElement(REGIONS),
      notes: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }) ?? null,
    };
  });
  const { data: customers, error: custErr } = await supabase
    .from("customers").insert(customerRows).select("id, name, email, phone");
  if (custErr) throw custErr;
  console.log(`  ✓ ${customers!.length} customers`);

  // 5) Orders: printing fields + product line items + status history -----------
  // Printers come from the catalog seeded by migration 0015.
  const { data: printerRows } = await supabase.from("printers").select("id").eq("is_active", true);
  const printerIds = (printerRows ?? []).map((p: { id: string }) => p.id);
  // A couple of "whale" orders push customers into higher loyalty tiers.
  const ordersToMake = 26;
  let deliveredCount = 0;
  const deliveredOrders: string[] = [];
  for (let i = 0; i < ordersToMake; i++) {
    const customer = faker.helpers.arrayElement(customers!);
    const assigned = faker.helpers.arrayElement(staffIds);
    const status = faker.helpers.weightedArrayElement([
      { weight: 5, value: "delivered" },
      { weight: 3, value: "shipped" },
      { weight: 3, value: "processing" },
      { weight: 2, value: "pending" },
      { weight: 1, value: "returned" },
      { weight: 1, value: "cancelled" },
    ]) as (typeof STATUSES)[number];
    const priority = faker.helpers.arrayElement(PRIORITIES);
    const payment = status === "delivered" ? "paid" : faker.helpers.arrayElement(PAYMENTS);
    const buyingDate = faker.date.recent({ days: 150 });
    const isWhale = i < 2; // two large orders → tier variety

    // Line items: mostly product-linked (snapshot name/price), some free-text.
    const itemCount = faker.number.int({ min: 1, max: 3 });
    const items = Array.from({ length: itemCount }).map((_, idx) => {
      const useProduct = products.length > 0 && faker.datatype.boolean({ probability: 0.8 });
      const qty = isWhale ? faker.number.int({ min: 20, max: 60 }) : faker.number.int({ min: 1, max: 4 });
      if (useProduct) {
        const p = faker.helpers.arrayElement(products);
        return {
          product_id: p.id, name: p.name, quantity: qty,
          unit_price_cents: p.selling, line_total_cents: qty * p.selling, sort_order: idx,
        };
      }
      const unit = faker.number.int({ min: 50000, max: 2000000 }) * 100; // 50.000–2.000.000₫, stored ×100
      return {
        product_id: null as string | null,
        name: `Custom print — ${faker.commerce.productName()}`,
        quantity: qty, unit_price_cents: unit, line_total_cents: qty * unit, sort_order: idx,
      };
    });
    const subtotal = items.reduce((s, it) => s + it.line_total_cents, 0);

    const orderCode = await rpc<string>("next_order_code", { p_prefix: "FZ" });
    const deliveryDate =
      status === "delivered" ? faker.date.between({ from: buyingDate, to: new Date() }) : null;

    // 3D printing job fields
    const material = faker.helpers.arrayElement(MATERIALS);
    const grams = faker.number.int({ min: 40, max: 900 });
    const estMinutes = faker.number.int({ min: 45, max: 1800 });

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        order_code: orderCode,
        customer_id: customer.id,
        buying_date: buyingDate.toISOString().slice(0, 10),
        priority,
        status,
        phone: customer.phone,
        email: customer.email,
        shipping_address: faker.location.streetAddress({ useFullAddress: true }),
        delivery_date: deliveryDate ? deliveryDate.toISOString().slice(0, 10) : null,
        payment_method: faker.helpers.arrayElement(["Visa", "Mastercard", "PayPal", "Bank Transfer"]),
        payment_status: payment,
        notes: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.4 }) ?? null,
        subtotal_cents: subtotal,
        tax_cents: 0,
        total_cents: subtotal,
        currency: "VND",
        assigned_staff_id: assigned,
        created_by: adminId,
        updated_by: adminId,
        // printing fields
        printer_id: printerIds.length ? faker.helpers.arrayElement(printerIds) : null,
        material_type: material.key,
        material_color: faker.helpers.arrayElement(material.colors),
        filament_used_grams: grams,
        material_cost_cents: grams * material.gram_cents,
        estimated_print_minutes: estMinutes,
        actual_print_minutes: ["delivered", "shipped", "returned"].includes(status)
          ? Math.round(estMinutes * faker.number.float({ min: 0.85, max: 1.3 }))
          : null,
        nozzle_size_mm: faker.helpers.arrayElement([0.2, 0.4, 0.6]),
        layer_height_mm: faker.helpers.arrayElement([0.08, 0.12, 0.16, 0.2, 0.28]),
        infill_percent: faker.helpers.arrayElement([10, 15, 20, 40, 100]),
        post_processing: faker.helpers.maybe(
          () => faker.helpers.arrayElement(["Support removal", "Sanding + priming", "Painting", "Assembly + QC"]),
          { probability: 0.5 },
        ) ?? null,
      })
      .select("id")
      .single();
    if (orderErr) throw orderErr;

    await supabase.from("order_items").insert(items.map((it) => ({ ...it, order_id: order!.id })));

    // status history: progression up to current status
    const progression = ["pending", "processing", "shipped", "delivered"];
    const endIdx = progression.indexOf(status);
    const history: Array<Record<string, unknown>> = [];
    let prev: string | null = null;
    const chain = endIdx >= 0 ? progression.slice(0, endIdx + 1) : ["pending", status];
    for (const st of chain) {
      history.push({
        order_id: order!.id,
        from_status: prev,
        to_status: st,
        comment: prev === null ? "Order created" : null,
        changed_by: assigned,
      });
      prev = st;
    }
    await supabase.from("order_status_history").insert(history);

    // Inventory hook: shipped/delivered → sale movements; returned → restore.
    if (["shipped", "delivered", "returned"].includes(status)) {
      await rpc("apply_order_stock_movements", { p_order_id: order!.id, p_direction: "sale" });
      if (status === "returned") {
        await rpc("apply_order_stock_movements", { p_order_id: order!.id, p_direction: "return" });
      }
    }

    // CRM hook: delivered + paid → incremental aggregates + tier evaluation.
    if (status === "delivered" && payment === "paid") {
      await rpc("apply_order_to_crm", { p_order_id: order!.id });
      deliveredOrders.push(order!.id);
      deliveredCount += 1;
    }
  }
  const { data: tierDist } = await supabase
    .from("customers")
    .select("current_tier_id, customer_tiers(name)")
    .not("current_tier_id", "is", null);
  const tierNames = new Set((tierDist ?? []).map((r: any) => r.customer_tiers?.name).filter(Boolean));
  console.log(`  ✓ ${ordersToMake} orders (${deliveredCount} delivered → CRM aggregates; tiers now: ${[...tierNames].join(", ") || "Bronze"})`);

  // 6) Vouchers + segment + campaign + automation rule --------------------------
  await supabase.from("vouchers").insert([
    {
      code: "WELCOME10", type: "percentage", value_percent: 10,
      end_date: faker.date.soon({ days: 90 }).toISOString().slice(0, 10),
      usage_limit: 100, source: "promotional", created_by: adminId,
    },
    {
      code: "FZ-VIP-50K", type: "fixed", value_cents: 5000000, // 50.000₫ off
      assigned_customer_id: customers![0]!.id,
      end_date: faker.date.soon({ days: 60 }).toISOString().slice(0, 10),
      usage_limit: 1, source: "manual", created_by: adminId,
    },
    {
      code: "FREESHIP-SPRING", type: "free_shipping",
      end_date: faker.date.soon({ days: 30 }).toISOString().slice(0, 10),
      usage_limit: 50, source: "promotional", created_by: adminId,
    },
  ]);

  const { data: segment } = await supabase
    .from("customer_segments")
    .insert({
      name: "Repeat buyers",
      description: "Customers with 2+ delivered orders",
      filter: { order_count_min: 2 },
      created_by: adminId,
    })
    .select("id")
    .single();

  const { data: campaign } = await supabase
    .from("marketing_campaigns")
    .insert({
      name: "Spring print sale",
      audience_type: "segment",
      audience_value: { segment_id: segment!.id },
      channel: "in_app",
      subject: "Spring sale — 10% off",
      template: "Hi {{name}}, as a {{tier}} member enjoy 10% off with code WELCOME10 this week!",
      status: "draft",
      created_by: adminId,
    })
    .select("id")
    .single();

  await supabase.from("automation_rules").insert([
    {
      name: "Birthday voucher",
      event_type: "birthday",
      condition: {},
      action_type: "issue_voucher",
      action_config: { type: "fixed", value_cents: 1000, valid_days: 30 },
      is_enabled: true,
      created_by: adminId,
    },
    {
      name: "90-day reactivation coupon",
      event_type: "inactivity",
      condition: { days: 90 },
      action_type: "issue_voucher",
      action_config: { type: "percentage", value_percent: 15, valid_days: 30 },
      is_enabled: true,
      created_by: adminId,
    },
  ]);
  console.log(`  ✓ 3 vouchers, 1 segment, draft campaign${campaign ? "" : " (skipped)"}, 2 automation rules`);

  // 7) Notifications -------------------------------------------------------------
  const allUserIds = [adminId, ...staffIds];
  const { data: welcome } = await supabase
    .from("notifications")
    .insert({
      type: "manual",
      category: "manual",
      title: "Welcome to Furnza",
      body: "Your Delivered Orders & Customer Management workspace is ready.",
      audience_type: "all",
      sender_id: adminId,
      link_url: "/dashboard",
    })
    .select("id")
    .single();
  if (welcome) {
    await supabase.from("notification_reads").insert(
      allUserIds.map((uid) => ({ notification_id: welcome.id, user_id: uid, read_at: null })),
    );
  }
  console.log("  ✓ notifications");

  // 8) Message group --------------------------------------------------------------
  const { data: group } = await supabase
    .from("message_groups")
    .insert({ name: "Fulfilment Team", type: "group", created_by: adminId })
    .select("id")
    .single();
  if (group) {
    await supabase.from("group_members").insert(
      allUserIds.map((uid, i) => ({
        group_id: group.id, user_id: uid, role: i === 0 ? "owner" : "member",
      })),
    );
    await supabase.from("messages").insert([
      { group_id: group.id, sender_id: adminId, body: "Morning team — let's clear today's print queue." },
      { group_id: group.id, sender_id: staffIds[0], body: "On it. Three X1C jobs finishing before noon." },
      { group_id: group.id, sender_id: staffIds[1], body: "PETG restock arrived — receiving the PO now." },
    ]);
  }
  console.log("  ✓ message group");

  // 9) Activity log ---------------------------------------------------------------
  await supabase.from("activity_logs").insert([
    {
      actor_id: adminId, actor_email: ADMIN_EMAIL, action: "seed.run", module: "settings",
      summary: "Seeded demo catalog, inventory, customers, orders, CRM, vouchers, campaign and messages.",
    },
  ]);

  console.log("✓ Seed complete.");
  console.log(`\n  Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Staff logins: ${staffSpecs.map((s) => s.email).join(", ")} / ${STAFF_PASSWORD}\n`);
}

main().catch((err) => {
  console.error("✖ Seed failed:", err);
  process.exit(1);
});
