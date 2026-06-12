"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { composeNotificationAction } from "@/lib/notifications/actions";

interface ComposeNotificationButtonProps {
  users: { id: string; full_name: string }[];
}

/** Admin compose & send — to all users, one role, or hand-picked users. */
export function ComposeNotificationButton({ users }: ComposeNotificationButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<"all" | "role" | "users">("all");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [selectedUsers, setSelectedUsers] = useState<ReadonlySet<string>>(new Set());
  const [sending, setSending] = useState(false);

  function reset() {
    setTitle("");
    setBody("");
    setAudienceType("all");
    setRole("staff");
    setSelectedUsers(new Set());
  }

  async function send() {
    if (title.trim().length < 2) {
      toast.error("Add a title");
      return;
    }
    if (audienceType === "users" && selectedUsers.size === 0) {
      toast.error("Pick at least one recipient");
      return;
    }
    setSending(true);
    try {
      const result = await composeNotificationAction({
        title: title.trim(),
        body: body.trim(),
        audience:
          audienceType === "all"
            ? { type: "all" }
            : audienceType === "role"
              ? { type: "role", role }
              : { type: "users", userIds: [...selectedUsers] },
      });
      if (result.ok) {
        toast.success(`Sent to ${result.recipients} recipient(s)`);
        setOpen(false);
        reset();
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      } else {
        toast.error(result.error);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Megaphone /> Compose
      </Button>
      <Dialog open={open} onOpenChange={(o) => !sending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send a notification</DialogTitle>
            <DialogDescription>
              Recipients see it instantly in their bell and notification center.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cn-title">Title</Label>
              <Input
                id="cn-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={300}
                placeholder="e.g. Inventory count this Friday"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cn-body">Message (optional)</Label>
              <Textarea
                id="cn-body"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={4000}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cn-audience">Send to</Label>
              <Select value={audienceType} onValueChange={(v) => setAudienceType(v as typeof audienceType)}>
                <SelectTrigger id="cn-audience" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  <SelectItem value="role">Everyone in a role</SelectItem>
                  <SelectItem value="users">Specific users</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {audienceType === "role" ? (
              <div className="space-y-1.5">
                <Label htmlFor="cn-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "admin" | "staff")}>
                  <SelectTrigger id="cn-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {audienceType === "users" ? (
              <div className="space-y-1.5">
                <Label>Recipients ({selectedUsers.size})</Label>
                <ScrollArea className="h-40 rounded-md border p-2">
                  <ul className="space-y-1">
                    {users.map((u) => (
                      <li key={u.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`cn-user-${u.id}`}
                          checked={selectedUsers.has(u.id)}
                          onCheckedChange={(checked) => {
                            setSelectedUsers((prev) => {
                              const next = new Set(prev);
                              if (checked === true) next.add(u.id);
                              else next.delete(u.id);
                              return next;
                            });
                          }}
                        />
                        <Label htmlFor={`cn-user-${u.id}`} className="font-normal">
                          {u.full_name}
                        </Label>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={() => void send()} disabled={sending}>
              {sending ? <Loader2 className="animate-spin" /> : null}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
