"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { badgeClass } from "@/lib/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deleteInvestmentCategoryAction,
  deleteInvestmentProjectAction,
  saveInvestmentCategoryAction,
  saveInvestmentProjectAction,
  setInvestmentCategoryActiveAction,
  setInvestmentProjectActiveAction,
  updateRoiConfigAction,
} from "@/lib/settings/actions";
import { ColorSelect } from "./orders-shared";
import type { RoiConfigData } from "./types";

type RefRow = { id: string; name: string; color: string; isActive: boolean };
type RefResult = { ok: boolean; error?: string; data?: { id: string } };

export function RoiSection({ data, canEdit }: { data: RoiConfigData; canEdit: boolean }) {
  const router = useRouter();

  // ── Tunables ───────────────────────────────────────────────────────────────
  const [targetRoi, setTargetRoi] = useState(String(data.targetRoiPct));
  const [payback, setPayback] = useState(String(data.defaultPaybackMonths));
  const [windowMonths, setWindowMonths] = useState(String(data.trailingWindowMonths));
  const [autoAttribution, setAutoAttribution] = useState(data.autoAttributionEnabled);
  const [savingConfig, setSavingConfig] = useState(false);

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const res = await updateRoiConfigAction({
        targetRoiPct: Number(targetRoi) || 0,
        defaultPaybackMonths: Math.round(Number(payback) || 0),
        trailingWindowMonths: Math.max(1, Math.round(Number(windowMonths) || 6)),
        autoAttributionEnabled: autoAttribution,
      });
      if (res.ok) {
        toast.success("ROI settings saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSavingConfig(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ROI tunables</CardTitle>
          <CardDescription>
            Defaults behind payback projection and the recovery dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="roi-target">Target ROI (%)</Label>
              <Input id="roi-target" type="number" min={0} max={1000} value={targetRoi} disabled={!canEdit} onChange={(e) => setTargetRoi(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roi-payback">Default payback (months)</Label>
              <Input id="roi-payback" type="number" min={0} max={600} value={payback} disabled={!canEdit} onChange={(e) => setPayback(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roi-window">Run-rate window (months)</Label>
              <Input id="roi-window" type="number" min={1} max={60} value={windowMonths} disabled={!canEdit} onChange={(e) => setWindowMonths(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox
              checked={autoAttribution}
              disabled={!canEdit}
              onCheckedChange={(v) => setAutoAttribution(v === true)}
            />
            <span>
              Auto-attribute delivered &amp; paid order revenue to linked investments
              <span className="block text-xs text-muted-foreground">
                When on, the cron run rolls matching order revenue into investments (idempotent per order).
              </span>
            </span>
          </label>
          {canEdit ? (
            <div className="flex justify-end">
              <Button disabled={savingConfig} onClick={() => void saveConfig()}>
                {savingConfig ? <Loader2 className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <RefList
        title="Investment categories"
        description="The Category filter dimension on the ROI dashboard."
        kind="category"
        items={data.categories}
        canEdit={canEdit}
        onSave={saveInvestmentCategoryAction}
        onSetActive={setInvestmentCategoryActiveAction}
        onDelete={deleteInvestmentCategoryAction}
      />
      <RefList
        title="Projects / business lines"
        description="The Project filter dimension on the ROI dashboard."
        kind="project"
        items={data.projects}
        canEdit={canEdit}
        onSave={saveInvestmentProjectAction}
        onSetActive={setInvestmentProjectActiveAction}
        onDelete={deleteInvestmentProjectAction}
      />
    </div>
  );
}

function RefList({
  title,
  description,
  kind,
  items,
  canEdit,
  onSave,
  onSetActive,
  onDelete,
}: {
  title: string;
  description: string;
  kind: string;
  items: RefRow[];
  canEdit: boolean;
  onSave: (input: { id?: string; name: string; color: string }) => Promise<RefResult>;
  onSetActive: (id: string, active: boolean) => Promise<RefResult>;
  onDelete: (id: string) => Promise<RefResult>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RefRow[]>(items);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("blue");
  const [busy, setBusy] = useState<string | null>(null);

  async function saveRow(row: RefRow) {
    setBusy(row.id);
    try {
      const res = await onSave({ id: row.id, name: row.name, color: row.color });
      if (res.ok) {
        toast.success(`${title} updated`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy("new");
    try {
      const res = await onSave({ name, color: newColor });
      if (res.ok && res.data) {
        setRows((prev) => [...prev, { id: res.data!.id, name, color: newColor, isActive: true }]);
        setNewName("");
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.error);
      }
    } finally {
      setBusy(null);
    }
  }

  async function toggle(row: RefRow) {
    const res = await onSetActive(row.id, !row.isActive);
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: !r.isActive } : r)));
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function remove(row: RefRow) {
    const res = await onDelete(row.id);
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {kind} entries yet.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className={cn("flex flex-wrap items-center gap-2", !row.isActive && "opacity-55")}>
              <span className={cn("inline-block size-3 shrink-0 rounded-full ring-1 ring-inset", badgeClass(row.color))} aria-hidden />
              <Input
                value={row.name}
                maxLength={80}
                disabled={!canEdit}
                onChange={(e) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)))}
                className="h-8 w-48"
                aria-label={`${kind} name`}
              />
              <ColorSelect
                value={row.color}
                onChange={(c) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, color: c } : r)))}
                disabled={!canEdit}
                className="h-8 w-28"
                ariaLabel={`${row.name || kind} color`}
              />
              {canEdit ? (
                <>
                  <Button type="button" variant="outline" size="sm" disabled={busy === row.id} onClick={() => void saveRow(row)}>
                    {busy === row.id ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => void toggle(row)} aria-label={row.isActive ? `Hide ${row.name}` : `Show ${row.name}`}>
                    {row.isActive ? <Eye className="size-4 text-muted-foreground" /> : <EyeOff className="size-4 text-muted-foreground" />}
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => void remove(row)} aria-label={`Remove ${row.name}`}>
                    <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </>
              ) : null}
            </div>
          ))
        )}

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Input
              value={newName}
              maxLength={80}
              placeholder={`New ${kind} name`}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void add();
                }
              }}
              className="h-8 w-48"
            />
            <ColorSelect value={newColor} onChange={(c) => setNewColor(c)} className="h-8 w-28" ariaLabel="New color" />
            <Button type="button" variant="outline" size="sm" disabled={busy === "new" || !newName.trim()} onClick={() => void add()}>
              {busy === "new" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
