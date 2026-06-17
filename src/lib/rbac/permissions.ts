/**
 * THE permission matrix — single source of truth for RBAC.
 *
 * Roles: Admin (full access) and Staff (scoped). Granular permissions are
 * grouped by module. Enforcement happens in THREE places, all derived from
 * this matrix:
 *   1. Server-side guards in API/route handlers/server actions (lib/rbac/guards).
 *   2. Postgres RLS policies (a `permissions`/`role_permissions` mirror of this
 *      matrix is seeded into the DB; RLS reads the caller's role from a JWT claim).
 *   3. Frontend conditional rendering (lib/rbac client helpers).
 *
 * Scoping ("own vs all") is modelled as separate permissions, e.g.
 * `orders.view` (own/assigned) vs `orders.view_all` (everything). The data layer
 * narrows queries when the caller lacks the `*_all` / `*_team` variant.
 */

export type PermissionModule =
  | "dashboard"
  | "users"
  | "tasks"
  | "orders"
  | "schedule"
  | "customers"
  | "products"
  | "trends"
  | "inventory"
  | "profit"
  | "crm"
  | "feedback"
  | "marketing"
  | "notifications"
  | "messages"
  | "logs"
  | "analytics"
  | "roi"
  | "settings";

export interface PermissionDef {
  key: string;
  description: string;
  module: PermissionModule;
}

export const PERMISSIONS = [
  { key: "dashboard.view", module: "dashboard", description: "View the dashboard" },

  { key: "users.view", module: "users", description: "View users list and details" },
  { key: "users.create", module: "users", description: "Create users / send invites" },
  { key: "users.edit", module: "users", description: "Edit user details" },
  { key: "users.deactivate", module: "users", description: "Deactivate (soft-delete) users" },
  { key: "users.delete", module: "users", description: "Permanently delete users" },
  { key: "users.import", module: "users", description: "Import users from CSV" },
  { key: "users.export", module: "users", description: "Export users (CSV/PDF)" },

  { key: "tasks.view", module: "tasks", description: "View staff tasks (own; complete own)" },
  { key: "tasks.view_all", module: "tasks", description: "View every staff member's tasks" },
  { key: "tasks.manage", module: "tasks", description: "Assign, edit and delete staff tasks" },

  { key: "orders.view", module: "orders", description: "View orders (own/assigned)" },
  { key: "orders.view_all", module: "orders", description: "View all orders company-wide" },
  { key: "orders.create", module: "orders", description: "Create orders" },
  { key: "orders.edit", module: "orders", description: "Edit orders" },
  { key: "orders.delete", module: "orders", description: "Delete (soft) orders" },
  { key: "orders.update_status", module: "orders", description: "Change order status" },
  { key: "orders.assign", module: "orders", description: "Assign orders to staff" },
  { key: "orders.import", module: "orders", description: "Import orders from CSV" },
  { key: "orders.export", module: "orders", description: "Export orders (CSV/PDF)" },

  { key: "schedule.view", module: "schedule", description: "View the production schedule board" },
  { key: "schedule.manage", module: "schedule", description: "Manage every job on the production schedule" },

  { key: "customers.view", module: "customers", description: "View customers & order history" },
  { key: "customers.edit", module: "customers", description: "Create/edit customer records" },

  { key: "products.view", module: "products", description: "View products and categories" },
  { key: "products.create", module: "products", description: "Create products/categories/variants" },
  { key: "products.edit", module: "products", description: "Edit products/categories/variants" },
  { key: "products.delete", module: "products", description: "Delete (soft) products" },
  { key: "products.import", module: "products", description: "Import products from CSV" },
  { key: "products.export", module: "products", description: "Export products (CSV/PDF)" },

  { key: "trends.create", module: "trends", description: "Add trending-product entries and upvote them" },
  { key: "trends.manage", module: "trends", description: "Edit/approve/archive trending-product entries" },
  { key: "trends.promote", module: "trends", description: "Promote a trending entry to a real product" },

  { key: "inventory.view", module: "inventory", description: "View stock levels & movement history" },
  { key: "inventory.adjust", module: "inventory", description: "Record inventory movements/adjustments" },
  { key: "suppliers.view", module: "inventory", description: "View suppliers" },
  { key: "suppliers.manage", module: "inventory", description: "Create/edit suppliers" },
  { key: "purchase_orders.view", module: "inventory", description: "View purchase orders" },
  { key: "purchase_orders.create", module: "inventory", description: "Create purchase orders" },
  { key: "purchase_orders.receive", module: "inventory", description: "Receive purchase orders (stock in)" },
  { key: "production.view", module: "inventory", description: "View production orders & BOM" },
  { key: "production.manage", module: "inventory", description: "Create/complete production orders, edit BOM" },

  { key: "profit.view", module: "profit", description: "View profit & cost analysis" },
  { key: "profit.export", module: "profit", description: "Export profit & cost analysis" },

  { key: "roi.view", module: "roi", description: "View ROI & investment recovery" },
  { key: "roi.create", module: "roi", description: "Create investments and add ledger entries" },
  { key: "roi.edit", module: "roi", description: "Edit investments and ledger entries" },
  { key: "roi.delete", module: "roi", description: "Delete investments and ledger entries" },
  { key: "roi.manage", module: "roi", description: "Manage ROI categories, projects and config" },

  { key: "crm.view", module: "crm", description: "View customer segments, tiers & rank history" },
  { key: "crm.manage_tiers", module: "crm", description: "Configure tiers, benefits & manual overrides" },
  { key: "vouchers.view", module: "crm", description: "View vouchers & redemptions" },
  { key: "vouchers.create", module: "crm", description: "Create/issue vouchers" },

  { key: "feedback.create", module: "feedback", description: "Submit customer feedback records" },
  { key: "feedback.assign", module: "feedback", description: "Assign feedback records to reviewers" },
  { key: "feedback.resolve", module: "feedback", description: "Resolve/reopen feedback records" },
  { key: "feedback.view_all", module: "feedback", description: "View every feedback record" },
  { key: "feedback.analytics_view", module: "feedback", description: "View feedback analytics" },

  { key: "campaigns.view", module: "marketing", description: "View campaigns & marketing analytics" },
  { key: "campaigns.create", module: "marketing", description: "Create/edit campaigns" },
  { key: "campaigns.send", module: "marketing", description: "Schedule/send campaigns" },
  { key: "automation.view", module: "marketing", description: "View automation rules & runs" },
  { key: "automation.manage", module: "marketing", description: "Create/edit automation rules" },

  { key: "notifications.view", module: "notifications", description: "View notifications" },
  { key: "notifications.create", module: "notifications", description: "Compose & send notifications" },

  { key: "messages.view", module: "messages", description: "View messages & conversations" },
  { key: "messages.send", module: "messages", description: "Send messages" },
  { key: "messages.create_group", module: "messages", description: "Create message groups" },
  { key: "messages.manage_group", module: "messages", description: "Manage group members/settings" },
  { key: "messages.delete_any", module: "messages", description: "Delete any user's messages" },

  { key: "logs.view", module: "logs", description: "View own activity log entries" },
  { key: "logs.view_all", module: "logs", description: "View all activity logs" },
  { key: "logs.export", module: "logs", description: "Export activity logs" },
  { key: "logs.purge", module: "logs", description: "Purge old activity logs" },

  { key: "analytics.view", module: "analytics", description: "View own analytics" },
  { key: "analytics.view_team", module: "analytics", description: "View company-wide analytics" },
  { key: "analytics.export", module: "analytics", description: "Export analytics" },

  { key: "settings.view", module: "settings", description: "View organization settings" },
  { key: "settings.edit_company", module: "settings", description: "Edit company/branding settings" },
  { key: "settings.edit_roles", module: "settings", description: "Edit roles & permission matrix" },
  { key: "settings.edit_order_config", module: "settings", description: "Edit order configuration" },
  { key: "settings.edit_trending", module: "settings", description: "Edit trending configuration" },
  { key: "settings.edit_feedback", module: "settings", description: "Edit feedback configuration" },
  { key: "settings.edit_messaging", module: "settings", description: "Edit messaging configuration" },
  { key: "settings.edit_inventory", module: "settings", description: "Edit inventory configuration" },
  { key: "settings.edit_loyalty", module: "settings", description: "Edit loyalty configuration" },
  { key: "settings.edit_marketing", module: "settings", description: "Edit marketing configuration" },
  { key: "settings.edit_data", module: "settings", description: "Manage data import/export/retention" },
  { key: "settings.edit_security", module: "settings", description: "Edit security settings" },
  { key: "settings.edit_roi", module: "settings", description: "Edit ROI / investment configuration" },
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as PermissionKey[];

export interface RoleDef {
  key: string;
  name: string;
  description: string;
  rank: number;
}

export const ROLES = [
  {
    key: "admin",
    name: "Admin",
    rank: 100,
    description:
      "Full access: user management, full order CRUD, message groups, all logs, analytics, notifications and settings.",
  },
  {
    key: "staff",
    name: "Staff",
    rank: 40,
    description:
      "Create/update/view their own orders and statuses, participate in assigned message groups, receive notifications, and view their own activity and analytics.",
  },
] as const satisfies readonly RoleDef[];

export type RoleKey = (typeof ROLES)[number]["key"];

/**
 * Staff: scoped to their own operational work — orders, recording stock
 * movements, creating/receiving POs, plus read-only CRM & marketing data.
 * Everything else (user mgmt, product CRUD, profit, tier/voucher/campaign/
 * automation configuration, settings) is Admin-only.
 * MUST mirror the role_permissions seeds across supabase/migrations (base in
 * 0003/0011, plus per-feature migrations — e.g. 0032 grants staff tasks.view).
 */
const STAFF_PERMS: PermissionKey[] = [
  "dashboard.view",
  "tasks.view",
  "orders.view",
  "orders.create",
  "orders.edit",
  "orders.update_status",
  "orders.export",
  "schedule.view",
  "customers.view",
  "customers.edit",
  "products.view",
  "trends.create",
  "inventory.view",
  "inventory.adjust",
  "suppliers.view",
  "purchase_orders.view",
  "purchase_orders.create",
  "purchase_orders.receive",
  "production.view",
  "crm.view",
  "vouchers.view",
  "feedback.create",
  "feedback.resolve",
  "campaigns.view",
  "automation.view",
  "notifications.view",
  "messages.view",
  "messages.send",
  "logs.view",
  "analytics.view",
];

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[] | "*"> = {
  admin: "*",
  staff: STAFF_PERMS,
};

/** Resolve the concrete default permission keys for a role. */
export function permissionsForRole(roleKey: RoleKey): PermissionKey[] {
  const v = ROLE_PERMISSIONS[roleKey];
  return v === "*" ? [...ALL_PERMISSION_KEYS] : [...v];
}

/** True if `roleKey` is a known built-in role. */
export function isRoleKey(roleKey: string): roleKey is RoleKey {
  return ROLES.some((r) => r.key === roleKey);
}
