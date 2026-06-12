"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateFeedbackConfigAction } from "@/lib/settings/actions";
import { ColorSelect, toBadgeColor } from "./orders-shared";
import type { FeedbackConfigData } from "./types";

const SEVERITY_KEYS = ["low", "medium", "high"] as const;
type SeverityKey = (typeof SEVERITY_KEYS)[number];
type SeverityRow = { key: SeverityKey; label: string; color: string };

/** Editable chip list shared by the categories and channels cards. */
function ChipListEditor({
  items,
  onChange,
  placeholder,
  maxItems,
  disabled,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  maxItems: number;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value) return;
    if (items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      toast.error("That entry is already listed");
      return;
    }
    if (items.length >= maxItems) {
      toast.error(`Max ${maxItems} entries`);
      return;
    }
    onChange([...items, value]);
    setDraft("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(items.length > 1 ? items.filter((x) => x !== item) : items)}
            disabled={disabled || items.length <= 1}
            aria-label={`Remove ${item}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
          >
            {item}
            <X className="size-3 text-muted-foreground" aria-hidden />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          maxLength={60}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="max-w-48"
        />
        <Button type="button" variant="outline" onClick={add} disabled={disabled}>
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * Customer Feedback configuration: categories, source channels, the three
 * fixed severity levels (rename/recolor only — the DB CHECK pins the keys),
 * the aging SLA and the negative-feedback admin alert.
 */
export function FeedbackSection({ data, canEdit }: { data: FeedbackConfigData; canEdit: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<string[]>(data.categories);
  const [channels, setChannels] = useState<string[]>(data.channels);
  const [severities, setSeverities] = useState<SeverityRow[]>(() =>
    SEVERITY_KEYS.map((key) => {
      const found = data.severities.find((s) => s.key === key);
      return {
        key,
        label: found?.label ?? key.charAt(0).toUpperCase() + key.slice(1),
        color: found?.color ?? "slate",
      };
    }),
  );
  const [agingSlaDays, setAgingSlaDays] = useState(String(data.agingSlaDays));
  const [negativeAlertEnabled, setNegativeAlertEnabled] = useState(data.negativeAlertEnabled);

  async function save() {
    if (severities.some((s) => !s.label.trim())) {
      toast.error("Every severity needs a label");
      return;
    }
    setSaving(true);
    try {
      const res = await updateFeedbackConfigAction({
        categories,
        severities: severities.map((s) => ({
          key: s.key,
          label: s.label.trim(),
          color: toBadgeColor(s.color),
        })),
        channels,
        agingSlaDays: Number(agingSlaDays) || 0,
        negativeAlertEnabled,
      });
      if (res.ok) {
        toast.success("Feedback settings saved");
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
          <CardTitle className="text-base">Categories</CardTitle>
          <CardDescription>What a piece of feedback is about.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChipListEditor
            items={categories}
            onChange={setCategories}
            placeholder="Add category"
            maxItems={20}
            disabled={!canEdit}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source channels</CardTitle>
          <CardDescription>Where customer feedback comes in from.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChipListEditor
            items={channels}
            onChange={setChannels}
            placeholder="Add channel"
            maxItems={20}
            disabled={!canEdit}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Severity levels</CardTitle>
          <CardDescription>
            The three levels are fixed — rename them or recolor their badges.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {severities.map((row) => (
            <div key={row.key} className="flex flex-wrap items-center gap-2">
              <Input
                value={row.label}
                maxLength={30}
                disabled={!canEdit}
                onChange={(e) =>
                  setSeverities((prev) =>
                    prev.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)),
                  )
                }
                className="h-8 w-44"
                aria-label={`${row.key} severity label`}
              />
              <ColorSelect
                value={row.color}
                onChange={(c) =>
                  setSeverities((prev) =>
                    prev.map((r) => (r.key === row.key ? { ...r, color: c } : r)),
                  )
                }
                disabled={!canEdit}
                className="h-8 w-28"
                ariaLabel={`${row.label || row.key} color`}
              />
              <code className="text-xs text-muted-foreground">{row.key}</code>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerts</CardTitle>
          <CardDescription>Aging SLA and negative-feedback notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-48 space-y-2">
            <Label htmlFor="feedback-aging-sla">Aging SLA (days)</Label>
            <Input
              id="feedback-aging-sla"
              type="number"
              min={1}
              max={90}
              value={agingSlaDays}
              disabled={!canEdit}
              onChange={(e) => setAgingSlaDays(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              In-progress records older than this trigger an aging alert.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="feedback-negative-alert">Alert Admins on new 1–2★ feedback</Label>
            <Switch
              id="feedback-negative-alert"
              checked={negativeAlertEnabled}
              onCheckedChange={setNegativeAlertEnabled}
              disabled={!canEdit}
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
