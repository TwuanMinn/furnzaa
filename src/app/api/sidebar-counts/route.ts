import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuth } from "@/lib/api/with-permission";
import { jsonOk, jsonError } from "@/lib/api/response";
import { rpcParams } from "@/lib/supabase/types";

/**
 * GET /api/sidebar-counts — returns count of active orders (respecting RLS)
 * and low-stock products (via admin client).
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const supabase = await createClient();

    // 1. Orders count. Polled by every client every 30s, so it must stay O(1):
    //    company-wide viewers get the planner-stats estimate (same source as
    //    the dashboard card); staff get an exact count of THEIR slice, which
    //    is RLS-scoped and rides idx_orders_assigned.
    let ordersCount = 0;
    if (user.permissions.has("orders.view_all")) {
      // estimated_count is service-only (0027); the orders.view_all gate above
      // is the authorization, mirroring the dashboard stat card.
      const { data, error } = await createAdminClient().rpc(
        "estimated_count",
        rpcParams("estimated_count", { p_table: "orders" }),
      );
      if (error) throw error;
      ordersCount = Number(data ?? 0);
    } else {
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      if (error) throw error;
      ordersCount = count ?? 0;
    }

    // 2. Low stock products count
    let lowStockCount = 0;
    if (user.permissions.has("products.view")) {
      const admin = createAdminClient();
      const { data: inventoryRes } = await admin
        .from("mv_inventory_value")
        .select("low_stock_products")
        .maybeSingle();
      lowStockCount = inventoryRes?.low_stock_products ?? 0;
    }

    // 3. Currently-printing jobs (Schedule badge). print_schedule holds only
    //    ACTIVE board entries (completed cards auto-archive), so this exact
    //    count is a tiny scan of idx_schedule_state.
    let printingCount = 0;
    if (user.permissions.has("schedule.view")) {
      const admin = createAdminClient();
      const { count } = await admin
        .from("print_schedule")
        .select("order_id", { count: "exact", head: true })
        .eq("state", "printing")
        .is("archived_at", null);
      printingCount = count ?? 0;
    }

    // 4. Open feedback (New + In Progress + Reopened). The open set is small
    //    by nature and rides idx_feedback_status; staff counts are RLS-scoped
    //    to records they submitted or were assigned via the session client.
    let feedbackCount = 0;
    if (user.permissions.has("feedback.create")) {
      // Branched (not a client union): the admin and session clients have
      // incompatible generic signatures, so a `cond ? admin : session` value
      // makes .from() uncallable under TS6.
      if (user.permissions.has("feedback.view_all")) {
        const { count } = await createAdminClient()
          .from("customer_feedback")
          .select("id", { count: "exact", head: true })
          .in("status", ["new", "in_progress", "reopened"])
          .is("deleted_at", null);
        feedbackCount = count ?? 0;
      } else {
        const { count } = await supabase
          .from("customer_feedback")
          .select("id", { count: "exact", head: true })
          .in("status", ["new", "in_progress", "reopened"])
          .is("deleted_at", null);
        feedbackCount = count ?? 0;
      }
    }

    // 5. Unread messages across the caller's conversations — my_conversations()
    //    is the same single RPC the messages page uses (no N+1; bounded by the
    //    user's own group memberships).
    let messagesCount = 0;
    if (user.permissions.has("messages.view")) {
      const { data } = await supabase.rpc("my_conversations");
      const rows = (data ?? []) as { unread_count: number | null }[];
      messagesCount = rows.reduce((sum, r) => sum + Number(r.unread_count ?? 0), 0);
    }

    // 6. Underperforming investments (ROI badge) — from the cached portfolio MV
    //    (global; ROI is admin-only by default), behind roi.view.
    let roiCount = 0;
    if (user.permissions.has("roi.view")) {
      const { data: roiRes } = await createAdminClient()
        .from("mv_roi_portfolio")
        .select("underperforming_count")
        .maybeSingle();
      roiCount = Number((roiRes as { underperforming_count: number } | null)?.underperforming_count ?? 0);
    }

    // 7. Payroll runs awaiting action (Draft + Calculated) — the amber badge.
    //    Admin/payroll-staff only; payroll_runs holds few rows so this exact
    //    count rides idx_payroll_runs_status. Staff (view_own) see no runs.
    let payrollCount = 0;
    if (user.permissions.has("payroll.view_all")) {
      const { count } = await createAdminClient()
        .from("payroll_runs")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "calculated"]);
      payrollCount = count ?? 0;
    }

    return jsonOk({
      orders: ordersCount ?? 0,
      lowStock: lowStockCount,
      printing: printingCount,
      feedback: feedbackCount,
      messages: messagesCount,
      roi: roiCount,
      payroll: payrollCount,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load sidebar counts", 500);
  }
});
