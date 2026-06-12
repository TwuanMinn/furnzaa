"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinViaInviteAction } from "@/lib/messages/advanced-actions";

/**
 * Invite-link join flow: explicit "Join group" click, with a password step
 * when the action returns the "password_required" sentinel. On success we
 * land directly in the conversation.
 */
export function JoinClient({ token }: { token: string }) {
  const router = useRouter();
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await joinViaInviteAction(token, needsPassword ? password : undefined);
      if (result.ok) {
        toast.success(`Joined ${result.data.groupName}`);
        router.replace(`/messages?group=${result.data.groupId}`);
        return;
      }
      if (result.error === "password_required") {
        setNeedsPassword(true);
      } else {
        setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound className="size-5" aria-hidden />
          Group invite
        </CardTitle>
        <CardDescription>
          {needsPassword
            ? "This invite link is protected. Enter the password to join."
            : "You've been invited to join a group conversation."}
        </CardDescription>
      </CardHeader>
      {needsPassword ? (
        <CardContent>
          <form
            id="invite-password-form"
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
            className="space-y-2"
          >
            <Label htmlFor="invite-password">Password</Label>
            <Input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </form>
        </CardContent>
      ) : null}
      <CardFooter className="flex-col items-stretch gap-2">
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button
          type={needsPassword ? "submit" : "button"}
          form={needsPassword ? "invite-password-form" : undefined}
          onClick={needsPassword ? undefined : () => void join()}
          disabled={busy || (needsPassword && password.length === 0)}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : needsPassword ? (
            <KeyRound className="size-4" aria-hidden />
          ) : null}
          Join group
        </Button>
        <Button variant="ghost" onClick={() => router.push("/messages")} disabled={busy}>
          Back to messages
        </Button>
      </CardFooter>
    </Card>
  );
}
