import "server-only";

/**
 * Pluggable channel providers (Module 6). Email/SMS/WhatsApp resolve from env
 * vars; with no keys configured the CONSOLE adapter logs the rendered message
 * so the whole pipeline runs without provider accounts. in_app is delivered
 * synchronously by the pipeline itself (recorded as sent + delivered).
 *
 * Adding a real provider = implement ChannelProvider and register it in
 * resolveProvider() — the pipeline never changes.
 */

export type CampaignChannel = "email" | "sms" | "whatsapp" | "in_app";

export interface OutboundMessage {
  /** Channel address: email for email, phone for sms/whatsapp. */
  to: string;
  subject?: string;
  body: string;
  /** Configured sender identity (Settings → Marketing); email providers use it as the From header. */
  senderName?: string;
  senderEmail?: string;
  campaignId: string;
  recipientId: string;
}

export interface SendOutcome {
  ok: boolean;
  error?: string;
}

export interface ChannelProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<SendOutcome>;
}

/** Dev adapter: logs to the server console and always succeeds. */
function consoleProvider(channel: CampaignChannel): ChannelProvider {
  return {
    name: `console:${channel}`,
    send(message) {
      console.info(
        `[marketing:${channel}] → ${message.to}` +
          (message.senderEmail ? ` · from ${message.senderName ?? ""} <${message.senderEmail}>` : "") +
          (message.subject ? ` · "${message.subject}"` : "") +
          ` · ${message.body.slice(0, 120).replace(/\n/g, " ")}` +
          ` (campaign ${message.campaignId.slice(0, 8)})`,
      );
      return Promise.resolve({ ok: true });
    },
  };
}

/** Placeholder for a real adapter — activates when its env keys are present. */
function unconfiguredProvider(channel: CampaignChannel, providerName: string): ChannelProvider {
  return {
    name: providerName,
    send() {
      return Promise.resolve({
        ok: false,
        error: `${providerName} selected for ${channel} but its API keys are not configured`,
      });
    },
  };
}

export function resolveProvider(channel: CampaignChannel): ChannelProvider {
  switch (channel) {
    case "email": {
      const which = process.env.MARKETING_EMAIL_PROVIDER ?? "console";
      if (which === "resend" && process.env.RESEND_API_KEY) {
        // Real Resend integration would live here; keys present but adapter
        // intentionally minimal in this internal build.
        return unconfiguredProvider("email", "resend");
      }
      return consoleProvider("email");
    }
    case "sms": {
      const which = process.env.MARKETING_SMS_PROVIDER ?? "console";
      if (which === "twilio" && process.env.TWILIO_ACCOUNT_SID) {
        return unconfiguredProvider("sms", "twilio");
      }
      return consoleProvider("sms");
    }
    case "whatsapp": {
      const which = process.env.MARKETING_WHATSAPP_PROVIDER ?? "console";
      if (which === "twilio" && process.env.TWILIO_ACCOUNT_SID) {
        return unconfiguredProvider("whatsapp", "twilio");
      }
      return consoleProvider("whatsapp");
    }
    case "in_app":
      // Handled inline by the pipeline (synchronous delivery), but a provider
      // keeps the interface uniform for rendering/logging.
      return consoleProvider("in_app");
  }
}

/** Merge-tag rendering: {{name}}, {{tier}}, {{voucher_code}} (+ any merge_data key). */
export function renderTemplate(
  template: string,
  mergeData: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => {
    const value = mergeData[key.toLowerCase()];
    return value == null ? "" : String(value);
  });
}

/** Channel address for a recipient; null = skip (no usable contact). */
export function channelAddress(
  channel: CampaignChannel,
  mergeData: Record<string, unknown>,
): string | null {
  if (channel === "email") return (mergeData.email as string | null) ?? null;
  if (channel === "sms" || channel === "whatsapp") return (mergeData.phone as string | null) ?? null;
  return "in-app";
}
