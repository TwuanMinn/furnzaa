"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  BadgeCheck,
  ExternalLink,
  Loader2,
  RotateCcw,
  SendHorizontal,
  Star,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/states";
import { getBrowserClient } from "@/lib/supabase/client";
import { asRow } from "@/lib/supabase/types";
import { badgeClass } from "@/lib/badges";
import { formatDate, formatDateTime, formatMoney, initials } from "@/lib/format";
import {
  addFeedbackCommentAction,
  assignFeedbackAction,
  getFeedbackPhotoUrlsAction,
  reopenFeedbackAction,
  resolveFeedbackAction,
} from "@/lib/feedback/actions";

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "blue" },
  in_progress: { label: "In progress", color: "amber" },
  resolved: { label: "Resolved", color: "green" },
  reopened: { label: "Reopened", color: "red" },
};

const SEVERITY_META: Record<string, { label: string; color: string }> = {
  low: { label: "Low severity", color: "slate" },
  medium: { label: "Medium severity", color: "amber" },
  high: { label: "High severity", color: "red" },
};

const NONE = "__none__";
const MENTION_TOKEN = /(?:^|\s)@([\w ]{0,30})$/;

interface HistoryEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  comment: string | null;
  created_at: string;
  users: { full_name: string } | null;
}

interface CommentEntry {
  id: string;
  body: string;
  created_at: string;
  users: { full_name: string } | null;
}

interface FeedbackRecord {
  id: string;
  code: string;
  customer_id: string | null;
  fallback_name: string | null;
  fallback_phone: string | null;
  order_id: string | null;
  rating: number;
  comments: string;
  category: string;
  source_channel: string;
  severity: string;
  status: string;
  assigned_to: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  customers: {
    name: string;
    lifetime_spend_cents: number;
    feedback_count: number;
    avg_rating: number | null;
    customer_tiers: { name: string; badge_color: string } | null;
  } | null;
  orders: { order_code: string } | null;
  feedback_status_history: HistoryEntry[];
  feedback_comments: CommentEntry[];
}

interface Photo {
  id: string;
  url: string;
  fileName: string;
}

/** Load one feedback record with its joins; RLS scopes what the caller can see. */
async function fetchRecord(id: string): Promise<FeedbackRecord> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("customer_feedback")
    .select(
      "id, code, customer_id, fallback_name, fallback_phone, order_id, rating, comments, category, source_channel, severity, status, assigned_to, resolved_by, resolved_at, resolution_note, created_at, " +
        "customers(name, lifetime_spend_cents, feedback_count, avg_rating, customer_tiers(name, badge_color)), " +
        "orders(order_code), " +
        "feedback_status_history(id, from_status, to_status, comment, created_at, users(full_name)), " +
        "feedback_comments(id, body, created_at, users(full_name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = asRow<FeedbackRecord>(data);
  if (!row) throw new Error("Feedback not found or you don't have access to it.");
  return row;
}

/** Filled-star rating, e.g. ★★★★☆ for 4/5. */
function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-3.5",
            n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

/** Highlight @mentions in a rendered comment body. */
function MentionHighlight({ body }: { body: string }) {
  const parts = body.split(/(@[\w][\w ]{0,30})/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <mark key={i} className="rounded bg-primary/15 px-0.5 font-medium text-inherit">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * Feedback detail: header badges, customer context, photos, assignment,
 * status timeline, internal discussion and resolve/reopen actions.
 */
export function FeedbackDetailSheet({
  feedbackId,
  onOpenChange,
  onChanged,
  users,
  me,
  currency = "USD",
}: {
  feedbackId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  users: { id: string; full_name: string }[];
  me: { id: string; canAssign: boolean; canResolve: boolean; canViewAll: boolean };
  currency?: string;
}) {
  const reduce = useReducedMotion();
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const [record, setRecord] = useState<FeedbackRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [lightbox, setLightbox] = useState<Photo | null>(null);

  const [assignee, setAssignee] = useState(NONE);
  const [assigning, setAssigning] = useState(false);

  const [draft, setDraft] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!feedbackId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRecord(null);
    setPhotos([]);
    setLightbox(null);
    setDraft("");
    setMentionQuery(null);
    setAssignee(NONE);
    setResolutionNote("");
    setReopenReason("");
    void fetchRecord(feedbackId)
      .then((row) => {
        if (!cancelled) setRecord(row);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load feedback");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void getFeedbackPhotoUrlsAction(feedbackId).then((result) => {
      if (!cancelled && result.ok) setPhotos(result.data.photos);
    });
    return () => {
      cancelled = true;
    };
  }, [feedbackId]);

  const usersById = useMemo(
    () => new Map(users.map((u) => [u.id, u.full_name] as const)),
    [users],
  );

  const history = useMemo(
    () =>
      record
        ? [...record.feedback_status_history].sort((a, b) => b.created_at.localeCompare(a.created_at))
        : [],
    [record],
  );

  const discussion = useMemo(
    () =>
      record
        ? [...record.feedback_comments].sort((a, b) => a.created_at.localeCompare(b.created_at))
        : [],
    [record],
  );

  /** Re-fetch after a mutation; the record may leave this user's RLS scope. */
  async function reload() {
    if (!feedbackId) return;
    try {
      setRecord(await fetchRecord(feedbackId));
    } catch {
      onOpenChange(false);
    }
    onChanged();
  }

  async function assign() {
    if (!feedbackId || assignee === NONE) return;
    setAssigning(true);
    try {
      const result = await assignFeedbackAction(feedbackId, assignee);
      if (result.ok) {
        toast.success(`Assigned to ${usersById.get(assignee) ?? "teammate"}`);
        setAssignee(NONE);
        await reload();
      } else {
        toast.error(result.error);
      }
    } finally {
      setAssigning(false);
    }
  }

  async function resolve() {
    if (!feedbackId || !resolutionNote.trim()) return;
    setBusy(true);
    try {
      const result = await resolveFeedbackAction(feedbackId, resolutionNote.trim());
      if (result.ok) {
        toast.success("Feedback resolved");
        setResolveOpen(false);
        setResolutionNote("");
        await reload();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!feedbackId || !reopenReason.trim()) return;
    setBusy(true);
    try {
      const result = await reopenFeedbackAction(feedbackId, reopenReason.trim());
      if (result.ok) {
        toast.success("Feedback reopened");
        setReopenOpen(false);
        setReopenReason("");
        await reload();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  // ── Mention autocomplete (track the @token before the caret) ──────────────
  function handleDraftChange(value: string) {
    setDraft(value);
    const caret = composerRef.current?.selectionStart ?? value.length;
    const match = MENTION_TOKEN.exec(value.slice(0, caret));
    setMentionQuery(match ? (match[1] ?? "") : null);
  }

  function insertMention(name: string) {
    const caret = composerRef.current?.selectionStart ?? draft.length;
    const upToCaret = draft.slice(0, caret);
    const replaced = upToCaret.replace(MENTION_TOKEN, (m) =>
      m.startsWith("@") ? `@${name} ` : `${m.charAt(0)}@${name} `,
    );
    setDraft(replaced + draft.slice(caret));
    setMentionQuery(null);
    composerRef.current?.focus();
  }

  const mentionCandidates = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return users
      .filter((u) => u.id !== me.id && u.full_name.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [mentionQuery, users, me.id]);

  async function postComment() {
    if (!feedbackId) return;
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      const mentionedIds = users
        .filter((u) => u.id !== me.id && body.includes(`@${u.full_name}`))
        .map((u) => u.id);
      const result = await addFeedbackCommentAction(feedbackId, body, mentionedIds);
      if (result.ok) {
        toast.success("Comment added");
        setDraft("");
        setMentionQuery(null);
        await reload();
      } else {
        toast.error(result.error);
      }
    } finally {
      setPosting(false);
    }
  }

  const assignedName = record?.assigned_to ? (usersById.get(record.assigned_to) ?? "Unknown user") : null;
  const canResolveThis =
    !!record &&
    record.status !== "resolved" &&
    me.canResolve &&
    (record.assigned_to === me.id || me.canViewAll);
  const canReopenThis = !!record && record.status === "resolved" && me.canResolve;

  return (
    <>
      <Sheet open={!!feedbackId} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {loading ? (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">Loading feedback…</SheetTitle>
                <SheetDescription className="sr-only">Feedback details are loading.</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-32 w-full rounded-lg" />
              </div>
            </>
          ) : error ? (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">Feedback</SheetTitle>
                <SheetDescription className="sr-only">The feedback could not be loaded.</SheetDescription>
              </SheetHeader>
              <ErrorState title="Couldn't load feedback" description={error} />
            </>
          ) : record ? (
            <>
              {/* ── 1 · Header ───────────────────────────────────────────── */}
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2 text-left">
                  <span className="font-mono">{record.code}</span>
                  <StatusBadge
                    status={record.status}
                    label={STATUS_META[record.status]?.label}
                    color={STATUS_META[record.status]?.color}
                  />
                  <StatusBadge
                    status={record.severity}
                    label={SEVERITY_META[record.severity]?.label}
                    color={SEVERITY_META[record.severity]?.color}
                  />
                </SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-2 text-left">
                  <RatingStars rating={record.rating} />
                  <span>Submitted {formatDate(record.created_at)}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5 px-4 pb-6">
                {/* ── 2 · Customer context ─────────────────────────────── */}
                <section className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                      <UserRound className="size-4" aria-hidden />
                    </span>
                    <span className="text-sm font-medium">
                      {record.customers?.name ?? record.fallback_name ?? "Unknown customer"}
                    </span>
                    {record.customers?.customer_tiers ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass(record.customers.customer_tiers.badge_color)}`}
                      >
                        {record.customers.customer_tiers.name}
                      </span>
                    ) : null}
                  </div>
                  {record.customers ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 tabular-nums">
                        {formatMoney(record.customers.lifetime_spend_cents, currency)} lifetime
                      </span>
                      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 tabular-nums">
                        {record.customers.feedback_count} feedback
                      </span>
                      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 tabular-nums">
                        {record.customers.avg_rating != null
                          ? `★ ${record.customers.avg_rating.toFixed(1)} avg`
                          : "no avg rating"}
                      </span>
                    </div>
                  ) : record.fallback_phone ? (
                    <p className="mt-2 text-xs text-muted-foreground">{record.fallback_phone}</p>
                  ) : null}
                  {record.order_id && record.orders ? (
                    <Link
                      href={`/orders/${record.order_id}`}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium hover:bg-accent"
                    >
                      {record.orders.order_code}
                      <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
                    </Link>
                  ) : null}
                </section>

                {/* ── 3 · Photos ───────────────────────────────────────── */}
                {photos.length > 0 ? (
                  <section>
                    <h3 className="mb-2 text-sm font-medium">Photos</h3>
                    <div className="grid grid-cols-4 gap-2">
                      {photos.map((photo) => (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => setLightbox(photo)}
                          className="overflow-hidden rounded-md border border-border focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`View ${photo.fileName}`}
                        >
                          <Image
                            src={photo.url}
                            alt={photo.fileName}
                            width={112}
                            height={112}
                            unoptimized
                            className="aspect-square w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* ── 4 · Customer comments + rating ───────────────────── */}
                <section className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">Customer comments</h3>
                    <RatingStars rating={record.rating} />
                  </div>
                  <p className="text-sm break-words whitespace-pre-wrap">{record.comments}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {record.category} · via {record.source_channel}
                  </p>
                </section>

                {/* ── 5 · Assignment ───────────────────────────────────── */}
                <section className="rounded-lg border border-border p-3">
                  <h3 className="mb-2 text-sm font-medium">Assignment</h3>
                  {assignedName ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarFallback className="text-[10px]">{initials(assignedName)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{assignedName}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Unassigned</p>
                  )}
                  {me.canAssign ? (
                    <div className="mt-2.5 flex items-center gap-2">
                      <Select value={assignee} onValueChange={setAssignee}>
                        <SelectTrigger className="h-8 flex-1" aria-label="Assign to">
                          <SelectValue placeholder="Pick a teammate…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Pick a teammate…</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id} disabled={u.id === record.assigned_to}>
                              {u.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={assigning || assignee === NONE}
                        onClick={() => void assign()}
                      >
                        {assigning ? <Loader2 className="animate-spin" /> : null}
                        Assign
                      </Button>
                    </div>
                  ) : null}
                </section>

                {/* ── 6 · Status timeline ──────────────────────────────── */}
                <section>
                  <h3 className="mb-2 text-sm font-medium">Status timeline</h3>
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
                  ) : (
                    <ol className="relative space-y-5 border-l border-border pl-5">
                      {history.map((entry, index) => (
                        <motion.li
                          key={entry.id}
                          initial={reduce ? false : { opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            duration: 0.2,
                            ease: "easeOut",
                            delay: reduce ? 0 : Math.min(index * 0.04, 0.3),
                          }}
                          className="relative"
                        >
                          <span
                            className="absolute top-1.5 -left-[26px] size-2.5 rounded-full bg-primary ring-4 ring-background"
                            aria-hidden
                          />
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            {entry.from_status ? (
                              <>
                                <StatusBadge
                                  status={entry.from_status}
                                  label={STATUS_META[entry.from_status]?.label}
                                  color={STATUS_META[entry.from_status]?.color}
                                />
                                <span className="text-muted-foreground">→</span>
                              </>
                            ) : null}
                            <StatusBadge
                              status={entry.to_status}
                              label={STATUS_META[entry.to_status]?.label}
                              color={STATUS_META[entry.to_status]?.color}
                            />
                          </div>
                          {entry.comment ? <p className="mt-1 text-sm">{entry.comment}</p> : null}
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatDateTime(entry.created_at)}
                            {entry.users ? ` · ${entry.users.full_name}` : ""}
                          </p>
                        </motion.li>
                      ))}
                    </ol>
                  )}
                </section>

                {/* Resolution note (resolved records) */}
                {record.status === "resolved" && record.resolution_note ? (
                  <section className="rounded-lg border border-border bg-emerald-50/60 p-3 dark:bg-emerald-400/5">
                    <h3 className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                      <BadgeCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      Resolution
                    </h3>
                    <p className="text-sm break-words whitespace-pre-wrap">{record.resolution_note}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {record.resolved_by ? `${usersById.get(record.resolved_by) ?? "Unknown user"} · ` : ""}
                      {formatDateTime(record.resolved_at)}
                    </p>
                  </section>
                ) : null}

                {/* ── 7 · Internal discussion ──────────────────────────── */}
                <section>
                  <h3 className="mb-2 text-sm font-medium">Internal discussion</h3>
                  {discussion.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No internal comments yet — start the discussion below.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {discussion.map((comment) => (
                        <li key={comment.id} className="flex gap-2">
                          <Avatar className="mt-0.5 size-6 shrink-0">
                            <AvatarFallback className="text-[9px]">
                              {initials(comment.users?.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-2.5 py-1.5">
                            <p className="text-xs text-muted-foreground">
                              {comment.users?.full_name ?? "Unknown"} · {formatDateTime(comment.created_at)}
                            </p>
                            <p className="text-sm break-words whitespace-pre-wrap">
                              <MentionHighlight body={comment.body} />
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="relative mt-3">
                    <AnimatePresence>
                      {mentionQuery != null && mentionCandidates.length > 0 ? (
                        <motion.ul
                          initial={reduce ? false : { opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="absolute bottom-full left-0 z-20 mb-1 w-64 rounded-md border border-border bg-popover p-1 shadow-md"
                          role="listbox"
                          aria-label="Mention a teammate"
                        >
                          {mentionCandidates.map((u) => (
                            <li key={u.id}>
                              <button
                                type="button"
                                onClick={() => insertMention(u.full_name)}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                              >
                                <Avatar className="size-5">
                                  <AvatarFallback className="text-[9px]">{initials(u.full_name)}</AvatarFallback>
                                </Avatar>
                                @{u.full_name}
                              </button>
                            </li>
                          ))}
                        </motion.ul>
                      ) : null}
                    </AnimatePresence>
                    <div className="flex items-end gap-2">
                      <Textarea
                        ref={composerRef}
                        value={draft}
                        onChange={(e) => handleDraftChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey && mentionQuery == null) {
                            e.preventDefault();
                            void postComment();
                          }
                          if (e.key === "Escape") setMentionQuery(null);
                        }}
                        placeholder="Add an internal note… (@ to mention)"
                        aria-label="Internal comment"
                        rows={2}
                        className="max-h-32 flex-1 resize-none"
                      />
                      <Button
                        size="icon"
                        aria-label="Post comment"
                        disabled={posting || !draft.trim()}
                        onClick={() => void postComment()}
                      >
                        {posting ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
                      </Button>
                    </div>
                  </div>
                </section>

                {/* ── 8 · Footer actions ───────────────────────────────── */}
                {canResolveThis || canReopenThis ? (
                  <div className="flex gap-2 border-t border-border pt-4">
                    {canResolveThis ? (
                      <Button className="flex-1" onClick={() => setResolveOpen(true)}>
                        <BadgeCheck /> Resolve
                      </Button>
                    ) : null}
                    {canReopenThis ? (
                      <Button variant="outline" className="flex-1" onClick={() => setReopenOpen(true)}>
                        <RotateCcw /> Reopen
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">Feedback</SheetTitle>
                <SheetDescription className="sr-only">No feedback selected.</SheetDescription>
              </SheetHeader>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Photo lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 text-sm">{lightbox?.fileName ?? "Photo"}</DialogTitle>
            <DialogDescription className="sr-only">Full-size feedback photo.</DialogDescription>
          </DialogHeader>
          {lightbox ? (
            <Image
              src={lightbox.url}
              alt={lightbox.fileName}
              width={1200}
              height={900}
              unoptimized
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Resolve dialog — requires a resolution note */}
      <Dialog open={resolveOpen} onOpenChange={(open) => !busy && setResolveOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve {record?.code ?? "feedback"}</DialogTitle>
            <DialogDescription>
              A resolution note is required — it is recorded in the status history and shared with
              the submitter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="fb-resolution-note">Resolution note</Label>
            <Textarea
              id="fb-resolution-note"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
              placeholder="What was done to resolve this feedback?"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setResolveOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !resolutionNote.trim()} onClick={() => void resolve()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Resolve feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen dialog — requires a reason */}
      <Dialog open={reopenOpen} onOpenChange={(open) => !busy && setReopenOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reopen {record?.code ?? "feedback"}</DialogTitle>
            <DialogDescription>
              Explain why this feedback needs another look — the reason is recorded in the status
              history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="fb-reopen-reason">Reason</Label>
            <Textarea
              id="fb-reopen-reason"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              rows={3}
              placeholder="Why is this being reopened?"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setReopenOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !reopenReason.trim()} onClick={() => void reopen()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Reopen feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
