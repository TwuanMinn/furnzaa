"use client";

import { useEffect, useState } from "react";
import { Loader2, Megaphone, Save } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Can } from "@/lib/rbac/context";
import { createCampaignAction } from "@/lib/marketing/actions";
import type { SegmentRow, TierRow } from "@/lib/datasets/crm";
import type { VoucherOption } from "./page";
import { CHANNEL_LABELS } from "./campaigns-tab";

export function CampaignCreateDialog({
  open,
  onOpenChange,
  segments,
  tiers,
  vouchers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segments: SegmentRow[];
  tiers: TierRow[];
  vouchers: VoucherOption[];
  onSaved?: () => void;
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"email" | "sms" | "whatsapp" | "in_app">("email");
  const [subject, setSubject] = useState("");
  const [template, setTemplate] = useState("Hi {{name}}, …");
  const [audienceType, setAudienceType] = useState<"all" | "tier" | "segment">("all");
  const [tierKeys, setTierKeys] = useState<ReadonlySet<string>>(new Set());
  const [segmentId, setSegmentId] = useState("");
  const [voucherId, setVoucherId] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState<"draft" | "launch" | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setChannel("email");
      setSubject("");
      setTemplate("Hi {{name}}, …");
      setAudienceType("all");
      setTierKeys(new Set());
      setSegmentId("");
      setVoucherId("");
      setScheduleAt("");
    }
  }, [open]);

  async function save(launch: boolean) {
    setBusy(launch ? "launch" : "draft");
    try {
      const result = await createCampaignAction(
        {
          name,
          channel,
          subject,
          template,
          audienceType,
          tierKeys: [...tierKeys],
          segmentId,
          voucherId,
          scheduleAt,
        },
        launch,
      );
      if (result.ok) {
        toast.success(
          !launch
            ? "Draft saved"
            : scheduleAt
              ? "Campaign scheduled"
              : "Campaign launched — sending in batches",
        );
        onOpenChange(false);
        onSaved?.();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            Merge tags: <code className="text-xs">{"{{name}}"}</code>,{" "}
            <code className="text-xs">{"{{tier}}"}</code>,{" "}
            <code className="text-xs">{"{{voucher_code}}"}</code>. Email/SMS/WhatsApp use the
            configured provider (console adapter in dev).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cc-name">Name</Label>
              <Input id="cc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-channel">Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                <SelectTrigger id="cc-channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {channel === "email" ? (
            <div className="space-y-1.5">
              <Label htmlFor="cc-subject">Subject</Label>
              <Input
                id="cc-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={300}
                placeholder="e.g. A gift for you, {{name}}"
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="cc-template">Message template</Label>
            <Textarea
              id="cc-template"
              rows={4}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              maxLength={20_000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-audience">Audience</Label>
            <Select value={audienceType} onValueChange={(v) => setAudienceType(v as typeof audienceType)}>
              <SelectTrigger id="cc-audience" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                <SelectItem value="tier">Loyalty tier(s)</SelectItem>
                <SelectItem value="segment">Saved segment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {audienceType === "tier" ? (
            <ScrollArea className="h-36 rounded-md border p-2">
              <ul className="space-y-1.5">
                {tiers.map((t) => (
                  <li key={t.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`cc-tier-${t.key}`}
                      checked={tierKeys.has(t.key)}
                      onCheckedChange={(checked) => {
                        setTierKeys((prev) => {
                          const next = new Set(prev);
                          if (checked === true) next.add(t.key);
                          else next.delete(t.key);
                          return next;
                        });
                      }}
                    />
                    <Label htmlFor={`cc-tier-${t.key}`} className="font-normal">
                      {t.name}
                    </Label>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          ) : null}

          {audienceType === "segment" ? (
            <Select value={segmentId || "__none__"} onValueChange={(v) => setSegmentId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-full" aria-label="Segment">
                <SelectValue placeholder="Pick a segment…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Pick a segment…</SelectItem>
                {segments.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cc-voucher">Voucher for {"{{voucher_code}}"} (optional)</Label>
              <Select value={voucherId || "__none__"} onValueChange={(v) => setVoucherId(v === "__none__" ? "" : v)}>
                <SelectTrigger id="cc-voucher" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {vouchers.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-schedule">Schedule (optional)</Label>
              <Input
                id="cc-schedule"
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy !== null}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => void save(false)} disabled={busy !== null}>
            {busy === "draft" ? <Loader2 className="animate-spin" /> : <Save />}
            Save draft
          </Button>
          <Can permission="campaigns.send">
            <Button onClick={() => void save(true)} disabled={busy !== null}>
              {busy === "launch" ? <Loader2 className="animate-spin" /> : <Megaphone />}
              {scheduleAt ? "Schedule" : "Launch now"}
            </Button>
          </Can>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
