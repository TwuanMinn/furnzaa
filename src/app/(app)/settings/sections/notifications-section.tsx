"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { updateNotificationPrefsAction } from "@/lib/settings/actions";
import {
  NOTIFIABLE_EVENTS,
  type NotifiableEventKey,
  type NotificationPrefs,
} from "@/lib/settings/notification-prefs";
import type { NotificationPrefsData } from "./types";

/** Missing key = enabled, so seed every toggle explicitly from the stored prefs. */
function initialEvents(prefs: NotificationPrefs): Record<NotifiableEventKey, boolean> {
  const out = {} as Record<NotifiableEventKey, boolean>;
  for (const { key } of NOTIFIABLE_EVENTS) out[key] = prefs.events[key] !== false;
  return out;
}

const CHANNEL_OPTIONS: {
  value: NotificationPrefs["channel"];
  label: string;
  caption: string;
  icon: typeof Bell;
}[] = [
  {
    value: "in_app",
    label: "In-app only",
    caption: "Notifications land in the bell menu inside Furnza.",
    icon: Bell,
  },
  {
    value: "in_app_email",
    label: "In-app + email",
    caption: "Email delivery activates once a provider is configured in Marketing settings.",
    icon: Mail,
  },
];

export function NotificationsSection({ data }: { data: NotificationPrefsData }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<Record<NotifiableEventKey, boolean>>(() =>
    initialEvents(data),
  );
  const [channel, setChannel] = useState<NotificationPrefs["channel"]>(data.channel);
  const [quietEnabled, setQuietEnabled] = useState(data.quiet_hours.enabled);
  const [quietStart, setQuietStart] = useState(data.quiet_hours.start);
  const [quietEnd, setQuietEnd] = useState(data.quiet_hours.end);

  async function save() {
    setSaving(true);
    try {
      const res = await updateNotificationPrefsAction({
        events,
        channel,
        quietHours: { enabled: quietEnabled, start: quietStart, end: quietEnd },
      });
      if (res.ok) {
        toast.success("Notification preferences saved");
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events</CardTitle>
          <CardDescription>Choose which events create a notification for you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y divide-border rounded-md border border-border">
            {NOTIFIABLE_EVENTS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between px-3 py-2.5">
                <Label htmlFor={`notif-${key}`} className="font-normal">
                  {label}
                </Label>
                <Switch
                  id={`notif-${key}`}
                  checked={events[key]}
                  onCheckedChange={(checked: boolean) =>
                    setEvents((prev) => ({ ...prev, [key]: checked }))
                  }
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Admin broadcasts and security alerts are always delivered.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery</CardTitle>
          <CardDescription>Where your notifications are delivered.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {CHANNEL_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = channel === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setChannel(option.value)}
                  className={cn(
                    "rounded-md border p-4 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    {option.label}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{option.caption}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiet hours</CardTitle>
          <CardDescription>Mute the noise during your off-hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <Label htmlFor="quiet-enabled" className="font-normal">
              Enable quiet hours
            </Label>
            <Switch id="quiet-enabled" checked={quietEnabled} onCheckedChange={setQuietEnabled} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quiet-start">Start</Label>
              <Input
                id="quiet-start"
                type="time"
                value={quietStart}
                disabled={!quietEnabled}
                onChange={(e) => setQuietStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiet-end">End</Label>
              <Input
                id="quiet-end"
                type="time"
                value={quietEnd}
                disabled={!quietEnabled}
                onChange={(e) => setQuietEnd(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            During quiet hours, new notifications skip the pop-up toast and just count up the bell.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  );
}
