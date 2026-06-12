"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateMessagingConfigAction } from "@/lib/settings/actions";
import type { MessagingData } from "./types";

const MAX_REACTIONS = 12;

/**
 * Org-wide messaging configuration: the quick-reaction emoji palette,
 * invite-link defaults, and the @all mention policy. One save commits all
 * three cards via updateMessagingConfigAction.
 */
export function MessagingSection({ data, canEdit }: { data: MessagingData; canEdit: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [emojis, setEmojis] = useState<string[]>(data.reactionEmojis);
  const [newEmoji, setNewEmoji] = useState("");
  const [inviteExpiryHours, setInviteExpiryHours] = useState(String(data.inviteExpiryHours));
  const [inviteMaxUses, setInviteMaxUses] = useState(String(data.inviteMaxUses));
  const [allMentionPolicy, setAllMentionPolicy] = useState<MessagingData["allMentionPolicy"]>(
    data.allMentionPolicy,
  );

  function addEmoji() {
    const value = newEmoji.trim();
    if (!value) return;
    if (emojis.includes(value)) {
      toast.error("That reaction is already in the palette");
      return;
    }
    if (emojis.length >= MAX_REACTIONS) {
      toast.error(`Maximum of ${MAX_REACTIONS} quick reactions`);
      return;
    }
    setEmojis((prev) => [...prev, value]);
    setNewEmoji("");
  }

  function removeEmoji(emoji: string) {
    setEmojis((prev) => (prev.length > 1 ? prev.filter((e) => e !== emoji) : prev));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await updateMessagingConfigAction({
        reactionEmojis: emojis,
        inviteExpiryHours: Number(inviteExpiryHours) || 0,
        inviteMaxUses: Number(inviteMaxUses) || 0,
        allMentionPolicy,
      });
      if (res.ok) {
        toast.success("Messaging settings saved");
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
          <CardTitle className="text-base">Quick reactions</CardTitle>
          <CardDescription>
            This set is the hover reaction palette in every conversation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => removeEmoji(emoji)}
                disabled={!canEdit || emojis.length <= 1}
                aria-label={`Remove ${emoji} reaction`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
              >
                <span aria-hidden>{emoji}</span>
                <X className="size-3 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              id="msg-new-reaction"
              value={newEmoji}
              maxLength={16}
              placeholder="Add emoji"
              disabled={!canEdit}
              onChange={(e) => setNewEmoji(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEmoji();
                }
              }}
              className="max-w-40"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addEmoji}
              disabled={!canEdit || emojis.length >= MAX_REACTIONS}
            >
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            At least one reaction is required; up to {MAX_REACTIONS}.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite links</CardTitle>
          <CardDescription>Defaults applied when members generate group invites.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="msg-invite-expiry">Expiry (hours)</Label>
              <Input
                id="msg-invite-expiry"
                type="number"
                min={1}
                value={inviteExpiryHours}
                disabled={!canEdit}
                onChange={(e) => setInviteExpiryHours(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Default lifetime for expiring links</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="msg-invite-uses">Max uses</Label>
              <Input
                id="msg-invite-uses"
                type="number"
                min={1}
                value={inviteMaxUses}
                disabled={!canEdit}
                onChange={(e) => setInviteMaxUses(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Default redemption cap for multi-use links
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">@all mentions</CardTitle>
          <CardDescription>Controls who may notify the whole group at once.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="msg-all-mention">Allowed senders</Label>
              <Select
                value={allMentionPolicy}
                onValueChange={(v) =>
                  setAllMentionPolicy(v as MessagingData["allMentionPolicy"])
                }
                disabled={!canEdit}
              >
                <SelectTrigger id="msg-all-mention">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="creator_admin">Group creator &amp; Admins</SelectItem>
                  <SelectItem value="members">Any group member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {canEdit ? (
            <div className="flex justify-end">
              <Button onClick={() => void save()} disabled={saving || !canEdit}>
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
