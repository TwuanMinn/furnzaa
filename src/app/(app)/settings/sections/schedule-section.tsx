"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateScheduleConfigAction } from "@/lib/settings/actions";
import type { ScheduleConfigData } from "./types";

/**
 * Production Schedule configuration: how long completed/failed cards stay on
 * the board before auto-archiving, and the overdue-alert threshold the cron
 * runner applies to running prints. Read-only when canEdit is false.
 */
export function ScheduleSection({ data, canEdit }: { data: ScheduleConfigData; canEdit: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [retention, setRetention] = useState(String(data.completedRetentionHours));
  const [overduePct, setOverduePct] = useState(String(data.overdueAlertPct));

  async function save() {
    setSaving(true);
    try {
      const res = await updateScheduleConfigAction({
        completedRetentionHours: Math.round(Number(retention)) || 0,
        overdueAlertPct: Math.round(Number(overduePct)) || 0,
      });
      if (res.ok) {
        toast.success("Schedule settings saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Production schedule</CardTitle>
        <CardDescription>
          Board housekeeping and overdue alerts for running prints.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sched-retention">Completed-card retention (hours)</Label>
            <Input
              id="sched-retention"
              type="number"
              min={1}
              max={720}
              value={retention}
              disabled={!canEdit}
              onChange={(e) => setRetention(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Completed and failed cards auto-archive off the board after this long.
              The order&apos;s print history is never touched.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-overdue">Overdue alert threshold (%)</Label>
            <Input
              id="sched-overdue"
              type="number"
              min={0}
              max={500}
              value={overduePct}
              disabled={!canEdit}
              onChange={(e) => setOverduePct(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Alert the assignee when a running print exceeds its estimate by this percentage.
            </p>
          </div>
        </div>

        {canEdit ? (
          <div className="flex justify-end">
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
