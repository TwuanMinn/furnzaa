import { withAuth } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assistantConfigured, runAssistant, type ChatTurn } from "@/lib/assistant/run";

/**
 * POST /api/assistant — the dashboard AI chat box. Any signed-in user may ask;
 * the data tools are individually permission-gated inside the agentic loop, so
 * the assistant can only surface what the caller is allowed to see.
 */
export const POST = withAuth(async (req, ctx) => {
  if (!assistantConfigured()) {
    return jsonError(
      "The AI assistant isn't configured yet. Set ANTHROPIC_API_KEY on the server to enable it.",
      503,
      "not_configured",
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body", 400);
  }

  const rawMessages = (body as { messages?: unknown }).messages;
  const messages: ChatTurn[] = (Array.isArray(rawMessages) ? rawMessages : [])
    .filter(
      (m): m is ChatTurn =>
        !!m &&
        typeof m === "object" &&
        ((m as ChatTurn).role === "user" || (m as ChatTurn).role === "assistant") &&
        typeof (m as ChatTurn).content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-12);

  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    return jsonError("The last message must be from the user", 400);
  }

  try {
    const answer = await runAssistant(messages, ctx.user);
    return jsonOk({ answer });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "The assistant failed to respond", 500);
  }
});
