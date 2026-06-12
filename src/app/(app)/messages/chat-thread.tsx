"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  AlarmClock,
  ArrowLeft,
  BarChart3,
  CalendarRange,
  Check,
  CornerUpLeft,
  Download,
  FileText,
  Forward,
  Link2,
  Loader2,
  LogOut,
  MoreVertical,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  SendHorizontal,
  SmilePlus,
  Star,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession, usePermissions, Can } from "@/lib/rbac/context";
import { getBrowserClient } from "@/lib/supabase/client";
import { asRows } from "@/lib/supabase/types";
import { formatDateTime, initials } from "@/lib/format";
import {
  deleteMessageAction,
  editMessageAction,
  getAttachmentUrlAction,
  markGroupReadAction,
  sendMessageAction,
  updateGroupMembersAction,
} from "@/lib/messages/actions";
import {
  notifyMentionsAction,
  togglePinMessageAction,
  toggleReactionAction,
  toggleStarAction,
} from "@/lib/messages/advanced-actions";
import type { ConversationRow } from "@/app/api/messages/groups/route";
import type { MessageRowView } from "@/app/api/messages/groups/[id]/messages/route";
import type { CursorPage } from "@/lib/datatable/types";
import type { Person } from "./messages-client";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PollCard } from "./poll-card";
import {
  DeleteGroupDialog,
  ForwardDialog,
  InviteLinksDialog,
  LeaveGroupDialog,
  PollCreateDialog,
  ReactionChips,
  ScheduleDialog,
} from "./advanced-dialogs";

const UPLOAD_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf",
  "text/plain", "text/csv", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_EMOJIS = ["❤️", "😆", "😮", "😢", "👍", "👎"];

interface PendingFile {
  file: File;
  id: string;
}

export function ChatThread({
  conversation,
  people,
  conversations,
  reactionEmojis = DEFAULT_EMOJIS,
  onBack,
  onLeftGroup,
}: {
  conversation: ConversationRow;
  people: Person[];
  conversations: ConversationRow[];
  reactionEmojis?: string[];
  onBack: () => void;
  onLeftGroup: () => void;
}) {
  const session = useSession();
  const { has } = usePermissions();
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [replyTo, setReplyTo] = useState<MessageRowView | null>(null);
  const [forwardingId, setForwardingId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pollOpen, setPollOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const groupId = conversation.group_id;
  const title =
    conversation.type === "direct"
      ? (conversation.other_name ?? "Direct message")
      : (conversation.name ?? "Group");

  const query = useInfiniteQuery({
    queryKey: ["messages", "thread", groupId, dateFrom, dateTo],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }): Promise<CursorPage<MessageRowView>> => {
      const params = new URLSearchParams({ limit: "30" });
      if (pageParam) params.set("cursor", pageParam);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/messages/groups/${groupId}/messages?${params}`, { signal });
      const body = (await res.json()) as { ok: boolean; data?: CursorPage<MessageRowView>; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load messages");
      return body.data;
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const messages = useMemo(
    () => [...(query.data?.pages.flatMap((p) => p.rows) ?? [])].reverse(),
    [query.data],
  );

  // Group members (mention autocomplete) — RLS-scoped, tiny.
  const membersQuery = useQuery({
    queryKey: ["group-members", groupId],
    staleTime: 60_000,
    queryFn: async (): Promise<Person[]> => {
      const supabase = getBrowserClient();
      const { data } = await supabase
        .from("group_members")
        .select("users(id, full_name, avatar_url)")
        .eq("group_id", groupId)
        .limit(100);
      return asRows<{ users: Person | null }>(data)
        .map((r) => r.users)
        .filter(Boolean) as Person[];
    },
  });
  const members = membersQuery.data ?? [];

  // Pinned bar: group-wide pins with message previews (bounded).
  const pinsQuery = useQuery({
    queryKey: ["message-pins", groupId],
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = getBrowserClient();
      const { data } = await supabase
        .from("message_pins")
        .select("id, message_id, messages(body, deleted, sender:users!messages_sender_id_fkey(full_name))")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(10);
      return asRows<{
        id: string;
        message_id: string;
        messages: { body: string; deleted: boolean; sender: { full_name: string } | null } | null;
      }>(data);
    },
  });

  function invalidateThread() {
    void queryClient.invalidateQueries({ queryKey: ["messages", "thread", groupId] });
    void queryClient.invalidateQueries({ queryKey: ["message-pins", groupId] });
  }

  // Live reactions + pins for this thread (messages themselves are covered by
  // the module-wide subscription in messages-client).
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`thread-extras:${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () =>
        invalidateThread(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "message_pins" }, () =>
        invalidateThread(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Mark read when the thread opens or new messages arrive while open.
  useEffect(() => {
    if (messages.length === 0) return;
    void markGroupReadAction(groupId).then(() =>
      queryClient.invalidateQueries({ queryKey: ["messages", "conversations"] }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages.length, reduce]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: PendingFile[] = [];
    for (const file of Array.from(files)) {
      if (!UPLOAD_TYPES.includes(file.type)) {
        toast.error(`${file.name}: file type not allowed`);
        continue;
      }
      if (file.size > UPLOAD_MAX_BYTES) {
        toast.error(`${file.name}: larger than 25 MB`);
        continue;
      }
      next.push({ file, id: crypto.randomUUID() });
    }
    setPending((prev) => [...prev, ...next].slice(0, 10));
  }

  // ── Mention autocomplete ───────────────────────────────────────────────────
  function handleDraftChange(value: string) {
    setDraft(value);
    const caret = composerRef.current?.selectionStart ?? value.length;
    const upToCaret = value.slice(0, caret);
    const match = /(?:^|\s)@([\w ]{0,30})$/.exec(upToCaret);
    setMentionQuery(match ? (match[1] ?? "") : null);
  }

  function insertMention(name: string) {
    const caret = composerRef.current?.selectionStart ?? draft.length;
    const upToCaret = draft.slice(0, caret);
    const replaced = upToCaret.replace(/(^|\s)@([\w ]{0,30})$/, `$1@${name} `);
    setDraft(replaced + draft.slice(caret));
    setMentionQuery(null);
    composerRef.current?.focus();
  }

  const mentionCandidates = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    const list = members.filter(
      (m) => m.id !== session.id && m.full_name.toLowerCase().startsWith(q),
    );
    const all = "all".startsWith(q) ? [{ id: "__all__", full_name: "all", avatar_url: null }] : [];
    return [...all, ...list].slice(0, 6);
  }, [mentionQuery, members, session.id]);

  async function send() {
    const body = draft.trim();
    if (!body && pending.length === 0) return;
    setSending(true);
    try {
      const supabase = getBrowserClient();
      const uploaded: { path: string; name: string; mimeType: string; sizeBytes: number }[] = [];
      for (const p of pending) {
        const safeName = p.file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
        const path = `${session.id}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage.from("attachments").upload(path, p.file, {
          contentType: p.file.type,
        });
        if (error) throw new Error(`${p.file.name}: ${error.message}`);
        uploaded.push({ path, name: p.file.name, mimeType: p.file.type, sizeBytes: p.file.size });
      }

      const result = await sendMessageAction({
        groupId,
        body,
        attachments: uploaded,
        replyToMessageId: replyTo?.id ?? null,
      });
      if (!result.ok) throw new Error(result.error);

      // Resolve typed @mentions against member names (+ @all).
      const mentionAll = /(^|\s)@all\b/.test(body);
      const mentionedIds = members
        .filter((m) => m.id !== session.id && body.includes(`@${m.full_name}`))
        .map((m) => m.id);
      if (mentionAll || mentionedIds.length > 0) {
        const notifyResult = await notifyMentionsAction(
          groupId,
          result.data.messageId,
          mentionedIds,
          mentionAll,
          body,
        );
        if (!notifyResult.ok) toast.warning(notifyResult.error);
      }

      setDraft("");
      setPending([]);
      setReplyTo(null);
      setMentionQuery(null);
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const result = await editMessageAction(editing.id, editing.body);
    if (result.ok) {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
    } else {
      toast.error(result.error);
    }
  }

  async function remove(messageId: string) {
    const result = await deleteMessageAction(messageId);
    if (result.ok) void queryClient.invalidateQueries({ queryKey: ["messages"] });
    else toast.error(result.error);
  }

  async function download(attachmentId: string) {
    const result = await getAttachmentUrlAction(attachmentId);
    if (result.ok) window.open(result.url, "_blank", "noopener");
    else toast.error(result.error);
  }

  async function react(messageId: string, emoji: string) {
    const result = await toggleReactionAction(messageId, emoji);
    if (!result.ok) toast.error(result.error);
    invalidateThread();
  }

  async function togglePin(messageId: string) {
    const result = await togglePinMessageAction(messageId);
    if (!result.ok) toast.error(result.error);
    invalidateThread();
  }

  async function toggleStar(messageId: string) {
    const result = await toggleStarAction(messageId);
    if (!result.ok) toast.error(result.error);
    invalidateThread();
  }

  function jumpTo(messageId: string) {
    const el = document.querySelector(`[data-mid="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary/50", "rounded-lg");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary/50", "rounded-lg"), 1600);
    } else {
      toast.info("The original message isn't loaded — scroll up to find it.");
    }
  }

  const dateFilterActive = dateFrom || dateTo;
  const pins = pinsQuery.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Back" onClick={onBack}>
          <ArrowLeft />
        </Button>
        {conversation.type === "direct" ? (
          <Avatar className="size-8">
            <AvatarImage src={conversation.other_avatar_url ?? undefined} alt="" />
            <AvatarFallback className="text-xs">{initials(conversation.other_name)}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
            <UsersRound className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {conversation.type === "direct" ? "Direct message" : `${conversation.member_count} members`}
          </p>
        </div>

        {conversation.type === "group" ? (
          <Can permission="messages.manage_group">
            <ManageMembersPopover groupId={groupId} people={people} />
          </Can>
        ) : null}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant={dateFilterActive ? "secondary" : "ghost"} size="icon-sm" aria-label="Filter by date">
              <CalendarRange />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto space-y-3 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="mt-from">From</Label>
              <Input id="mt-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mt-to">To</Label>
              <Input id="mt-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8" />
            </div>
            {dateFilterActive ? (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                Clear filter
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Conversation menu">
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => setScheduleOpen(true)}>
              <AlarmClock /> Schedule message / reminder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPollOpen(true)}>
              <BarChart3 /> Create poll
            </DropdownMenuItem>
            {conversation.type === "group" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setInviteOpen(true)}>
                  <Link2 /> Invite links
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLeaveOpen(true)}>
                  <LogOut /> Leave group…
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 /> Delete group…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* ── Pinned bar ──────────────────────────────────────────────────── */}
      {pins.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-muted/30 px-4 py-1.5">
          <Pin className="size-3.5 shrink-0 text-primary" aria-hidden />
          {pins.map((pin) => (
            <button
              key={pin.id}
              type="button"
              onClick={() => jumpTo(pin.message_id)}
              className="flex max-w-56 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs hover:bg-accent"
            >
              <span className="truncate">
                {pin.messages?.deleted ? "message deleted" : (pin.messages?.body ?? "—")}
              </span>
              <PinOff
                className="size-3 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Unpin"
                onClick={(e) => {
                  e.stopPropagation();
                  void togglePin(pin.message_id);
                }}
              />
            </button>
          ))}
        </div>
      ) : null}

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {query.hasNextPage ? (
          <div className="flex justify-center pb-3">
            <Button variant="outline" size="xs" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              {query.isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}
              Load earlier
            </Button>
          </div>
        ) : null}

        {query.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className={cn("h-14 w-2/3 rounded-xl", i % 2 === 1 && "ml-auto")} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {dateFilterActive ? "No messages in this date range." : "No messages yet — say hi!"}
          </p>
        ) : (
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {messages.map((m) => {
                const own = m.sender_id === session.id;
                const system = m.sender_id === null;
                if (system) {
                  return (
                    <li key={m.id} className="py-1 text-center text-xs text-muted-foreground">
                      {m.body} · {formatDateTime(m.created_at)}
                    </li>
                  );
                }
                return (
                  <motion.li
                    key={m.id}
                    data-mid={m.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className={cn("group flex gap-2.5", own && "flex-row-reverse")}
                  >
                    <Avatar className="mt-0.5 size-8 shrink-0">
                      <AvatarImage src={m.sender?.avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="text-xs">{initials(m.sender?.full_name ?? "?")}</AvatarFallback>
                    </Avatar>
                    <div className={cn("max-w-[75%] min-w-0", own && "text-right")}>
                      <p className="mb-0.5 text-xs text-muted-foreground">
                        {own ? "You" : (m.sender?.full_name ?? "Unknown")} ·{" "}
                        <time dateTime={m.created_at}>{formatDateTime(m.created_at)}</time>
                        {m.edited && !m.deleted ? " · edited" : ""}
                        {m.pinned ? " · 📌" : ""}
                      </p>

                      {m.forwarded && !m.deleted ? (
                        <p className={cn("mb-0.5 flex items-center gap-1 text-xs text-muted-foreground italic", own && "justify-end")}>
                          <Forward className="size-3" aria-hidden /> Forwarded
                        </p>
                      ) : null}

                      {m.reply_preview && !m.deleted ? (
                        <button
                          type="button"
                          onClick={() => m.reply_to_message_id && jumpTo(m.reply_to_message_id)}
                          className={cn(
                            "mb-1 block w-full rounded-md border-l-2 border-primary/60 bg-muted/50 px-2 py-1 text-left text-xs",
                            own && "text-right",
                          )}
                        >
                          <span className="font-medium">{m.reply_preview.sender_name}</span>
                          <span className="block truncate text-muted-foreground">{m.reply_preview.body}</span>
                        </button>
                      ) : null}

                      {m.deleted ? (
                        <p className="inline-block rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground italic">
                          Message deleted
                        </p>
                      ) : editing?.id === m.id ? (
                        <span className="block space-y-1.5 text-left">
                          <Textarea
                            value={editing.body}
                            onChange={(e) => setEditing({ id: m.id, body: e.target.value })}
                            rows={2}
                            autoFocus
                            aria-label="Edit message"
                          />
                          <span className="flex justify-end gap-1.5">
                            <Button variant="ghost" size="xs" onClick={() => setEditing(null)}>
                              <X /> Cancel
                            </Button>
                            <Button size="xs" onClick={() => void saveEdit()}>
                              <Check /> Save
                            </Button>
                          </span>
                        </span>
                      ) : (
                        <>
                          {m.body ? (
                            <p
                              className={cn(
                                "inline-block rounded-xl px-3 py-2 text-left text-sm break-words whitespace-pre-wrap",
                                own ? "bg-primary text-primary-foreground" : "bg-muted",
                              )}
                            >
                              <MentionHighlight body={m.body} />
                            </p>
                          ) : null}

                          {m.poll ? (
                            <PollCard poll={m.poll} senderId={m.sender_id} onChanged={invalidateThread} />
                          ) : null}

                          {m.message_attachments.length > 0 ? (
                            <span className={cn("mt-1.5 flex flex-wrap gap-2", own && "justify-end")}>
                              {m.message_attachments.map((a) =>
                                a.kind === "image" && a.url ? (
                                  <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => void download(a.id)}
                                    className="block overflow-hidden rounded-lg border border-border"
                                    aria-label={`Open ${a.file_name}`}
                                  >
                                    <Image
                                      src={a.url}
                                      alt={a.file_name}
                                      width={208}
                                      height={156}
                                      unoptimized
                                      className="max-h-52 w-auto max-w-52 object-cover"
                                    />
                                  </button>
                                ) : (
                                  <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => void download(a.id)}
                                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                                  >
                                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                    <span className="max-w-40 truncate">{a.file_name}</span>
                                    <Download className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                  </button>
                                ),
                              )}
                            </span>
                          ) : null}

                          <ReactionChips
                            reactions={m.reactions}
                            myUserId={session.id}
                            onToggle={(emoji) => void react(m.id, emoji)}
                          />

                          {/* Hover toolbar */}
                          <span className={cn("mt-0.5 hidden gap-0.5 group-hover:flex", own ? "justify-end" : "justify-start")}>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon-xs" aria-label="Add reaction">
                                  <SmilePlus />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent side="top" className="flex w-auto gap-1 p-1.5">
                                {reactionEmojis.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => void react(m.id, emoji)}
                                    aria-label={`React ${emoji}`}
                                    className="rounded-md px-1.5 py-1 text-lg transition-transform hover:scale-125"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </PopoverContent>
                            </Popover>
                            <Button variant="ghost" size="icon-xs" aria-label="Reply" onClick={() => setReplyTo(m)}>
                              <CornerUpLeft />
                            </Button>
                            <Button variant="ghost" size="icon-xs" aria-label="Forward" onClick={() => setForwardingId(m.id)}>
                              <Forward />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={m.pinned ? "Unpin" : "Pin"}
                              onClick={() => void togglePin(m.id)}
                              className={m.pinned ? "text-primary" : undefined}
                            >
                              {m.pinned ? <PinOff /> : <Pin />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={m.starred ? "Unstar" : "Star"}
                              onClick={() => void toggleStar(m.id)}
                              className={m.starred ? "text-amber-500" : undefined}
                            >
                              <Star className={m.starred ? "fill-current" : undefined} />
                            </Button>
                            {own && m.body ? (
                              <Button variant="ghost" size="icon-xs" aria-label="Edit message" onClick={() => setEditing({ id: m.id, body: m.body })}>
                                <Pencil />
                              </Button>
                            ) : null}
                            {own || has("messages.delete_any") ? (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Delete message"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => void remove(m.id)}
                              >
                                <Trash2 />
                              </Button>
                            ) : null}
                          </span>
                        </>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Composer ────────────────────────────────────────────────────── */}
      <footer className="relative border-t border-border p-3">
        {replyTo ? (
          <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-primary/60 bg-muted/40 px-2.5 py-1.5 text-xs">
            <CornerUpLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              Replying to <span className="font-medium">{replyTo.sender?.full_name ?? "Unknown"}</span>:{" "}
              {replyTo.body.slice(0, 80)}
            </span>
            <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        {pending.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pending.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
                <Paperclip className="size-3 text-muted-foreground" aria-hidden />
                <span className="max-w-40 truncate">{p.file.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${p.file.name}`}
                  onClick={() => setPending((prev) => prev.filter((x) => x.id !== p.id))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {/* Mention autocomplete */}
        <AnimatePresence>
          {mentionQuery != null && mentionCandidates.length > 0 ? (
            <motion.ul
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-full left-3 z-20 mb-1 w-64 rounded-md border border-border bg-popover p-1 shadow-md"
              role="listbox"
              aria-label="Mention a member"
            >
              {mentionCandidates.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => insertMention(m.full_name)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    {m.id === "__all__" ? (
                      <UsersRound className="size-5 text-primary" aria-hidden />
                    ) : (
                      <Avatar className="size-5">
                        <AvatarImage src={m.avatar_url ?? undefined} alt="" />
                        <AvatarFallback className="text-[9px]">{initials(m.full_name)}</AvatarFallback>
                      </Avatar>
                    )}
                    @{m.full_name}
                    {m.id === "__all__" ? (
                      <span className="ml-auto text-xs text-muted-foreground">creator/Admin only</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </motion.ul>
          ) : null}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={UPLOAD_TYPES.join(",")}
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button variant="ghost" size="icon" aria-label="Attach files" disabled={sending} onClick={() => fileInputRef.current?.click()}>
            <Paperclip />
          </Button>
          <Textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && mentionQuery == null) {
                e.preventDefault();
                void send();
              }
              if (e.key === "Escape") setMentionQuery(null);
            }}
            placeholder={`Message ${title}… (@ to mention)`}
            aria-label={`Message ${title}`}
            rows={1}
            className="max-h-32 min-h-9 flex-1 resize-none"
          />
          <Button
            size="icon"
            aria-label="Send message"
            disabled={sending || (!draft.trim() && pending.length === 0)}
            onClick={() => void send()}
          >
            {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </div>
      </footer>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <ForwardDialog
        messageId={forwardingId}
        conversations={conversations}
        currentGroupId={groupId}
        onOpenChange={(open) => !open && setForwardingId(null)}
      />
      <PollCreateDialog groupId={groupId} open={pollOpen} onOpenChange={setPollOpen} onCreated={invalidateThread} />
      <ScheduleDialog groupId={groupId} open={scheduleOpen} onOpenChange={setScheduleOpen} />
      <InviteLinksDialog groupId={groupId} open={inviteOpen} onOpenChange={setInviteOpen} />
      <LeaveGroupDialog
        groupId={groupId}
        groupName={title}
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        onLeft={onLeftGroup}
      />
      <DeleteGroupDialog
        groupId={groupId}
        groupName={title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={onLeftGroup}
      />
    </div>
  );
}

/** Highlight @mentions in a rendered message body. */
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

/** Admin-only: add/remove group members. */
function ManageMembersPopover({ groupId, people }: { groupId: string; people: Person[] }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const [original, setOriginal] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);

  async function load(open: boolean) {
    if (!open) return;
    const supabase = getBrowserClient();
    const { data } = await supabase.from("group_members").select("user_id").eq("group_id", groupId);
    const ids = new Set(((data ?? []) as { user_id: string }[]).map((m) => m.user_id));
    setSelected(ids);
    setOriginal(ids);
  }

  async function save(current: ReadonlySet<string>, base: ReadonlySet<string>) {
    setSaving(true);
    try {
      const addIds = [...current].filter((id) => !base.has(id));
      const removeIds = [...base].filter((id) => !current.has(id));
      if (addIds.length === 0 && removeIds.length === 0) return;
      const result = await updateGroupMembersAction({ groupId, addIds, removeIds });
      if (result.ok) {
        toast.success("Members updated");
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
        void queryClient.invalidateQueries({ queryKey: ["group-members", groupId] });
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover onOpenChange={(open) => void load(open)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Manage members">
          <UsersRound />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2 p-3">
        <p className="text-sm font-medium">Members</p>
        <ScrollArea className="h-48">
          <ul className="space-y-1.5 pr-2">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <Checkbox
                  id={`gm-${p.id}`}
                  checked={selected?.has(p.id) ?? false}
                  onCheckedChange={(checked) => {
                    setSelected((prev) => {
                      const next = new Set(prev ?? []);
                      if (checked === true) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    });
                  }}
                />
                <Label htmlFor={`gm-${p.id}`} className="font-normal">
                  {p.full_name}
                </Label>
              </li>
            ))}
          </ul>
        </ScrollArea>
        <Button
          size="sm"
          className="w-full"
          disabled={saving || !selected}
          onClick={() => selected && void save(selected, original)}
        >
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save members
        </Button>
      </PopoverContent>
    </Popover>
  );
}
