"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateSecurityConfigAction } from "@/lib/settings/actions";
import type { SecurityData } from "./types";

/**
 * Org security configuration: password policy, session handling and sign-in
 * lockout. One save submits all three cards via updateSecurityConfigAction.
 */
export function SecuritySection({ data, canEdit }: { data: SecurityData; canEdit: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Password policy
  const [minLength, setMinLength] = useState(String(data.minLength));
  const [requireUpper, setRequireUpper] = useState(data.requireUpper);
  const [requireNumber, setRequireNumber] = useState(data.requireNumber);
  const [requireSymbol, setRequireSymbol] = useState(data.requireSymbol);

  // Sessions
  const [sessionTimeoutMin, setSessionTimeoutMin] = useState(String(data.sessionTimeoutMin));
  const [twoFactorRequired, setTwoFactorRequired] = useState(data.twoFactorRequired);

  // Sign-in protection
  const [loginAttemptLimit, setLoginAttemptLimit] = useState(String(data.loginAttemptLimit));
  const [lockoutMinutes, setLockoutMinutes] = useState(String(data.lockoutMinutes));

  const limitDisplay = loginAttemptLimit.trim() || String(data.loginAttemptLimit);
  const lockoutDisplay = lockoutMinutes.trim() || String(data.lockoutMinutes);

  async function save() {
    setSaving(true);
    try {
      const res = await updateSecurityConfigAction({
        minLength: Number(minLength),
        requireUpper,
        requireNumber,
        requireSymbol,
        sessionTimeoutMin: Number(sessionTimeoutMin),
        twoFactorRequired,
        loginAttemptLimit: Number(loginAttemptLimit),
        lockoutMinutes: Number(lockoutMinutes),
      });
      if (res.ok) {
        toast.success("Security settings saved");
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
          <CardTitle className="text-base">Password policy</CardTitle>
          <CardDescription>Checked on every password change and reset.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sec-min-length">Minimum length</Label>
              <Input
                id="sec-min-length"
                type="number"
                min={6}
                max={64}
                step={1}
                value={minLength}
                onChange={(e) => setMinLength(e.target.value)}
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground">Between 6 and 64 characters.</p>
            </div>
          </div>
          <div className="space-y-2.5 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="sec-require-upper" className="font-normal">
                Require an uppercase letter
              </Label>
              <Switch
                id="sec-require-upper"
                checked={requireUpper}
                onCheckedChange={setRequireUpper}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sec-require-number" className="font-normal">
                Require a number
              </Label>
              <Switch
                id="sec-require-number"
                checked={requireNumber}
                onCheckedChange={setRequireNumber}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sec-require-symbol" className="font-normal">
                Require a symbol
              </Label>
              <Switch
                id="sec-require-symbol"
                checked={requireSymbol}
                onCheckedChange={setRequireSymbol}
                disabled={!canEdit}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessions</CardTitle>
          <CardDescription>How long signed-in sessions stay alive when idle.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sec-session-timeout">Session timeout (minutes)</Label>
              <Input
                id="sec-session-timeout"
                type="number"
                min={5}
                max={10080}
                step={1}
                value={sessionTimeoutMin}
                onChange={(e) => setSessionTimeoutMin(e.target.value)}
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground">
                Idle sessions are signed out after this many minutes
              </p>
            </div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="sec-two-factor" className="font-normal">
                Require two-factor authentication
              </Label>
              <Switch
                id="sec-two-factor"
                checked={twoFactorRequired}
                onCheckedChange={setTwoFactorRequired}
                disabled={!canEdit}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Stored for rollout — enforcement ships with an MFA provider.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign-in protection</CardTitle>
          <CardDescription>Throttle repeated failed sign-in attempts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sec-attempt-limit">Failed attempt limit</Label>
              <Input
                id="sec-attempt-limit"
                type="number"
                min={3}
                max={20}
                step={1}
                value={loginAttemptLimit}
                onChange={(e) => setLoginAttemptLimit(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sec-lockout-minutes">Lockout duration (minutes)</Label>
              <Input
                id="sec-lockout-minutes"
                type="number"
                min={1}
                max={1440}
                step={1}
                value={lockoutMinutes}
                onChange={(e) => setLockoutMinutes(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            After {limitDisplay} failed attempts within the window, sign-in is blocked for{" "}
            {lockoutDisplay} minutes and Admins are alerted.
          </p>
        </CardContent>
      </Card>

      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving || !canEdit}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      ) : null}
    </div>
  );
}
