"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { MessagesSquare, Pin, Plus, Search, Star, UsersRound, X } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/states";
import { Can, useSession } from "@/lib/rbac/context";
import { getBrowserClient } from "@/lib/supabase/client";
import { asRows } from "@/lib/supabase/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { initials, truncate } from "@/lib/format";
import { togglePinnedConversationAction } from "@/lib/messages/advanced-actions";
import type { ConversationRow } from "@/app/api/messages/groups/route";
import type { MessagingSearchResults } from "@/app/api/messages/search/route";
import { ChatThread } from "./chat-thread";
import { NewDirectDialog, NewGroupDialog } from "./messages-dialogs";
import { StarredPanel } from "./advanced-dialogs";

export interface Person {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export function MessagesClient({
  people,
  initialGroupId,
  reactionEmojis,
}: {
  people: Person[];
  initialGroupId: string | null;
  reactionEmojis: string[];
}) {
  const session = useSession();
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(initialGroupId);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [newDirectOpen, setNewDirectOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [starredOpen, setStarredOpen] = useState(false);
  const [pinBusyId, setPinBusyId] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["messages", "conversations"],
    staleTime: 15_000,
    queryFn: async (): Promise<ConversationRow[]> => {
      const res = await fetch("/api/messages/groups");
      const body = (await res.json()) as { ok: boolean; data?: { conversations: ConversationRow[] } };
      if (!body.ok || !body.data) throw new Error("Failed to load conversations");
      return body.data.conversations;
    },
  });

  // Personal pinned conversations — sort MY pins to the top of MY list.
  const pinnedQuery = useQuery({
    queryKey: ["messages", "pinned-conversations"],
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const supabase = getBrowserClient();
      const { data } = await supabase.from("pinned_conversations").select("group_id").limit(100);
      return new Set(asRows<{ group_id: string }>(data).map((r) => r.group_id));
    },
  });
  const pinnedSet = pinnedQuery.data ?? new Set<string>();

  async function togglePinConversation(groupId: string) {
    setPinBusyId(groupId);
    try {
      const result = await togglePinnedConversationAction(groupId);
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ["messages", "pinned-conversations"] });
      } else {
        toast.error(result.error);
      }
    } finally {
      setPinBusyId(null);
    }
  }

  const searchQuery = useQuery({
    queryKey: ["messages", "search", debouncedSearch],
    enabled: debouncedSearch.length >= 2,
    queryFn: async (): Promise<MessagingSearchResults> => {
      const res = await fetch(`/api/messages/search?q=${encodeURIComponent(debouncedSearch)}`);
      const body = (await res.json()) as { ok: boolean; data?: MessagingSearchResults };
      if (!body.ok || !body.data) throw new Error("Search failed");
      return body.data;
    },
  });

  // One realtime subscription for the whole module: any new message I'm
  // allowed to see refreshes the list (and the open thread invalidates too).
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`messages:${session.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session.id, queryClient]);

  // Pinned conversations float to the top of the viewer's list (personal).
  const conversations = useMemo(() => {
    const raw = conversationsQuery.data ?? [];
    return [...raw].sort((a, b) => {
      const ap = pinnedSet.has(a.group_id) ? 1 : 0;
      const bp = pinnedSet.has(b.group_id) ? 1 : 0;
      return bp - ap;
    });
  }, [conversationsQuery.data, pinnedSet]);
  const selected = useMemo(
    () => conversations.find((c) => c.group_id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const searching = debouncedSearch.length >= 2;

  function conversationName(c: ConversationRow): string {
    return c.type === "direct" ? (c.other_name ?? "Direct message") : (c.name ?? "Group");
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Conversation list ────────────────────────────────────────────── */}
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col border-r border-border md:w-80",
          selectedId && "hidden md:flex",
        )}
      >
        <div className="space-y-2.5 border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Messages</h1>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Starred messages"
                onClick={() => setStarredOpen(true)}
              >
                <Star />
              </Button>
              <Can permission="messages.create_group">
                <Button variant="outline" size="icon-sm" aria-label="New group" onClick={() => setNewGroupOpen(true)}>
                  <UsersRound />
                </Button>
              </Can>
              <Can permission="messages.send">
                <Button size="icon-sm" aria-label="New direct message" onClick={() => setNewDirectOpen(true)}>
                  <Plus />
                </Button>
              </Can>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations & messages…"
              aria-label="Search messages"
              className="h-9 pl-8"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {searching ? (
            <SearchResults
              results={searchQuery.data}
              loading={searchQuery.isLoading}
              onPick={(groupId) => {
                setSelectedId(groupId);
                setSearch("");
              }}
            />
          ) : conversationsQuery.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="No conversations yet"
              description="Start a direct message — or ask an admin to add you to a group."
            />
          ) : (
            <ul className="p-1.5">
              <AnimatePresence initial={false}>
                {conversations.map((c) => (
                  <motion.li
                    key={c.group_id}
                    layout={reduce ? false : "position"}
                    initial={reduce ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.group_id)}
                      className={cn(
                        "group/conv flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        selectedId === c.group_id && "bg-accent",
                      )}
                    >
                      {c.type === "direct" ? (
                        <Avatar className="size-10">
                          <AvatarImage src={c.other_avatar_url ?? undefined} alt="" />
                          <AvatarFallback>{initials(c.other_name)}</AvatarFallback>
                        </Avatar>
                      ) : (
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                          <UsersRound className="size-5" aria-hidden />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn("flex min-w-0 items-center gap-1 truncate text-sm", c.unread_count > 0 && "font-semibold")}>
                            {pinnedSet.has(c.group_id) ? (
                              <Pin className="size-3 shrink-0 fill-current text-primary" aria-label="Pinned" />
                            ) : null}
                            <span className="truncate">{conversationName(c)}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <Pin
                              role="button"
                              aria-label={pinnedSet.has(c.group_id) ? "Unpin conversation" : "Pin conversation"}
                              className={cn(
                                "size-3 cursor-pointer opacity-0 transition-opacity group-hover/conv:opacity-100 hover:text-primary",
                                pinBusyId === c.group_id && "opacity-50",
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                void togglePinConversation(c.group_id);
                              }}
                            />
                            {c.last_at ? (
                              <span className="text-[11px] text-muted-foreground">
                                {formatDistanceToNowStrict(new Date(c.last_at))}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">
                            {c.last_deleted
                              ? "Message deleted"
                              : c.last_body
                                ? `${c.last_sender_name ? `${c.last_sender_name.split(" ")[0]}: ` : ""}${truncate(c.last_body, 40)}`
                                : "No messages yet"}
                          </span>
                          <AnimatePresence>
                            {c.unread_count > 0 ? (
                              <motion.span
                                initial={reduce ? false : { scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={reduce ? { opacity: 0 } : { scale: 0 }}
                                className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] leading-4 font-medium text-primary-foreground"
                              >
                                {c.unread_count > 99 ? "99+" : c.unread_count}
                              </motion.span>
                            ) : null}
                          </AnimatePresence>
                        </span>
                      </span>
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </aside>

      {/* ── Thread ───────────────────────────────────────────────────────── */}
      <section className={cn("min-w-0 flex-1", !selectedId && "hidden md:block")}>
        {selected ? (
          <ChatThread
            key={selected.group_id}
            conversation={selected}
            people={people}
            conversations={conversations}
            reactionEmojis={reactionEmojis}
            onBack={() => setSelectedId(null)}
            onLeftGroup={() => {
              setSelectedId(null);
              void queryClient.invalidateQueries({ queryKey: ["messages"] });
            }}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <EmptyState
              icon={MessagesSquare}
              title="Pick a conversation"
              description="Choose a group or direct message from the list to start chatting."
            />
          </div>
        )}
      </section>

      <NewDirectDialog
        open={newDirectOpen}
        onOpenChange={setNewDirectOpen}
        people={people}
        onStarted={(groupId) => {
          setSelectedId(groupId);
          void queryClient.invalidateQueries({ queryKey: ["messages"] });
        }}
      />
      <NewGroupDialog
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
        people={people}
        onCreated={(groupId) => {
          setSelectedId(groupId);
          void queryClient.invalidateQueries({ queryKey: ["messages"] });
        }}
      />
      <StarredPanel open={starredOpen} onOpenChange={setStarredOpen} onJump={setSelectedId} />
    </div>
  );
}

function SearchResults({
  results,
  loading,
  onPick,
}: {
  results: MessagingSearchResults | undefined;
  loading: boolean;
  onPick: (groupId: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (!results || (results.conversations.length === 0 && results.messages.length === 0)) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matches.</p>;
  }
  return (
    <div className="p-1.5">
      {results.conversations.length > 0 ? (
        <>
          <p className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">Conversations</p>
          {results.conversations.map((c) => (
            <button
              key={c.group_id}
              type="button"
              onClick={() => onPick(c.group_id)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
            >
              <UsersRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate font-medium">
                {c.type === "direct" ? c.other_name : c.name}
              </span>
            </button>
          ))}
        </>
      ) : null}
      {results.messages.length > 0 ? (
        <>
          <p className="px-2.5 pt-3 pb-1 text-xs font-medium text-muted-foreground">Messages</p>
          {results.messages.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPick(m.group_id)}
              className="w-full rounded-md px-2.5 py-2 text-left hover:bg-accent"
            >
              <span className="block truncate text-sm">{truncate(m.body, 60)}</span>
              <span className="block text-xs text-muted-foreground">
                {m.sender?.full_name ?? "Unknown"} ·{" "}
                {m.message_groups?.name ?? "Direct message"} ·{" "}
                {formatDistanceToNowStrict(new Date(m.created_at), { addSuffix: true })}
              </span>
            </button>
          ))}
        </>
      ) : null}
    </div>
  );
}
