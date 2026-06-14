"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Loader2, Send, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How many orders this month, by priority?",
  "What are our member levels and how many in each?",
  "How's revenue this week?",
  "Any products low on stock?",
  "Summarize customer feedback.",
];

/**
 * Dashboard AI chat box. Ask the system anything in natural language — the
 * server runs a permission-scoped tool loop and returns a direct answer, so you
 * don't have to navigate around tallying numbers yourself.
 */
export function AssistantPanel() {
  const reduce = useReducedMotion();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToEnd() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    });
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setNotice(null);
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    scrollToEnd();
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; data: { answer: string } }
        | { ok: false; error: string; code?: string }
        | null;
      if (body && body.ok) {
        setMessages((m) => [...m, { role: "assistant", content: body.data.answer }]);
      } else {
        const msg = body && !body.ok ? body.error : `Request failed (${res.status})`;
        if (body && !body.ok && body.code === "not_configured") {
          setNotice(msg);
        } else {
          setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${msg}` }]);
        }
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ Couldn't reach the assistant. Try again." }]);
    } finally {
      setBusy(false);
      scrollToEnd();
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" aria-hidden /> Ask Furnza
        </CardTitle>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={scrollRef}
          className="max-h-[300px] min-h-[120px] space-y-3 overflow-y-auto pr-1"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Ask about orders, revenue, customers and member levels, feedback, inventory,
                the print schedule, or settings — and get a direct answer.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void ask(s)}
                    disabled={busy}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <motion.div
                key={i}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-muted/40",
                  )}
                >
                  {m.content}
                </div>
              </motion.div>
            ))
          )}
          {busy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Thinking…
            </div>
          ) : null}
        </div>

        {notice ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            {notice}
          </p>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your system…"
            disabled={busy}
            aria-label="Ask the assistant"
            maxLength={4000}
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
