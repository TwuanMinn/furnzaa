import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, dbInsert } from "@/lib/supabase/types";

/**
 * Campaign tracking endpoints (Module 6). PUBLIC — they are hit from emails/
 * links outside any session, so the only validation is that the recipient row
 * exists and belongs to the campaign. Events stream into campaign_events;
 * analytics read the pre-aggregated campaign_stats, never this raw stream.
 *
 *   GET /api/track?e=open&c=<campaignId>&r=<recipientId>        → 1×1 gif
 *   GET /api/track?e=click&c=…&r=…&url=<encoded>                → 302 redirect
 *   GET /api/track?e=convert&c=…&r=…&total=<cents>              → 204
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Transparent 1×1 GIF.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const EVENT_MAP = { open: "opened", click: "clicked", convert: "converted" } as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("e") as keyof typeof EVENT_MAP | null;
  const campaignId = url.searchParams.get("c") ?? "";
  const recipientId = url.searchParams.get("r") ?? "";

  const pixelResponse = () =>
    new Response(new Uint8Array(PIXEL), {
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, private" },
    });

  if (!kind || !EVENT_MAP[kind] || !UUID_RE.test(campaignId) || !UUID_RE.test(recipientId)) {
    // Never error loudly from a tracking pixel.
    return kind === "click"
      ? NextResponse.redirect(new URL("/", url.origin))
      : pixelResponse();
  }

  const admin = createAdminClient();
  const { data: recipientRaw } = await admin
    .from("campaign_recipients")
    .select("id, customer_id, campaign_id")
    .eq("id", recipientId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  const recipient = asRow<{ id: string; customer_id: string; campaign_id: string }>(recipientRaw);

  if (recipient) {
    const metadata: Record<string, unknown> = {};
    if (kind === "click") metadata.url = url.searchParams.get("url") ?? null;
    if (kind === "convert") {
      const total = Number(url.searchParams.get("total") ?? 0);
      if (Number.isFinite(total) && total > 0) metadata.order_total_cents = Math.round(total);
    }
    await admin.from("campaign_events").insert(
      dbInsert("campaign_events", {
        campaign_id: campaignId,
        recipient_id: recipient.id,
        customer_id: recipient.customer_id,
        event_type: EVENT_MAP[kind],
        metadata: metadata as never,
      }),
    );
  }

  if (kind === "click") {
    const target = url.searchParams.get("url");
    try {
      // Only http(s) destinations; anything else falls back to the app root.
      const destination = target ? new URL(target) : new URL("/", url.origin);
      if (!/^https?:$/.test(destination.protocol)) throw new Error("bad scheme");
      return NextResponse.redirect(destination);
    } catch {
      return NextResponse.redirect(new URL("/", url.origin));
    }
  }
  if (kind === "convert") return new Response(null, { status: 204 });
  return pixelResponse();
}
