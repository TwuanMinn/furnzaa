"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { updateMarketingConfigAction } from "@/lib/settings/actions";
import type { MarketingData } from "./types";

const CHANNELS = ["Email", "SMS", "WhatsApp"] as const;

/**
 * Marketing configuration: campaign sender identity, open/click tracking,
 * quiet hours, and a read-only view of the channel provider wiring.
 */
export function MarketingSection({ data, canEdit }: { data: MarketingData; canEdit: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [senderName, setSenderName] = useState(data.senderName);
  const [senderEmail, setSenderEmail] = useState(data.senderEmail);
  const [trackingEnabled, setTrackingEnabled] = useState(data.trackingEnabled);
  const [quietEnabled, setQuietEnabled] = useState(data.quietEnabled);
  const [quietStart, setQuietStart] = useState(data.quietStart);
  const [quietEnd, setQuietEnd] = useState(data.quietEnd);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await updateMarketingConfigAction({
        senderName,
        senderEmail,
        trackingEnabled,
        quietEnabled,
        quietStart,
        quietEnd,
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

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sender identity</CardTitle>
            <CardDescription>
              Used as the From identity on outgoing campaign email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="marketing-sender-name">Sender name</Label>
                <Input
                  id="marketing-sender-name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="marketing-sender-email">Sender email</Label>
                <Input
                  id="marketing-sender-email"
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  disabled={!canEdit}
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tracking</CardTitle>
            <CardDescription>
              When off, campaign emails carry no open pixel and links are not rewritten —
              open/click analytics pause.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="marketing-tracking">Open and click tracking</Label>
              <Switch
                id="marketing-tracking"
                checked={trackingEnabled}
                onCheckedChange={setTrackingEnabled}
                disabled={!canEdit}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quiet hours</CardTitle>
            <CardDescription>
              Campaign batches pause during this window and resume after it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="marketing-quiet">Enable quiet hours</Label>
              <Switch
                id="marketing-quiet"
                checked={quietEnabled}
                onCheckedChange={setQuietEnabled}
                disabled={!canEdit}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="marketing-quiet-start">Start</Label>
                <Input
                  id="marketing-quiet-start"
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  disabled={!canEdit || !quietEnabled}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="marketing-quiet-end">End</Label>
                <Input
                  id="marketing-quiet-end"
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  disabled={!canEdit || !quietEnabled}
                  required
                />
              </div>
            </div>
            {canEdit ? (
              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save changes
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channel providers</CardTitle>
          <CardDescription>Delivery providers are configured outside the app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y">
            {CHANNELS.map((channel) => (
              <div
                key={channel}
                className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="text-sm font-medium">{channel}</span>
                <p className="text-xs text-muted-foreground">
                  Configured via environment (.env) — console provider logs to the server in
                  development.
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
