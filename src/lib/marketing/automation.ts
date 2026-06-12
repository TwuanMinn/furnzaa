import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbInsert, dbUpdate, rpcParams } from "@/lib/supabase/types";
import { logActivity } from "@/lib/activity/log";
import { notifyVoucherIssued, sendNotification } from "@/lib/notifications/service";
import { handleTierUpgrade } from "@/lib/crm/hooks";

/**
 * Automation rules runner (Module 6) — cron-invoked, IDEMPOTENT.
 *
 * Matching runs on indexed customer aggregates (tier, last_purchase_date,
 * birthday month/day expression index, lifetime spend), bounded per run.
 * Idempotency: automation_executions has unique (rule_id, customer_id,
 * dedupe_key); executions are INSERTED FIRST with ON CONFLICT DO NOTHING and
 * only rows that actually inserted perform the action — re-runs and
 * overlapping ticks can never double-fire. Voucher issuance adds a second
 * layer via vouchers.dedupe_key. Every run is activity-logged.
 */

const MATCH_LIMIT = 500; // customers per rule per tick

interface RuleRow {
  id: string;
  name: string;
  event_type: "tier_reached" | "inactivity" | "birthday" | "spend_threshold";
  condition: Record<string, unknown>;
  action_type: "issue_voucher" | "send_notification" | "upgrade_tier" | "send_campaign";
  action_config: Record<string, unknown>;
}

interface MatchedCustomer {
  id: string;
  name: string;
}

function today(): Date {
  return new Date();
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Find customers matching a rule + the occurrence dedupe key. */
async function matchCustomers(rule: RuleRow): Promise<{ customers: MatchedCustomer[]; dedupeKey: string }> {
  const admin = createAdminClient();
  const now = today();

  switch (rule.event_type) {
    case "tier_reached": {
      const tierKey = String(rule.condition.tier_key ?? "");
      if (!tierKey) return { customers: [], dedupeKey: "" };
      const { data: tier } = await admin.from("customer_tiers").select("id").eq("key", tierKey).maybeSingle();
      const tierId = asRow<{ id: string }>(tier)?.id;
      if (!tierId) return { customers: [], dedupeKey: "" };
      const { data } = await admin
        .from("customers")
        .select("id, name")
        .eq("current_tier_id", tierId)
        .eq("is_active", true)
        .limit(MATCH_LIMIT);
      return { customers: asRows<MatchedCustomer>(data), dedupeKey: `tier_reached:${tierKey}` };
    }
    case "inactivity": {
      const days = Number(rule.condition.days ?? 90);
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const { data } = await admin
        .from("customers")
        .select("id, name")
        .eq("is_active", true)
        .gt("order_count", 0)
        .lte("last_purchase_date", isoDate(cutoff))
        .limit(MATCH_LIMIT);
      // Monthly occurrence: an inactive customer is re-targeted at most once a month.
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      return { customers: asRows<MatchedCustomer>(data), dedupeKey: `inactivity:${days}:${month}` };
    }
    case "birthday": {
      // RPC rides the (month, day) expression index — no app-side scan at 1M rows.
      const { data, error } = await admin.rpc(
        "customers_with_birthday_today",
        rpcParams("customers_with_birthday_today", { p_limit: MATCH_LIMIT }),
      );
      if (error) {
        console.error("[automation] birthday match failed:", error.message);
        return { customers: [], dedupeKey: "" };
      }
      return { customers: asRows<MatchedCustomer>(data), dedupeKey: `birthday:${now.getFullYear()}` };
    }
    case "spend_threshold": {
      const amount = Number(rule.condition.amount_cents ?? 0);
      if (amount <= 0) return { customers: [], dedupeKey: "" };
      const { data } = await admin
        .from("customers")
        .select("id, name")
        .eq("is_active", true)
        .gte("lifetime_spend_cents", amount)
        .limit(MATCH_LIMIT);
      return { customers: asRows<MatchedCustomer>(data), dedupeKey: `spend:${amount}` };
    }
  }
}

/** Perform a rule's action for one customer (already deduped). */
async function performAction(rule: RuleRow, customer: MatchedCustomer, dedupeKey: string): Promise<Record<string, unknown>> {
  const admin = createAdminClient();

  switch (rule.action_type) {
    case "issue_voucher": {
      const cfg = rule.action_config;
      const type = (cfg.type as string) ?? "fixed";
      const validDays = Number(cfg.valid_days ?? 30);
      const endDate = isoDate(new Date(Date.now() + validDays * 24 * 60 * 60 * 1000));
      const source = rule.event_type === "birthday" ? "birthday" : "automatic";
      const code = `${rule.event_type === "birthday" ? "BDAY" : "AUTO"}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

      const { data, error } = await admin
        .from("vouchers")
        .insert(
          dbInsert("vouchers", {
            code,
            type: type as never,
            value_percent: type === "percentage" ? Number(cfg.value_percent ?? 10) : null,
            value_cents: type === "fixed" ? Number(cfg.value_cents ?? 1000) : null,
            end_date: endDate,
            usage_limit: 1,
            assigned_customer_id: customer.id,
            source,
            dedupe_key: `rule:${rule.id}:${dedupeKey}:${customer.id}`,
          }),
        )
        .select("code")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return { skipped: "voucher already issued" };
        throw new Error(error.message);
      }
      const issued = asRow<{ code: string }>(data)?.code ?? code;
      void notifyVoucherIssued({
        customerName: customer.name,
        voucherCode: issued,
        reason: rule.name,
      });
      return { voucher_code: issued };
    }
    case "send_notification": {
      // Customers have no app login — the notification is the internal signal.
      await sendNotification({
        type: "system",
        category: "manual",
        title: renderSimple(String(rule.action_config.title ?? rule.name), customer),
        body: renderSimple(String(rule.action_config.body ?? ""), customer),
        audience: { type: "role", role: "admin" },
        linkUrl: `/crm?customer=${customer.id}`,
      });
      return { notified: true };
    }
    case "upgrade_tier": {
      const { data, error } = await admin.rpc(
        "evaluate_customer_tier",
        rpcParams("evaluate_customer_tier", { p_customer_id: customer.id }),
      );
      if (error) throw new Error(error.message);
      const result = (Array.isArray(data) ? data[0] : data) as
        | { changed: boolean; previous_tier_id: string | null; new_tier_id: string | null }
        | undefined;
      if (result?.changed && result.new_tier_id) {
        await handleTierUpgrade(customer.id, result.previous_tier_id, result.new_tier_id, null);
        return { upgraded: true };
      }
      return { upgraded: false };
    }
    case "send_campaign":
      // Reserved: rules can point at a draft campaign in a future iteration.
      return { skipped: "send_campaign not configured" };
  }
}

function renderSimple(template: string, customer: MatchedCustomer): string {
  return template.replace(/\{\{\s*name\s*\}\}/gi, customer.name);
}

/** Run all enabled rules once. Returns per-rule fired counts. */
export async function runAutomationRules(): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const results: Record<string, number> = {};

  const { data: rulesRaw } = await admin
    .from("automation_rules")
    .select("id, name, event_type, condition, action_type, action_config")
    .eq("is_enabled", true)
    .is("deleted_at", null)
    .limit(50);
  const rules = asRows<RuleRow>(rulesRaw);

  for (const rule of rules) {
    try {
      const { customers, dedupeKey } = await matchCustomers(rule);
      if (!dedupeKey || customers.length === 0) {
        results[rule.name] = 0;
        await admin
          .from("automation_rules")
          .update(dbUpdate("automation_rules", { last_run_at: new Date().toISOString() }))
          .eq("id", rule.id);
        continue;
      }

      // Insert-first idempotency: only rows that actually insert fire the action.
      const { data: insertedRaw, error: insertError } = await admin
        .from("automation_executions")
        .upsert(
          dbInsert(
            "automation_executions",
            customers.map((c) => ({ rule_id: rule.id, customer_id: c.id, dedupe_key: dedupeKey })),
          ),
          { onConflict: "rule_id,customer_id,dedupe_key", ignoreDuplicates: true },
        )
        .select("id, customer_id");
      if (insertError) throw new Error(insertError.message);
      const inserted = asRows<{ id: string; customer_id: string }>(insertedRaw);

      let fired = 0;
      for (const execution of inserted) {
        const customer = customers.find((c) => c.id === execution.customer_id);
        if (!customer) continue;
        try {
          const result = await performAction(rule, customer, dedupeKey);
          await admin
            .from("automation_executions")
            .update(dbUpdate("automation_executions", { result: result as never }))
            .eq("id", execution.id);
          fired += 1;
        } catch (e) {
          console.error(`[automation] action failed for rule "${rule.name}":`, e);
          await admin
            .from("automation_executions")
            .update(
              dbUpdate("automation_executions", {
                result: { error: e instanceof Error ? e.message : "failed" } as never,
              }),
            )
            .eq("id", execution.id);
        }
      }

      results[rule.name] = fired;
      await admin
        .from("automation_rules")
        .update(dbUpdate("automation_rules", { last_run_at: new Date().toISOString() }))
        .eq("id", rule.id);

      if (fired > 0) {
        void logActivity({
          actor: null,
          action: "automation.run",
          module: "marketing",
          targetType: "automation_rule",
          targetId: rule.id,
          summary: `Automation “${rule.name}” fired for ${fired} customer(s)`,
          after: { fired, dedupe_key: dedupeKey },
        });
      }
    } catch (e) {
      console.error(`[automation] rule "${rule.name}" failed:`, e);
      results[rule.name] = -1;
    }
  }

  return results;
}
