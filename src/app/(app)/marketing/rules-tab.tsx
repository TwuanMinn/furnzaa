"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cake, Clock, Crown, DollarSign, Zap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/lib/rbac/context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { toggleAutomationRuleAction } from "@/lib/marketing/actions";
import type { AutomationRuleRow } from "@/lib/datasets/marketing";

const EVENT_META: Record<
  AutomationRuleRow["event_type"],
  { icon: typeof Zap; label: (condition: Record<string, unknown>) => string }
> = {
  tier_reached: {
    icon: Crown,
    label: (c) => `IF customer reaches ${String(c.tier_key ?? "?").replace(/_/g, " ")}`,
  },
  inactivity: {
    icon: Clock,
    label: (c) => `IF customer inactive for ${Number(c.days ?? 90)} days`,
  },
  birthday: { icon: Cake, label: () => "IF it's the customer's birthday" },
  spend_threshold: {
    icon: DollarSign,
    label: (c) => `IF lifetime spend reaches ${formatMoney(Number(c.amount_cents ?? 0))}`,
  },
};

function actionLabel(rule: AutomationRuleRow): string {
  switch (rule.action_type) {
    case "issue_voucher": {
      const cfg = rule.action_config;
      const value =
        cfg.type === "percentage"
          ? `${Number(cfg.value_percent ?? 0)}% off`
          : formatMoney(Number(cfg.value_cents ?? 0));
      return `THEN issue a ${value} voucher (valid ${Number(cfg.valid_days ?? 30)} days)`;
    }
    case "send_notification":
      return "THEN send a notification";
    case "upgrade_tier":
      return "THEN re-evaluate & upgrade the tier";
    case "send_campaign":
      return "THEN send a campaign";
  }
}

/**
 * Automation rules on the shared cron runner. Each rule fires at most once
 * per customer per occurrence (execution dedupe keys), so re-runs are safe.
 */
export function RulesTab({ rules }: { rules: AutomationRuleRow[] }) {
  const router = useRouter();
  const { has } = usePermissions();
  const canManage = has("automation.manage");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function toggle(rule: AutomationRuleRow, enabled: boolean) {
    setTogglingId(rule.id);
    try {
      const result = await toggleAutomationRuleAction(rule.id, enabled);
      if (result.ok) {
        toast.success(`“${rule.name}” ${enabled ? "enabled" : "disabled"}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Rules run on every cron tick and are idempotent — each customer is matched at most once
        per occurrence (per tier reached, per birthday year, per inactivity month). Every fired
        run lands in the activity log.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {rules.map((rule) => {
          const meta = EVENT_META[rule.event_type];
          const Icon = meta.icon;
          return (
            <Card key={rule.id} className={rule.is_enabled ? "" : "opacity-70"}>
              <CardContent className="pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{rule.name}</p>
                      <p className="text-sm text-muted-foreground">{meta.label(rule.condition)}</p>
                      <p className="text-sm text-muted-foreground">{actionLabel(rule)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {rule.last_run_at ? `Last run ${formatDateTime(rule.last_run_at)}` : "Never run"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {canManage ? (
                      <>
                        <Switch
                          id={`rule-${rule.id}`}
                          checked={rule.is_enabled}
                          disabled={togglingId === rule.id}
                          onCheckedChange={(checked) => void toggle(rule, checked)}
                          aria-label={`Toggle ${rule.name}`}
                        />
                        <Label htmlFor={`rule-${rule.id}`} className="text-xs font-normal text-muted-foreground">
                          {rule.is_enabled ? "Enabled" : "Disabled"}
                        </Label>
                      </>
                    ) : (
                      <Badge variant={rule.is_enabled ? "secondary" : "outline"}>
                        {rule.is_enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
