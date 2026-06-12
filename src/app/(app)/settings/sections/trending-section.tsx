"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Plus, Trash2, X } from "lucide-react";
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
import { updateTrendingConfigAction } from "@/lib/settings/actions";
import { ColorSelect, newRid, slugifyKey, toBadgeColor } from "./orders-shared";
import type { TrendingConfigData } from "./types";

type StatusRow = { rid: string; key: string | null; label: string; color: string };

/**
 * Trending Products configuration: source platforms, the status ladder with
 * badge colors, and the target margin behind the mint/amber/red margin pill.
 * "in_production" is locked — promote-to-product moves entries there.
 */
export function TrendingSection({ data, canEdit }: { data: TrendingConfigData; canEdit: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [platforms, setPlatforms] = useState<string[]>(data.platforms);
  const [newPlatform, setNewPlatform] = useState("");
  const [statuses, setStatuses] = useState<StatusRow[]>(() =>
    data.statuses.map((s) => ({ rid: s.key, key: s.key, label: s.label, color: s.color })),
  );
  const [targetMargin, setTargetMargin] = useState(String(data.targetMarginPct));

  function addPlatform() {
    const value = newPlatform.trim();
    if (!value) return;
    if (platforms.some((p) => p.toLowerCase() === value.toLowerCase())) {
      toast.error("That platform is already listed");
      return;
    }
    setPlatforms((prev) => [...prev, value]);
    setNewPlatform("");
  }

  async function save() {
    if (statuses.some((s) => !s.label.trim())) {
      toast.error("Every status needs a label");
      return;
    }
    const taken = new Set(statuses.map((s) => s.key).filter((k): k is string => k !== null));
    const keyed = statuses.map((s) => {
      if (s.key) return { key: s.key, label: s.label.trim(), color: toBadgeColor(s.color) };
      const base = slugifyKey(s.label).slice(0, 36);
      let key = base;
      for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
      taken.add(key);
      return { key, label: s.label.trim(), color: toBadgeColor(s.color) };
    });
    setSaving(true);
    try {
      const res = await updateTrendingConfigAction({
        platforms,
        statuses: keyed,
        targetMarginPct: Number(targetMargin) || 0,
      });
      if (res.ok) {
        toast.success("Trending settings saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source platforms</CardTitle>
          <CardDescription>Where the team finds trending ideas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatforms((prev) => (prev.length > 1 ? prev.filter((x) => x !== p) : prev))}
                disabled={!canEdit || platforms.length <= 1}
                aria-label={`Remove ${p}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
              >
                {p}
                <X className="size-3 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newPlatform}
              maxLength={60}
              placeholder="Add platform"
              disabled={!canEdit}
              onChange={(e) => setNewPlatform(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPlatform();
                }
              }}
              className="max-w-48"
            />
            <Button type="button" variant="outline" onClick={addPlatform} disabled={!canEdit}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trend statuses</CardTitle>
          <CardDescription>
            The research ladder. in_production is locked — promote-to-product moves entries there.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statuses.map((row) => {
            const locked = row.key === "in_production";
            return (
              <div key={row.rid} className="flex flex-wrap items-center gap-2">
                <Input
                  value={row.label}
                  maxLength={40}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setStatuses((prev) =>
                      prev.map((r) => (r.rid === row.rid ? { ...r, label: e.target.value } : r)),
                    )
                  }
                  className="h-8 w-44"
                  aria-label="Status label"
                />
                <ColorSelect
                  value={row.color}
                  onChange={(c) =>
                    setStatuses((prev) => prev.map((r) => (r.rid === row.rid ? { ...r, color: c } : r)))
                  }
                  disabled={!canEdit}
                  className="h-8 w-28"
                  ariaLabel={`${row.label || "status"} color`}
                />
                <code className="text-xs text-muted-foreground">{row.key ?? slugifyKey(row.label)}</code>
                {locked ? (
                  <span title="Required by promote-to-product">
                    <Lock className="size-3.5 text-muted-foreground" aria-label="Locked status" />
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!canEdit || statuses.length <= 2}
                    onClick={() => setStatuses((prev) => prev.filter((r) => r.rid !== row.rid))}
                    aria-label={`Remove ${row.label || "status"}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={statuses.length >= 15}
              onClick={() => {
                const row: StatusRow = { rid: newRid(), key: null, label: "", color: "slate" };
                setStatuses((prev) => [...prev, row]);
              }}
            >
              <Plus className="size-4" />
              Add status
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Margin target</CardTitle>
          <CardDescription>
            Drives the mint/amber/red estimated-margin pill on trend entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-48 space-y-2">
            <Label htmlFor="trend-target-margin">Target margin (%)</Label>
            <Input
              id="trend-target-margin"
              type="number"
              min={0}
              max={95}
              value={targetMargin}
              disabled={!canEdit}
              onChange={(e) => setTargetMargin(e.target.value)}
            />
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
    </div>
  );
}
