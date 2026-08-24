import { createClient } from "npm:@insforge/sdk";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
type FetchResult = { title: string; markdown: string; mode: "moli" | "basic-http" };

function publicUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("Only public HTTP(S) URLs are accepted");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "::1" || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")) throw new Error("Private network targets are not accepted");
  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every(Number.isInteger) && octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) throw new Error("Private network targets are not accepted");
  return url;
}
function normalize(value: string) { return value.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, "<time>").replace(/\s+/g, " ").trim(); }
async function digest(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

async function fetchPage(raw: string): Promise<FetchResult> {
  const url = publicUrl(raw);
  const provider = Deno.env.get("LEXMOUNT_BROWSER_API_URL")?.replace(/\/$/, "");
  if (provider) {
    const response = await fetch(`${provider}/v1/fetch`, { method: "POST", headers: { "Content-Type": "application/json", ...(Deno.env.get("LEXMOUNT_BROWSER_API_KEY") ? { Authorization: `Bearer ${Deno.env.get("LEXMOUNT_BROWSER_API_KEY")}` } : {}) }, body: JSON.stringify({ url: url.toString(), output: "markdown", waitUntil: "done", maxBytes: 250000 }) });
    if (!response.ok) throw new Error(`Browser provider returned ${response.status}`);
    const result = await response.json() as { title?: string; markdown?: string; content?: string };
    return { title: result.title || url.hostname, markdown: normalize(result.markdown || result.content || "").slice(0, 100000), mode: "moli" };
  }
  throw new Error("Lexmount Browser provider is not configured");
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "unauthorized" });
  const client = createClient({ baseUrl: Deno.env.get("INSFORGE_BASE_URL"), edgeFunctionToken: token });
  const { data: identity } = await client.auth.getCurrentUser();
  if (!identity?.user?.id) return json(401, { error: "unauthorized" });
  let input: { targetId?: string };
  try { input = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  if (!input.targetId) return json(422, { error: "target_id_required" });

  const { data: target, error: targetError } = await client.database.from("monitor_targets").select("id,url,interval_minutes,last_hash").eq("id", input.targetId).single();
  if (targetError || !target) return json(404, { error: "target_not_found" });
  await client.database.from("monitor_targets").update({ status: "checking", error_message: "" }).eq("id", target.id);

  try {
    const page = await fetchPage(target.url);
    const hash = await digest(page.markdown);
    const words = page.markdown.split(/\s+/).filter(Boolean);
    const excerpt = words.slice(0, 70).join(" ");
    const { data: previousRows } = await client.database.from("monitor_snapshots").select("id,content_excerpt,content_markdown,content_hash").eq("target_id", target.id).order("captured_at", { ascending: false }).limit(1);
    const previous = previousRows?.[0];
    const { data: snapshots, error: snapshotError } = await client.database.from("monitor_snapshots").insert([{ target_id: target.id, content_hash: hash, title: page.title, content_excerpt: excerpt, content_markdown: page.markdown, word_count: words.length, fetch_mode: page.mode }]).select("id");
    if (snapshotError || !snapshots?.[0]) throw new Error(snapshotError?.message || "Snapshot was not saved");
    let changed = false;
    let summary = "Content changed since the previous snapshot.";
    let changeType = "content";
    let significance: "low" | "medium" | "high" = "medium";
    if (previous && previous.content_hash !== hash) {
      changed = true;
      try {
        const completion = await client.ai.chat.completions.create({ model: "openai/gpt-4o-mini", messages: [{ role: "system", content: "Compare two page excerpts. Return strict JSON only: summary, changeType, significance (low|medium|high). Ignore timestamps, counters, and cosmetic changes." }, { role: "user", content: `BEFORE:\n${previous.content_markdown.slice(0, 10000)}\n\nAFTER:\n${page.markdown.slice(0, 10000)}` }], maxTokens: 500 });
        const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
        summary = String(parsed.summary || summary).slice(0, 1600);
        changeType = String(parsed.changeType || changeType).slice(0, 80);
        significance = ["low", "medium", "high"].includes(parsed.significance) ? parsed.significance : significance;
      } catch { /* A deterministic change record is still created. */ }
      await client.database.from("monitor_changes").insert([{ target_id: target.id, previous_snapshot_id: previous.id, current_snapshot_id: snapshots[0].id, summary, change_type: changeType, significance, before_excerpt: previous.content_excerpt, after_excerpt: excerpt }]);
    }
    const now = new Date();
    const next = new Date(now.getTime() + Number(target.interval_minutes) * 60000);
    await client.database.from("monitor_targets").update({ status: changed ? "changed" : "quiet", last_hash: hash, last_checked_at: now.toISOString(), next_check_at: next.toISOString(), error_message: "" }).eq("id", target.id);
    return json(200, { targetId: target.id, changed, snapshotId: snapshots[0].id, fetchMode: page.mode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Monitor check failed";
    await client.database.from("monitor_targets").update({ status: "failed", last_checked_at: new Date().toISOString(), error_message: message }).eq("id", target.id);
    return json(502, { error: "check_failed", detail: message });
  }
}
