"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/format";
import type { ActivityListRow } from "@/lib/datasets/activity";

/** Read-only entry detail: full summary, target, IP and before/after JSON. */
export function LogDetailSheet({
  entry,
  onOpenChange,
}: {
  entry: ActivityListRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!entry} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {entry ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2 text-left">
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{entry.action}</code>
                <Badge variant="outline">{entry.module}</Badge>
              </SheetTitle>
              <SheetDescription className="text-left">
                {formatDateTime(entry.created_at)} ·{" "}
                {entry.actor?.full_name ?? entry.actor_email ?? "System"}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6 text-sm">
              <p>{entry.summary}</p>

              <dl className="space-y-1.5">
                {entry.target_type ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Target</dt>
                    <dd className="font-mono text-xs">
                      {entry.target_type}
                      {entry.target_id ? `: ${entry.target_id}` : ""}
                    </dd>
                  </div>
                ) : null}
                {entry.ip_address ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">IP address</dt>
                    <dd className="font-mono text-xs">{entry.ip_address}</dd>
                  </div>
                ) : null}
                {entry.actor_email ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Actor email</dt>
                    <dd>{entry.actor_email}</dd>
                  </div>
                ) : null}
              </dl>

              {entry.before_data != null || entry.after_data != null ? (
                <>
                  <Separator />
                  <div className="grid gap-3">
                    {entry.before_data != null ? (
                      <JsonBlock label="Before" value={entry.before_data} tone="before" />
                    ) : null}
                    {entry.after_data != null ? (
                      <JsonBlock label="After" value={entry.after_data} tone="after" />
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function JsonBlock({ label, value, tone }: { label: string; value: unknown; tone: "before" | "after" }) {
  return (
    <div>
      <p
        className={`mb-1 text-xs font-medium ${
          tone === "before" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {label}
      </p>
      <pre className="max-h-56 overflow-auto rounded-md border border-border bg-muted/40 p-2.5 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
