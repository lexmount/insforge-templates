import { createClient } from "npm:@insforge/sdk";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type FetchResult = { title: string; finalUrl: string; markdown: string; mode: "moli" | "basic-http" };

function publicUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("Only public HTTP(S) URLs are accepted");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "0.0.0.0" || hostname === "::1" || hostname.startsWith("127.") || hostname.startsWith("10.") || hostname.startsWith("192.168.")) throw new Error("Private network targets are not accepted");
  const octets = hostname.split(".").map(Number);
  if (octets.length === 4 && octets.every(Number.isInteger) && octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) throw new Error("Private network targets are not accepted");
  return url;
}

async function fetchPage(raw: string): Promise<FetchResult> {
  const url = publicUrl(raw);
  const provider = Deno.env.get("LEXMOUNT_BROWSER_API_URL")?.replace(/\/$/, "");
  if (provider) {
    const response = await fetch(`${provider}/v1/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(Deno.env.get("LEXMOUNT_BROWSER_API_KEY") ? { Authorization: `Bearer ${Deno.env.get("LEXMOUNT_BROWSER_API_KEY")}` } : {}) },
      body: JSON.stringify({ url: url.toString(), output: "markdown", waitUntil: "done", maxBytes: 250000 })
    });
    if (!response.ok) throw new Error(`Browser provider returned ${response.status}`);
    const result = await response.json() as { title?: string; finalUrl?: string; markdown?: string; content?: string };
    return { title: result.title || url.hostname, finalUrl: result.finalUrl || url.toString(), markdown: (result.markdown || result.content || "").slice(0, 100000), mode: "moli" };
  }
  throw new Error("Lexmount Browser provider is not configured");
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "unauthorized" });
  const client = createClient({ baseUrl: Deno.env.get("INSFORGE_BASE_URL"), edgeFunctionToken: token });
  const { data: identity } = await client.auth.getCurrentUser();
  if (!identity?.user?.id) return json(401, { error: "unauthorized" });

  let input: { question?: string; urls?: string[] };
  try { input = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const question = input.question?.trim() ?? "";
  const urls = [...new Set((input.urls ?? []).map((url) => url.trim()).filter(Boolean))].slice(0, 5);
  if (question.length < 12 || urls.length === 0) return json(422, { error: "question_and_urls_required" });

  const title = question.length > 72 ? `${question.slice(0, 69)}…` : question;
  const { data: created, error: createError } = await client.database.from("research_projects").insert([{ title, question, status: "running" }]).select("id");
  const projectId = created?.[0]?.id;
  if (createError || !projectId) return json(500, { error: "project_create_failed", detail: createError?.message });

  try {
    const sourceRows = [];
    for (const rawUrl of urls) {
      const page = await fetchPage(rawUrl);
      const final = new URL(page.finalUrl);
      const words = page.markdown.split(/\s+/).filter(Boolean);
      sourceRows.push({ project_id: projectId, url: rawUrl, final_url: page.finalUrl, domain: final.hostname, title: page.title, excerpt: words.slice(0, 46).join(" "), content_markdown: page.markdown, content_hash: await sha256(page.markdown), word_count: words.length, fetch_mode: page.mode });
    }
    const { data: savedSources, error: sourceError } = await client.database.from("research_sources").insert(sourceRows).select("id,title,content_markdown");
    if (sourceError || !savedSources?.length) throw new Error(sourceError?.message || "No sources were saved");

    const evidence = savedSources.map((source: { title: string; content_markdown: string }, index: number) => `[S${index + 1}] ${source.title}\n${source.content_markdown.slice(0, 9000)}`).join("\n\n");
    let summary = "Sources collected. Configure the InsForge AI runtime to generate a grounded synthesis.";
    let claims: Array<{ source: number; claim: string; quote: string; confidence: number }> = [];
    try {
      const completion = await client.ai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "system", content: "Return strict JSON with keys summary and claims. Each claim has source (1-based), claim, quote, confidence. Use only supplied evidence and produce at most 5 claims." }, { role: "user", content: `Question: ${question}\n\nEvidence:\n${evidence}` }],
        maxTokens: 1200
      });
      const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
      summary = String(parsed.summary || summary);
      claims = Array.isArray(parsed.claims) ? parsed.claims.slice(0, 5) : [];
    } catch { /* AI is optional; collected evidence remains useful. */ }

    const claimRows = claims.map((claim, index) => ({ project_id: projectId, source_id: savedSources[Math.max(0, Math.min(savedSources.length - 1, Number(claim.source) - 1))].id, claim: String(claim.claim).slice(0, 1200), quote: String(claim.quote || "").slice(0, 1600), citation_label: `S${Math.max(1, Number(claim.source) || index + 1)}`, confidence: Math.max(0, Math.min(1, Number(claim.confidence) || 0.7)) }));
    if (claimRows.length) await client.database.from("research_claims").insert(claimRows);
    await client.database.from("research_projects").update({ status: "ready", summary }).eq("id", projectId);
    return json(200, { projectId, sources: savedSources.length, claims: claimRows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research run failed";
    await client.database.from("research_projects").update({ status: "failed", error_message: message }).eq("id", projectId);
    return json(502, { error: "research_failed", detail: message, projectId });
  }
}
