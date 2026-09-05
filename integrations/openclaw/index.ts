import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { constants, openSync, fstatSync, readFileSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const endpoint = process.env.AGENT_VILLAGE_URL ?? "http://127.0.0.1:4180";
const headerPath = join(process.env.VILLAGE_AUTH_DIR ?? join(homedir(), ".local", "share", "agent-village"), "ingestion.header");

function authorization(): string | undefined {
  const fd = openSync(headerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 256 || (stat.mode & 0o077) !== 0
      || (process.getuid && stat.uid !== process.getuid())) return undefined;
    return /^Authorization: (Bearer [A-Za-z0-9_-]{43})\n?$/.exec(readFileSync(fd, "utf8"))?.[1];
  } finally { closeSync(fd); }
}

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
    const url = new URL(endpoint);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== "/") return;
    const token = authorization();
    if (!token) return;
    await fetch(new URL("/api/hooks/openclaw", url), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: token },
      redirect: "error",
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
