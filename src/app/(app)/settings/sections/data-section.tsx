"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateDataConfigAction } from "@/lib/settings/actions";
import { purgeActivityLogsAction } from "@/lib/activity/actions";
import type { DataMgmtData } from "./types";

/**
 * Settings → Data management: activity-log retention policy, the manual
 * purge trigger (logs.purge holders only), and a pointer card explaining
 * where import/export actually lives.
 */
export function DataSection({ data, canEdit }: { data: DataMgmtData; canEdit: boolean }) {
  const router = useRouter();

  const [retentionDays, setRetentionDays] = useState(String(data.logRetentionDays));
  const [archive, setArchive] = useState(data.logPurgeArchive);
  const [saving, setSaving] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  // The purge button mirrors the retention input live; fall back to the
  // persisted value while the field holds something unusable.
  const parsedDays = Math.floor(Number(retentionDays));
  const daysValid = Number.isInteger(parsedDays) && parsedDays >= 7 && parsedDays <= 3650;
  const purgeDays = daysValid ? parsedDays : data.logRetentionDays;

  async function handleSave() {
    if (!daysValid) {
      toast.error("Retention must be between 7 and 3650 days");
      return;
    }
    setSaving(true);
    try {
      const res = await updateDataConfigAction({
        logRetentionDays: parsedDays,
        logPurgeArchive: archive,
      });
      if (res.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePurge() {
    setPurging(true);
    try {
      const res = await purgeActivityLogsAction(purgeDays);
      if (res.ok) {
        toast.success(`Purged ${res.deleted.toLocaleString()} entries`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity log retention</CardTitle>
          <CardDescription>
            How long activity log entries are kept before automatic cleanup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="log-retention-days">Retention (days)</Label>
              <Input
                id="log-retention-days"
                type="number"
                min={7}
                max={3650}
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                disabled={!canEdit || saving}
              />
              <p className="text-xs text-muted-foreground">
                The scheduled job purges entries older than this once a day
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="log-purge-archive" className="font-normal">
              Archive purged rows to CSV in Storage first
            </Label>
            <Switch
              id="log-purge-archive"
              checked={archive}
              onCheckedChange={setArchive}
              disabled={!canEdit || saving}
            />
          </div>

          {canEdit ? (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {data.canPurge ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manual purge</CardTitle>
            <CardDescription>
              Run the retention cleanup immediately instead of waiting for the nightly job.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={purging}
            >
              {purging ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Purge older than {purgeDays} days now
            </Button>
            <p className="text-xs text-muted-foreground">
              {archive
                ? "Purged rows are archived to CSV in Storage before deletion."
                : "Archiving is off — purged rows are deleted permanently."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge activity logs?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every activity log entry created more than{" "}
              {purgeDays} days ago. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handlePurge}>
              Purge entries
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import &amp; export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Every list screen&apos;s toolbar offers CSV/PDF export, print, and CSV import with
            mapping &amp; validation.
          </p>
          <p className="text-xs text-muted-foreground">
            Database backups follow your Supabase project&apos;s backup policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
