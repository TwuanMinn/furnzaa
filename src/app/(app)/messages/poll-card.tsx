"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { BarChart3, Check, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/rbac/context";
import { rpcParams } from "@/lib/supabase/types";
import { closePollAction, votePollAction } from "@/lib/messages/advanced-actions";
import { formatDateTime } from "@/lib/format";
import type { MessagePollView } from "@/app/api/messages/groups/[id]/messages/route";

interface PollResultRow {
  option_id: string;
  votes: number;
  voter_names: string[];
}

/**
 * Live poll attached to a chat message. Results come from the poll_results
 * RPC (SECURITY DEFINER): totals for everyone; voter names ONLY for public
 * polls — anonymous voter identities never leave the database. Votes update
 * live via a Realtime subscription on poll_votes.
 */
export function PollCard({
  poll,
  senderId,
  onChanged,
}: {
  poll: MessagePollView;
  senderId: string | null;
  onChanged: () => void;
}) {
  const session = useSession();
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(poll.my_option_ids));
  const [busy, setBusy] = useState<string | null>(null);

  const isOpen = poll.status === "open" && (!poll.closes_at || new Date(poll.closes_at) > new Date());
  const canClose = poll.status === "open" && (senderId === session.id || session.roleKey === "admin");
  const hasVoted = poll.my_option_ids.length > 0;

  const resultsQuery = useQuery({
    queryKey: ["poll-results", poll.id],
    staleTime: 5_000,
    queryFn: async (): Promise<PollResultRow[]> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase.rpc(
        "poll_results",
        rpcParams("poll_results", { p_poll_id: poll.id }),
      );
      if (error) throw new Error(error.message);
      return (data ?? []) as PollResultRow[];
    },
  });

  // LIVE results: any vote in this poll refreshes the bars for everyone.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`poll:${poll.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poll_votes", filter: `poll_id=eq.${poll.id}` },
        () => void queryClient.invalidateQueries({ queryKey: ["poll-results", poll.id] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [poll.id, queryClient]);

  useEffect(() => {
    setSelected(new Set(poll.my_option_ids));
  }, [poll.my_option_ids]);

  const results = resultsQuery.data ?? [];
  const totalVotes = useMemo(() => results.reduce((sum, r) => sum + Number(r.votes), 0), [results]);
  const votesByOption = useMemo(
    () => new Map(results.map((r) => [r.option_id, r])),
    [results],
  );

  async function submitVote(optionIds: string[]) {
    setBusy("vote");
    try {
      const result = await votePollAction(poll.id, optionIds);
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ["poll-results", poll.id] });
        onChanged();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    setBusy("close");
    try {
      const result = await closePollAction(poll.id);
      if (result.ok) {
        toast.success("Poll closed");
        onChanged();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-1.5 w-full max-w-sm rounded-xl border border-border bg-card p-3 text-left">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <BarChart3 className="size-4 shrink-0 text-primary" aria-hidden />
          {poll.question}
        </p>
        {!isOpen ? <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        {poll.poll_type === "single" ? "Single choice" : "Multiple choice"} ·{" "}
        {poll.visibility === "anonymous" ? "anonymous" : "public"} · {totalVotes} vote(s)
        {poll.closes_at && isOpen ? ` · closes ${formatDateTime(poll.closes_at)}` : ""}
        {poll.status === "closed" ? " · closed" : ""}
      </p>

      <ul className="space-y-1.5">
        {poll.options.map((option) => {
          const result = votesByOption.get(option.id);
          const votes = Number(result?.votes ?? 0);
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const mine = poll.my_option_ids.includes(option.id);
          const checked = selected.has(option.id);

          return (
            <li key={option.id}>
              <div className="relative overflow-hidden rounded-md border border-border">
                <motion.div
                  className={`absolute inset-y-0 left-0 ${mine ? "bg-primary/20" : "bg-muted"}`}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  aria-hidden
                />
                <div className="relative flex items-center gap-2 px-2.5 py-1.5 text-sm">
                  {isOpen ? (
                    poll.poll_type === "multiple" ? (
                      <Checkbox
                        id={`poll-${poll.id}-${option.id}`}
                        checked={checked}
                        disabled={busy !== null}
                        onCheckedChange={(value) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (value === true) next.add(option.id);
                            else next.delete(option.id);
                            return next;
                          });
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void submitVote([option.id])}
                        aria-label={`Vote for ${option.label}`}
                        className={`grid size-4 shrink-0 place-items-center rounded-full border ${mine ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}
                      >
                        {mine ? <Check className="size-3" /> : null}
                      </button>
                    )
                  ) : mine ? (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <span className="size-4 shrink-0" aria-hidden />
                  )}
                  <label
                    htmlFor={poll.poll_type === "multiple" && isOpen ? `poll-${poll.id}-${option.id}` : undefined}
                    className="min-w-0 flex-1 truncate"
                  >
                    {option.label}
                  </label>
                  {poll.visibility === "public" && (result?.voter_names.length ?? 0) > 0 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="shrink-0 cursor-help text-xs text-muted-foreground tabular-nums">
                          {votes} · {pct}%
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-56 text-xs">
                        {result!.voter_names.join(", ")}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {votes} · {pct}%
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex items-center gap-2">
        {isOpen && poll.poll_type === "multiple" ? (
          <Button
            size="xs"
            disabled={busy !== null || selected.size === 0}
            onClick={() => void submitVote([...selected])}
          >
            {busy === "vote" ? <Loader2 className="animate-spin" /> : null}
            {hasVoted ? "Change vote" : "Vote"}
          </Button>
        ) : null}
        {canClose ? (
          <Button variant="ghost" size="xs" disabled={busy !== null} onClick={() => void close()}>
            {busy === "close" ? <Loader2 className="animate-spin" /> : <Lock />}
            Close poll
          </Button>
        ) : null}
      </div>
    </div>
  );
}
