import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const endpoint = process.env.AGENT_VILLAGE_URL ?? "http://127.0.0.1:4180";

function field(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

async function report(eventName: "session_start" | "agent_start" | "agent_end" | "session_end", event: unknown, ctx: unknown) {
  const sessionId = field(ctx, "sessionKey") ?? field(ctx, "runId") ?? field(event, "runId");
  if (!sessionId) return;
  const payload = {
    sessionId,
    event: eventName,
    title: field(ctx, "agentId"),
    cwd: field(ctx, "workspaceDir"),
  };
  try {
    await fetch(`${endpoint}/api/hooks/openclaw`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(250),
    });
  } catch {
    // Observation must never block or alter an OpenClaw run.
  }
}

export default definePluginEntry({
  id: "agent-village",
  name: "Agent Village",
  description: "Observation-only lifecycle exporter for Agent Village",
  register(api) {
    api.on("session_start", async (event, ctx) => report("session_start", event, ctx));
    api.on("before_agent_run", async (event, ctx) => report("agent_start", event, ctx));
    api.on("agent_end", async (event, ctx) => report("agent_end", event, ctx));
    api.on("session_end", async (event, ctx) => report("session_end", event, ctx));
  },
});
