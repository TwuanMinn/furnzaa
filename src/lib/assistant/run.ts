import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type { SessionUser } from "@/lib/rbac/guards";
import { ASSISTANT_TOOLS, type AssistantTool } from "./tools";

/** Default to the most capable model; override per-deploy with ANTHROPIC_MODEL. */
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 6;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** False when no API key is configured — lets the UI show a setup notice. */
export function assistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function buildSystem(user: SessionUser, tools: AssistantTool[]): string {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const capabilities = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return [
    "You are Furnza Assistant, an in-app helper for a 3D-print orders, inventory and CRM system.",
    "Staff ask you natural-language questions and you answer using ONLY the data tools below — so they don't have to navigate the app and read numbers themselves.",
    "",
    `The current user is ${user.fullName} (role: ${user.roleName}). Today is ${today}.`,
    "",
    "Tools available to THIS user:",
    capabilities,
    "",
    "Rules:",
    "- Answer strictly from tool results. Never invent or estimate numbers that a tool didn't return.",
    "- Call the smallest set of tools needed; you may call several in one turn.",
    "- If the question needs data you have no tool for (or the user lacks access), say so plainly — don't guess.",
    "- Money values from tools are in minor units (cents). Convert to the returned currency and format readably (e.g. 1.250.000 ₫). Don't show raw cents.",
    "- Be concise and skimmable: lead with the direct answer, then a short bullet breakdown if helpful. Plain text only (no markdown tables).",
  ].join("\n");
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Manual agentic loop: expose only the tools the caller is permitted to use,
 * let the model call them, execute each (re-checking permission), feed results
 * back, and loop until the model answers or we hit the round cap.
 */
export async function runAssistant(history: ChatTurn[], user: SessionUser): Promise<string> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  const available = ASSISTANT_TOOLS.filter((t) => user.permissions.has(t.permission));
  const toolByName = new Map(available.map((t) => [t.name, t]));
  const tools = available.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));

  const system = buildSystem(user, available);
  const messages: Anthropic.MessageParam[] = history
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system,
      tools,
      messages,
    });

    if (res.stop_reason !== "tool_use") {
      return textOf(res.content) || "I couldn't find an answer to that.";
    }

    // Preserve the full assistant turn (incl. thinking + tool_use blocks).
    messages.push({ role: "assistant", content: res.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const tool = toolByName.get(block.name);
      let content: string;
      let isError = false;
      if (!tool || !user.permissions.has(tool.permission)) {
        content = "You don't have access to that information.";
        isError = true;
      } else {
        try {
          const data = await tool.run((block.input ?? {}) as Record<string, unknown>, user);
          content = JSON.stringify(data);
        } catch (e) {
          content = e instanceof Error ? e.message : "The tool failed to run.";
          isError = true;
        }
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content,
        ...(isError ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return "That took more steps than expected — try asking something more specific.";
}
