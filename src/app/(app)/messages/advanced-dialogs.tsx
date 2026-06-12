"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  BarChart3,
  Copy,
  Forward,
  Link2,
  Loader2,
  LogOut,
  Plus,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { getBrowserClient } from "@/lib/supabase/client";
import { asRows } from "@/lib/supabase/types";
import { formatDateTime } from "@/lib/format";
import {
  cancelScheduledItemAction,
  createInviteLinkAction,
  createPollAction,
  createScheduledItemAction,
  deleteGroupAction,
  forwardMessageAction,
  leaveGroupAction,
  revokeInviteLinkAction,
} from "@/lib/messages/advanced-actions";
import type { ConversationRow } from "@/app/api/messages/groups/route";

// ── Forward ──────────────────────────────────────────────────────────────────

export function ForwardDialog({
  messageId,
  conversations,
  currentGroupId,
  onOpenChange,
}: {
  messageId: string | null;
  conversations: ConversationRow[];
  currentGroupId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const targets = conversations.filter((c) => c.group_id !== currentGroupId);

  async function forward(targetGroupId: string) {
    if (!messageId) return;
    setBusyId(targetGroupId);
    try {
      const result = await forwardMessageAction(messageId, targetGroupId);
      if (result.ok) {
        toast.success("Message forwarded");
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={!!messageId} onOpenChange={(o) => !busyId && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Forward message</DialogTitle>
          <DialogDescription>
            Attachments are forwarded by reference — nothing is re-uploaded.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-64 rounded-md border">
          {targets.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No other conversations to forward into.
            </p>
          ) : (
            <ul className="p-1">
              {targets.map((c) => (
                <li key={c.group_id}>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void forward(c.group_id)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent disabled:opacity-60"
                  >
                    <Forward className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {c.type === "direct" ? c.other_name : c.name}
                    </span>
                    {busyId === c.group_id ? <Loader2 className="size-4 animate-spin" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Invite links ─────────────────────────────────────────────────────────────

interface InviteLinkRow {
  id: string;
  link_type: "one_time" | "expiring" | "permanent" | "password";
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
  created_at: string;
}

export function InviteLinksDialog({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [linkType, setLinkType] = useState<InviteLinkRow["link_type"]>("expiring");
  const [expiryHours, setExpiryHours] = useState("168");
  const [maxUses, setMaxUses] = useState("25");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const linksQuery = useQuery({
    queryKey: ["invite-links", groupId],
    enabled: open,
    queryFn: async (): Promise<InviteLinkRow[]> => {
      const supabase = getBrowserClient();
      const { data } = await supabase
        .from("group_invite_links")
        .select("id, link_type, expires_at, max_uses, use_count, revoked_at, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(20);
      return asRows<InviteLinkRow>(data);
    },
  });

  useEffect(() => {
    if (open) setFreshUrl(null);
  }, [open]);

  async function create() {
    setCreating(true);
    try {
      const result = await createInviteLinkAction({
        groupId,
        linkType,
        expiryHours: linkType === "expiring" ? Number(expiryHours) || 168 : undefined,
        maxUses: linkType !== "one_time" && maxUses ? Number(maxUses) : undefined,
        password: linkType === "password" ? password : undefined,
      });
      if (result.ok) {
        setFreshUrl(result.data.url);
        setPassword("");
        void queryClient.invalidateQueries({ queryKey: ["invite-links", groupId] });
        toast.success("Invite link created — copy it now; the token is never shown again");
      } else {
        toast.error(result.error);
      }
    } finally {
      setCreating(false);
    }
  }

  async function revoke(linkId: string) {
    setRevokingId(linkId);
    try {
      const result = await revokeInviteLinkAction(linkId);
      if (result.ok) {
        toast.success("Link revoked");
        void queryClient.invalidateQueries({ queryKey: ["invite-links", groupId] });
      } else {
        toast.error(result.error);
      }
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !creating && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Group invite links</DialogTitle>
          <DialogDescription>
            INTERNAL ONLY — a link adds an existing, active user of this app to the group. Tokens
            are stored hashed and can be revoked at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="il-type">Link type</Label>
              <Select value={linkType} onValueChange={(v) => setLinkType(v as InviteLinkRow["link_type"])}>
                <SelectTrigger id="il-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="expiring">Expiring</SelectItem>
                  <SelectItem value="permanent">Permanent</SelectItem>
                  <SelectItem value="password">Password-protected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {linkType === "expiring" ? (
              <div className="space-y-1.5">
                <Label htmlFor="il-expiry">Expires after (hours)</Label>
                <Input id="il-expiry" type="number" min={1} value={expiryHours} onChange={(e) => setExpiryHours(e.target.value)} />
              </div>
            ) : linkType === "password" ? (
              <div className="space-y-1.5">
                <Label htmlFor="il-password">Password</Label>
                <Input id="il-password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 4 chars" />
              </div>
            ) : linkType === "permanent" ? (
              <div className="space-y-1.5">
                <Label htmlFor="il-uses">Max uses (optional)</Label>
                <Input id="il-uses" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
              </div>
            ) : null}
          </div>
          <Button size="sm" onClick={() => void create()} disabled={creating || (linkType === "password" && password.length < 4)}>
            {creating ? <Loader2 className="animate-spin" /> : <Plus />}
            Create link
          </Button>

          {freshUrl ? (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2">
              <Link2 className="size-4 shrink-0 text-primary" aria-hidden />
              <code className="min-w-0 flex-1 truncate text-xs">{freshUrl}</code>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Copy invite link"
                onClick={() => {
                  void navigator.clipboard.writeText(freshUrl);
                  toast.success("Copied");
                }}
              >
                <Copy />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>Existing links</Label>
          {(linksQuery.data?.length ?? 0) === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              No links yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {linksQuery.data!.map((link) => {
                const dead =
                  !!link.revoked_at ||
                  (link.expires_at ? new Date(link.expires_at) < new Date() : false) ||
                  (link.max_uses != null && link.use_count >= link.max_uses);
                return (
                  <li
                    key={link.id}
                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
                  >
                    <Badge variant={dead ? "outline" : "secondary"}>
                      {link.link_type.replace("_", "-")}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {link.use_count} use(s)
                      {link.max_uses ? ` / ${link.max_uses}` : ""}
                      {link.expires_at ? ` · until ${formatDateTime(link.expires_at)}` : ""}
                      {link.revoked_at ? " · revoked" : ""}
                    </span>
                    {!link.revoked_at ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Revoke link"
                        disabled={revokingId === link.id}
                        onClick={() => void revoke(link.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {revokingId === link.id ? <Loader2 className="animate-spin" /> : <X />}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Unified scheduler ────────────────────────────────────────────────────────

interface ScheduledItemRow {
  id: string;
  kind: "message" | "reminder" | "poll";
  body: string;
  audience: "group" | "only_me";
  priority: "low" | "normal" | "high";
  next_run_at: string;
  repeat_rule: string;
  is_active: boolean;
}

function subscribeHalfMinute(cb: () => void) {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
}

function countdownLabel(to: string): string {
  const ms = new Date(to).getTime() - Date.now();
  if (ms <= 0) return "due now";
  if (ms < 3600_000) return `in ${Math.max(1, Math.round(ms / 60_000))}m`;
  if (ms < 86_400_000) return `in ${Math.round(ms / 3600_000)}h`;
  return `in ${Math.round(ms / 86_400_000)}d`;
}

function CountdownChip({ to }: { to: string }) {
  // Time is an external system: reading Date.now() during render lets the React
  // Compiler memoize a stale value (frozen countdown), so it goes through
  // useSyncExternalStore and re-evaluates on every 30s tick.
  const label = useSyncExternalStore(
    subscribeHalfMinute,
    () => countdownLabel(to),
    () => countdownLabel(to),
  );
  return (
    <Badge variant="outline" className="gap-1 font-normal tabular-nums">
      <AlarmClock className="size-3" aria-hidden />
      {label}
    </Badge>
  );
}

export function ScheduleDialog({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"message" | "reminder">("message");
  const [body, setBody] = useState("");
  const [runAt, setRunAt] = useState("");
  const [audience, setAudience] = useState<"group" | "only_me">("only_me");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [repeatRule, setRepeatRule] = useState("none");
  const [customMinutes, setCustomMinutes] = useState("60");
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["scheduled-items", groupId],
    enabled: open,
    queryFn: async (): Promise<ScheduledItemRow[]> => {
      const supabase = getBrowserClient();
      const { data } = await supabase
        .from("scheduled_items")
        .select("id, kind, body, audience, priority, next_run_at, repeat_rule, is_active")
        .eq("group_id", groupId)
        .eq("is_active", true)
        .order("next_run_at", { ascending: true })
        .limit(20);
      return asRows<ScheduledItemRow>(data);
    },
  });

  useEffect(() => {
    if (open) {
      setBody("");
      setRunAt("");
      setRepeatRule("none");
    }
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      const result = await createScheduledItemAction({
        groupId,
        kind,
        body,
        runAt,
        audience,
        priority,
        repeatRule: repeatRule as never,
        repeatIntervalMinutes: repeatRule === "custom" ? Number(customMinutes) || 60 : undefined,
      });
      if (result.ok) {
        toast.success(kind === "message" ? "Message scheduled" : "Reminder scheduled");
        setBody("");
        void queryClient.invalidateQueries({ queryKey: ["scheduled-items", groupId] });
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function cancel(itemId: string) {
    setCancellingId(itemId);
    try {
      const result = await cancelScheduledItemAction(itemId);
      if (result.ok) {
        toast.success("Cancelled");
        void queryClient.invalidateQueries({ queryKey: ["scheduled-items", groupId] });
      } else {
        toast.error(result.error);
      }
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule a message or reminder</DialogTitle>
          <DialogDescription>
            One scheduler for both: send a chat message later, or fire a reminder to you or the
            whole group. Runs are idempotent and logged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sc-kind">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger id="sc-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="message">Send a message</SelectItem>
                  <SelectItem value="reminder">Fire a reminder</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kind === "reminder" ? (
              <div className="space-y-1.5">
                <Label htmlFor="sc-audience">Remind</Label>
                <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
                  <SelectTrigger id="sc-audience" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="only_me">Only me</SelectItem>
                    <SelectItem value="group">The whole group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="sc-priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                  <SelectTrigger id="sc-priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {kind === "reminder" ? (
            <div className="space-y-1.5">
              <Label htmlFor="sc-priority2">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger id="sc-priority2" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High (emphasised notification)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="sc-body">{kind === "message" ? "Message" : "Reminder text"}</Label>
            <Textarea id="sc-body" rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sc-runat">When</Label>
              <Input id="sc-runat" type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-repeat">Repeat</Label>
              <Select value={repeatRule} onValueChange={setRepeatRule}>
                <SelectTrigger id="sc-repeat" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["none", "daily", "weekly", "monthly", "quarterly", "yearly", "custom"].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r === "none" ? "Doesn't repeat" : r[0]!.toUpperCase() + r.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {repeatRule === "custom" ? (
            <div className="space-y-1.5">
              <Label htmlFor="sc-interval">Every … minutes (min 5)</Label>
              <Input id="sc-interval" type="number" min={5} value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} />
            </div>
          ) : null}

          <Button onClick={() => void save()} disabled={saving || !body.trim() || !runAt} className="w-full">
            {saving ? <Loader2 className="animate-spin" /> : <AlarmClock />}
            Schedule
          </Button>
        </div>

        {(itemsQuery.data?.length ?? 0) > 0 ? (
          <div className="space-y-1.5">
            <Label>Upcoming in this chat</Label>
            <ul className="space-y-1.5">
              {itemsQuery.data!.map((item) => (
                <li key={item.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                  <Badge variant="secondary" className="shrink-0">
                    {item.kind}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{item.body}</span>
                  <CountdownChip to={item.next_run_at} />
                  {item.repeat_rule !== "none" ? (
                    <Badge variant="outline" className="shrink-0 font-normal">
                      {item.repeat_rule}
                    </Badge>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Cancel scheduled item"
                    disabled={cancellingId === item.id}
                    onClick={() => void cancel(item.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {cancellingId === item.id ? <Loader2 className="animate-spin" /> : <X />}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ── Poll creation ────────────────────────────────────────────────────────────

export function PollCreateDialog({
  groupId,
  open,
  onOpenChange,
  onCreated,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [pollType, setPollType] = useState<"single" | "multiple">("single");
  const [visibility, setVisibility] = useState<"public" | "anonymous">("public");
  const [closesAt, setClosesAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setQuestion("");
      setOptions(["", ""]);
      setPollType("single");
      setVisibility("public");
      setClosesAt("");
    }
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      const result = await createPollAction({
        groupId,
        question,
        options: options.map((o) => o.trim()).filter(Boolean),
        pollType,
        visibility,
        closesAt,
      });
      if (result.ok) {
        toast.success("Poll posted to the chat");
        onOpenChange(false);
        onCreated();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a poll</DialogTitle>
          <DialogDescription>
            Anonymous polls record one vote set per member, but voter identities are never shown
            to anyone — including Admins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pc-question">Question</Label>
            <Input id="pc-question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} />
          </div>

          <div className="space-y-1.5">
            <Label>Options</Label>
            {options.map((option, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={option}
                  aria-label={`Option ${i + 1}`}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))
                  }
                  maxLength={200}
                  placeholder={`Option ${i + 1}`}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove option ${i + 1}`}
                  disabled={options.length <= 2}
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {options.length < 12 ? (
              <Button variant="outline" size="xs" onClick={() => setOptions((prev) => [...prev, ""])}>
                <Plus /> Add option
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pc-type">Type</Label>
              <Select value={pollType} onValueChange={(v) => setPollType(v as typeof pollType)}>
                <SelectTrigger id="pc-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single choice</SelectItem>
                  <SelectItem value="multiple">Multiple choice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-visibility">Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
                <SelectTrigger id="pc-visibility" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public (voters visible)</SelectItem>
                  <SelectItem value="anonymous">Anonymous</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pc-closes">Auto-close at (optional)</Label>
            <Input id="pc-closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving || question.trim().length < 3 || options.filter((o) => o.trim()).length < 2}
          >
            {saving ? <Loader2 className="animate-spin" /> : <BarChart3 />}
            Post poll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Group menu: leave / delete ───────────────────────────────────────────────

export function LeaveGroupDialog({
  groupId,
  groupName,
  open,
  onOpenChange,
  onLeft,
}: {
  groupId: string;
  groupName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeft: () => void;
}) {
  const [busy, setBusy] = useState<"normal" | "silent" | null>(null);

  async function leave(silent: boolean) {
    setBusy(silent ? "silent" : "normal");
    try {
      const result = await leaveGroupAction(groupId, silent);
      if (result.ok) {
        toast.success(`Left “${groupName}”${silent ? " silently" : ""}`);
        onOpenChange(false);
        onLeft();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Leave “{groupName}”?</DialogTitle>
          <DialogDescription>
            Leaving normally posts “you left the group” in the chat. Leaving silently skips that
            message — but the change is still recorded in the activity log either way.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-col sm:space-x-0 sm:gap-2">
          <Button variant="outline" disabled={busy !== null} onClick={() => void leave(false)} className="w-full justify-start">
            {busy === "normal" ? <Loader2 className="animate-spin" /> : <LogOut />}
            Leave normally (posts a system message)
          </Button>
          <Button variant="outline" disabled={busy !== null} onClick={() => void leave(true)} className="w-full justify-start">
            {busy === "silent" ? <Loader2 className="animate-spin" /> : <UsersRound />}
            Leave silently (no chat message)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteGroupDialog({
  groupId,
  groupName,
  open,
  onOpenChange,
  onDeleted,
}: {
  groupId: string;
  groupName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const result = await deleteGroupAction(groupId);
      if (result.ok) {
        toast.success(`Group “${groupName}” deleted`);
        onOpenChange(false);
        onDeleted();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{groupName}”?</DialogTitle>
          <DialogDescription>
            The group is soft-deleted: it disappears from everyone’s list but its history is kept
            and the deletion is logged. Only the creator or an Admin can do this.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Starred messages panel ───────────────────────────────────────────────────

interface StarredRow {
  id: string;
  created_at: string;
  messages: {
    id: string;
    group_id: string;
    body: string;
    deleted: boolean;
    sender: { full_name: string } | null;
  } | null;
}

export function StarredPanel({
  open,
  onOpenChange,
  onJump,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJump: (groupId: string) => void;
}) {
  const starsQuery = useQuery({
    queryKey: ["starred-messages"],
    enabled: open,
    queryFn: async (): Promise<StarredRow[]> => {
      const supabase = getBrowserClient();
      const { data } = await supabase
        .from("message_stars")
        .select("id, created_at, messages(id, group_id, body, deleted, sender:users!messages_sender_id_fkey(full_name))")
        .order("created_at", { ascending: false })
        .limit(50);
      return asRows<StarredRow>(data);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Starred messages</DialogTitle>
          <DialogDescription>Private to you — unlike group-wide pins.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72 rounded-md border">
          {(starsQuery.data?.length ?? 0) === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Star messages in any chat to collect them here.
            </p>
          ) : (
            <ul className="p-1.5">
              {starsQuery.data!.map((star) => (
                <li key={star.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (star.messages) {
                        onJump(star.messages.group_id);
                        onOpenChange(false);
                      }
                    }}
                    className="w-full rounded-md px-2.5 py-2 text-left hover:bg-accent"
                  >
                    <span className="block truncate text-sm">
                      {star.messages?.deleted ? "message deleted" : (star.messages?.body ?? "—")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {star.messages?.sender?.full_name ?? "Unknown"} · starred{" "}
                      {formatDateTime(star.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/** Reaction count chips + who-reacted tooltips, shared by the thread. */
export function ReactionChips({
  reactions,
  myUserId,
  onToggle,
}: {
  reactions: { emoji: string; user_id: string; user_name: string }[];
  myUserId: string;
  onToggle: (emoji: string) => void;
}) {
  const grouped = new Map<string, { count: number; mine: boolean; names: string[] }>();
  for (const r of reactions) {
    const entry = grouped.get(r.emoji) ?? { count: 0, mine: false, names: [] };
    entry.count += 1;
    entry.names.push(r.user_name);
    if (r.user_id === myUserId) entry.mine = true;
    grouped.set(r.emoji, entry);
  }
  if (grouped.size === 0) return null;

  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {[...grouped.entries()].map(([emoji, info]) => (
        <Tooltip key={emoji} delayDuration={150}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onToggle(emoji)}
              aria-label={`${emoji} ${info.count} — toggle reaction`}
              className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs tabular-nums transition-colors ${
                info.mine
                  ? "border-primary/40 bg-primary/10"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              {emoji} {info.count}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-56 text-xs">
            {info.names.join(", ")}
          </TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}
