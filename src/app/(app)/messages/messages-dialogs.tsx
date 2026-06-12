"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSession } from "@/lib/rbac/context";
import { createGroupAction, startDirectConversationAction } from "@/lib/messages/actions";
import { initials } from "@/lib/format";
import type { Person } from "./messages-client";

/** Shared people list with a local filter box. */
function PeoplePicker({
  people,
  exclude,
  query,
  onQueryChange,
  children,
}: {
  people: Person[];
  exclude?: string;
  query: string;
  onQueryChange: (q: string) => void;
  children: (visible: Person[]) => React.ReactNode;
}) {
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => p.id !== exclude)
      .filter((p) => !q || p.full_name.toLowerCase().includes(q));
  }, [people, exclude, query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search people…"
          aria-label="Search people"
          className="h-9 pl-8"
        />
      </div>
      <ScrollArea className="h-52 rounded-md border">
        {visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">No people found.</p>
        ) : (
          children(visible)
        )}
      </ScrollArea>
    </div>
  );
}

/** Start (or reuse) a 1:1 conversation. */
export function NewDirectDialog({
  open,
  onOpenChange,
  people,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: Person[];
  onStarted: (groupId: string) => void;
}) {
  const session = useSession();
  const [query, setQuery] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);

  async function start(personId: string) {
    setStartingId(personId);
    try {
      const result = await startDirectConversationAction(personId);
      if (result.ok) {
        onOpenChange(false);
        setQuery("");
        onStarted(result.data.groupId);
      } else {
        toast.error(result.error);
      }
    } finally {
      setStartingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !startingId && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New direct message</DialogTitle>
          <DialogDescription>Pick a teammate to start a private conversation.</DialogDescription>
        </DialogHeader>

        <PeoplePicker people={people} exclude={session.id} query={query} onQueryChange={setQuery}>
          {(visible) => (
            <ul className="p-1.5">
              {visible.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => void start(p.id)}
                    disabled={startingId !== null}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
                  >
                    <Avatar className="size-8">
                      <AvatarImage src={p.avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="text-xs">{initials(p.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm">{p.full_name}</span>
                    {startingId === p.id ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PeoplePicker>
      </DialogContent>
    </Dialog>
  );
}

/** Admin-only: create a named group and add members. */
export function NewGroupDialog({
  open,
  onOpenChange,
  people,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: Person[];
  onCreated: (groupId: string) => void;
}) {
  const session = useSession();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [creating, setCreating] = useState(false);

  function reset() {
    setName("");
    setQuery("");
    setSelected(new Set());
  }

  async function create() {
    if (name.trim().length < 2) {
      toast.error("Give the group a name");
      return;
    }
    if (selected.size === 0) {
      toast.error("Add at least one member");
      return;
    }
    setCreating(true);
    try {
      const result = await createGroupAction({ name: name.trim(), memberIds: [...selected] });
      if (result.ok) {
        toast.success(`Group “${name.trim()}” created`);
        onOpenChange(false);
        reset();
        onCreated(result.data.groupId);
      } else {
        toast.error(result.error);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !creating && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Name the group and add members — you&apos;re included automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ng-name">Group name</Label>
            <Input
              id="ng-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Print Floor"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Members ({selected.size})</Label>
            <PeoplePicker people={people} exclude={session.id} query={query} onQueryChange={setQuery}>
              {(visible) => (
                <ul className="space-y-0.5 p-1.5">
                  {visible.map((p) => (
                    <li key={p.id} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-accent">
                      <Checkbox
                        id={`ng-member-${p.id}`}
                        checked={selected.has(p.id)}
                        onCheckedChange={(checked) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (checked === true) next.add(p.id);
                            else next.delete(p.id);
                            return next;
                          });
                        }}
                      />
                      <Label
                        htmlFor={`ng-member-${p.id}`}
                        className="flex min-w-0 flex-1 items-center gap-2 font-normal"
                      >
                        <Avatar className="size-7">
                          <AvatarImage src={p.avatar_url ?? undefined} alt="" />
                          <AvatarFallback className="text-[10px]">{initials(p.full_name)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm">{p.full_name}</span>
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
            </PeoplePicker>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={creating}>
            {creating ? <Loader2 className="animate-spin" /> : null}
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
