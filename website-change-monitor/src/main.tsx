import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import ReactDOM from "react-dom/client";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Eye,
  FileDiff,
  Globe2,
  Loader2,
  LogOut,
  Plus,
  Radar,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { connected, insforge } from "./lib/insforge";
import { initializeAnalytics } from "./lib/analytics";
import "./index.css";

initializeAnalytics();

type Target = {
  id: string;
  name: string;
  url: string;
  category: string;
  interval_minutes: number;
  status: "changed" | "quiet" | "checking" | "failed";
  last_checked_at: string | null;
  last_hash: string;
};
type Change = {
  id: string;
  target_id: string;
  summary: string;
  change_type: string;
  significance: "high" | "medium" | "low";
  before_excerpt: string;
  after_excerpt: string;
  detected_at: string;
};

const demoTargets: Target[] = [
  { id: "moli-readme", name: "Moli README", url: "https://github.com/lexmount/moli", category: "Product", interval_minutes: 360, status: "changed", last_checked_at: "2026-08-24T08:42:00Z", last_hash: "9c2a" },
  { id: "lexbench-results", name: "Lexbench reports", url: "https://github.com/lexmount/Lexbench-Headless-Browser/tree/main/docs/reports", category: "Benchmark", interval_minutes: 720, status: "quiet", last_checked_at: "2026-08-24T07:18:00Z", last_hash: "4a11" },
  { id: "playwright-release", name: "Playwright releases", url: "https://github.com/microsoft/playwright/releases", category: "Dependency", interval_minutes: 1440, status: "quiet", last_checked_at: "2026-08-23T23:00:00Z", last_hash: "f771" },
  { id: "competitor-docs", name: "Competitor browser docs", url: "https://lightpanda.io/docs", category: "Competitor", interval_minutes: 360, status: "failed", last_checked_at: "2026-08-24T06:55:00Z", last_hash: "" }
];
const demoChanges: Change[] = [
  { id: "d1", target_id: "moli-readme", significance: "high", change_type: "benchmark", summary: "The benchmark section now includes a five-engine compatibility comparison and separates functional success from resource-cost evidence.", before_excerpt: "Benchmark results cover public-web crawling and a sample agent workload.", after_excerpt: "The report adds 1,308 comparable compatibility tasks and a separate 557-task resource round.", detected_at: "2026-08-24T08:42:00Z" },
  { id: "d2", target_id: "moli-readme", significance: "medium", change_type: "capability", summary: "WebDriver BiDi is now presented alongside CDP and WebDriver Classic as a first-class protocol path.", before_excerpt: "Use Moli through the CLI, CDP, or WebDriver.", after_excerpt: "Use it through the CLI, CDP, WebDriver Classic, or WebDriver BiDi.", detected_at: "2026-08-23T11:20:00Z" },
  { id: "d3", target_id: "lexbench-results", significance: "low", change_type: "copy", summary: "Report reproduction guidance was clarified without changing the scored task set.", before_excerpt: "Re-run the report generator.", after_excerpt: "Generated reports are byte-deterministic for a pinned run artifact.", detected_at: "2026-08-21T04:12:00Z" }
];

function App() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(connected);
  const [targets, setTargets] = useState<Target[]>(demoTargets);
  const [changes, setChanges] = useState<Change[]>(demoChanges);
  const [selectedId, setSelectedId] = useState(demoTargets[0].id);
  const [addOpen, setAddOpen] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!insforge) return;
    insforge.auth.getCurrentUser().then(({ data }) => {
      setUser(data?.user ? { id: data.user.id, email: data.user.email } : null);
      setAuthLoading(false);
    });
  }, []);
  useEffect(() => { if (insforge && user) void loadWorkspace(); }, [user?.id]);

  const loadWorkspace = async () => {
    if (!insforge) return;
    const [targetResult, changeResult] = await Promise.all([
      insforge.database.from("monitor_targets").select("id,name,url,category,interval_minutes,status,last_checked_at,last_hash").order("created_at", { ascending: false }).limit(50),
      insforge.database.from("monitor_changes").select("id,target_id,summary,change_type,significance,before_excerpt,after_excerpt,detected_at").order("detected_at", { ascending: false }).limit(150)
    ]);
    const nextError = targetResult.error || changeResult.error;
    if (nextError) return setError(nextError.message);
    const nextTargets = (targetResult.data ?? []) as Target[];
    setTargets(nextTargets);
    setChanges((changeResult.data ?? []) as Change[]);
    setSelectedId((current) => nextTargets.some((target) => target.id === current) ? current : nextTargets[0]?.id ?? "");
  };

  const selected = targets.find((target) => target.id === selectedId) ?? targets[0];
  const selectedChanges = useMemo(() => changes.filter((change) => change.target_id === selected?.id), [changes, selected?.id]);
  const changedCount = targets.filter((target) => target.status === "changed").length;
  const failedCount = targets.filter((target) => target.status === "failed").length;

  const addTarget = async (input: { name: string; url: string; category: string; interval_minutes: number }) => {
    setError("");
    if (!insforge) {
      const next = { ...input, id: `demo-${Date.now()}`, status: "quiet" as const, last_checked_at: null, last_hash: "" };
      setTargets((current) => [next, ...current]);
      setSelectedId(next.id);
      setAddOpen(false);
      return;
    }
    const { data, error: insertError } = await insforge.database.from("monitor_targets").insert([input]).select("id,name,url,category,interval_minutes,status,last_checked_at,last_hash");
    if (insertError || !data?.[0]) throw insertError ?? new Error("Target was not created");
    await loadWorkspace();
    setSelectedId(data[0].id);
    setAddOpen(false);
  };

  const checkNow = async (targetId: string) => {
    setChecking(targetId);
    setError("");
    try {
      if (!insforge) await new Promise((resolve) => window.setTimeout(resolve, 800));
      else {
        const { error: invokeError } = await insforge.functions.invoke("monitor-check", { body: { targetId } });
        if (invokeError) throw invokeError;
        await loadWorkspace();
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Check failed"); }
    finally { setChecking(null); }
  };

  if (authLoading) return <div className="grid min-h-screen place-items-center bg-[#e9f1ed]"><Loader2 className="animate-spin text-[#006b62]" /></div>;
  if (connected && !user) return <AuthScreen onAuthenticated={setUser} />;

  return <div className="min-h-screen bg-[#e9f1ed] text-[#12332f]">
    <header className="flex h-16 items-center justify-between border-b border-[#b8cbc5] px-4 sm:px-7">
      <div className="flex items-center gap-3"><div className="grid h-8 w-8 place-items-center rounded-full bg-[#006b62] text-white"><Radar size={17} /></div><strong className="font-display text-lg tracking-[-0.02em]">Driftwatch</strong><span className="hidden text-xs text-[#56736d] sm:inline">changes worth reading</span></div>
      <div className="flex items-center gap-3 text-xs text-[#56736d]"><span className="hidden sm:inline">{connected ? user?.email : "Showcase data"}</span><span className={`h-2 w-2 rounded-full ${connected ? "bg-[#0f8c65]" : "bg-[#df8a35]"}`} />{connected && <button aria-label="Sign out" className="focus-ring rounded-md p-1.5 hover:bg-white/70" onClick={() => void insforge?.auth.signOut().then(() => setUser(null))}><LogOut size={16} /></button>}</div>
    </header>

    <main className="mx-auto max-w-[1500px] p-4 sm:p-7">
      <section className="flex flex-col justify-between gap-5 border-b border-[#9fb7b0] pb-6 sm:flex-row sm:items-end">
        <div><div className="flex items-center gap-2 text-xs font-semibold text-[#006b62]"><Activity size={14} />Monitoring desk</div><h1 className="font-display mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">See the change. Skip the noise.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#56736d]">Track product pages, documentation, pricing, and releases. Driftwatch stores the evidence and explains what moved.</p></div>
        <button onClick={() => setAddOpen(true)} className="focus-ring flex shrink-0 items-center justify-center gap-2 rounded-md bg-[#006b62] px-5 py-3 text-sm font-semibold text-white hover:bg-[#00544d]"><Plus size={17} />Watch a page</button>
      </section>

      <section className="grid border-b border-[#9fb7b0] sm:grid-cols-3">
        <Metric label="Watched pages" value={targets.length} detail="public HTTP(S) targets" />
        <Metric label="Need review" value={changedCount} detail="meaningful changes" tone="orange" />
        <Metric label="Attention" value={failedCount} detail="checks need intervention" tone={failedCount ? "red" : "green"} />
      </section>

      {error && <div role="alert" className="mt-5 border border-[#b54d3d] bg-[#fff1ed] px-4 py-3 text-sm text-[#8b3327]">{error}</div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-[#9fb7b0] bg-[#f3f7f5]">
          <div className="flex items-center justify-between border-b border-[#bfd0cb] px-4 py-3"><span className="text-xs font-semibold text-[#56736d]">Targets</span><span className="font-mono text-[10px] text-[#6b847f]">NEXT CHECK</span></div>
          <nav aria-label="Monitored pages">
            {targets.map((target) => <button key={target.id} onClick={() => setSelectedId(target.id)} className={`focus-ring flex w-full items-center gap-3 border-b border-[#d3dfdb] px-4 py-4 text-left last:border-0 ${selected?.id === target.id ? "bg-white" : "hover:bg-white/60"}`}>
              <StatusMark status={target.status} />
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{target.name}</strong><small className="mt-1 block truncate text-xs text-[#678079]">{new URL(target.url).hostname}</small></span>
              <ChevronRight size={15} className="text-[#839a94]" />
            </button>)}
          </nav>
        </aside>

        <section className="min-w-0 rounded-xl border border-[#9fb7b0] bg-[#f8faf9]">
          {!selected ? <EmptyMonitor onCreate={() => setAddOpen(true)} /> : <>
            <header className="flex flex-col justify-between gap-4 border-b border-[#bfd0cb] p-5 sm:flex-row sm:items-start sm:p-6">
              <div className="min-w-0"><div className="flex items-center gap-2 text-xs font-semibold text-[#648079]"><span>{selected.category}</span><span>·</span><span>every {formatInterval(selected.interval_minutes)}</span></div><h2 className="font-display mt-2 truncate text-2xl font-semibold">{selected.name}</h2><a href={selected.url} target="_blank" rel="noreferrer" className="focus-ring mt-2 inline-flex max-w-full items-center gap-1.5 truncate text-xs text-[#006b62] hover:underline">{selected.url}<ExternalLink size={12} /></a></div>
              <button disabled={checking === selected.id} onClick={() => void checkNow(selected.id)} className="focus-ring flex shrink-0 items-center justify-center gap-2 rounded-md border border-[#7f9f97] px-4 py-2.5 text-sm font-semibold hover:bg-white disabled:opacity-60">{checking === selected.id ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}Check now</button>
            </header>

            <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div className="p-5 sm:p-7">
                <div className="flex items-center justify-between"><h3 className="font-display text-lg font-semibold">Change timeline</h3><span className="font-mono text-[10px] text-[#728b85]">{selectedChanges.length} EVENTS</span></div>
                <div className="relative mt-6 space-y-0 before:absolute before:bottom-0 before:left-[11px] before:top-2 before:w-px before:bg-[#aac0ba]">
                  {selectedChanges.length === 0 ? <div className="pl-9 text-sm text-[#617b75]">No meaningful changes recorded yet.</div> : selectedChanges.map((change) => <ChangeEvent key={change.id} change={change} />)}
                </div>
              </div>
              <aside className="border-t border-[#bfd0cb] bg-[#edf4f1] p-5 xl:border-l xl:border-t-0">
                <h3 className="text-xs font-semibold text-[#56736d]">Monitor facts</h3>
                <dl className="mt-5 space-y-5 text-sm"><Fact icon={<Clock3 size={15} />} label="Last checked" value={selected.last_checked_at ? new Date(selected.last_checked_at).toLocaleString() : "Not checked yet"} /><Fact icon={<ShieldCheck size={15} />} label="Fetcher" value={connected ? "Provider selected server-side" : "Showcase mode"} /><Fact icon={<Bell size={15} />} label="Notification" value="Review queue" /><Fact icon={<Eye size={15} />} label="Content hash" value={selected.last_hash ? `${selected.last_hash.slice(0, 10)}…` : "Pending first snapshot"} /></dl>
                <p className="mt-7 border-t border-[#bfd0cb] pt-5 text-xs leading-5 text-[#607973]">A changed hash creates evidence, not an alert. The review queue only surfaces changes that survive normalization.</p>
              </aside>
            </div>
          </>}
        </section>
      </div>
    </main>
    {addOpen && <AddTarget onClose={() => setAddOpen(false)} onAdd={addTarget} />}
  </div>;
}

function Metric({ label, value, detail, tone = "default" }: { label: string; value: number; detail: string; tone?: string }) {
  const color = tone === "orange" ? "text-[#c75d1f]" : tone === "red" ? "text-[#ae3f32]" : tone === "green" ? "text-[#0f8c65]" : "text-[#12332f]";
  return <div className="border-[#9fb7b0] py-5 sm:border-r sm:px-5 sm:last:border-r-0"><span className="text-xs font-semibold text-[#607973]">{label}</span><div className="mt-1 flex items-baseline gap-2"><strong className={`font-display text-3xl ${color}`}>{value}</strong><small className="text-xs text-[#728b85]">{detail}</small></div></div>;
}
function StatusMark({ status }: { status: Target["status"] }) {
  const cls = status === "changed" ? "bg-[#df6f2c]" : status === "failed" ? "bg-[#b54d3d]" : status === "checking" ? "bg-[#327ea8]" : "bg-[#148665]";
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} aria-label={status} />;
}
function ChangeEvent({ change }: { change: Change }) {
  return <article className="relative grid grid-cols-[24px_1fr] gap-4 pb-8"><span className={`relative z-10 mt-1 h-6 w-6 rounded-full border-4 border-[#f8faf9] ${change.significance === "high" ? "bg-[#df6f2c]" : "bg-[#5f8f83]"}`} /><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${change.significance === "high" ? "bg-[#ffe2d2] text-[#a74716]" : "bg-[#dcebe6] text-[#3d6e62]"}`}>{change.significance.toUpperCase()}</span><span className="font-mono text-[10px] text-[#728b85]">{change.change_type} · {new Date(change.detected_at).toLocaleString()}</span></div><h4 className="mt-3 text-sm font-semibold leading-6">{change.summary}</h4><div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-md bg-[#f1e7e3] p-3"><span className="flex items-center gap-1 text-[10px] font-bold text-[#936253]"><ArrowDownRight size={12} />BEFORE</span><p className="mt-2 text-xs leading-5 text-[#6d5c56]">{change.before_excerpt}</p></div><div className="rounded-md bg-[#e0eee8] p-3"><span className="flex items-center gap-1 text-[10px] font-bold text-[#37705f]"><Check size={12} />AFTER</span><p className="mt-2 text-xs leading-5 text-[#46665d]">{change.after_excerpt}</p></div></div></div></article>;
}
function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex gap-3"><span className="mt-0.5 text-[#006b62]">{icon}</span><div><dt className="text-xs text-[#6a837d]">{label}</dt><dd className="mt-1 break-words text-xs font-semibold leading-5">{value}</dd></div></div>; }
function formatInterval(minutes: number) { return minutes < 60 ? `${minutes} min` : minutes % 1440 === 0 ? `${minutes / 1440} day` : `${minutes / 60} hr`; }

function AddTarget({ onClose, onAdd }: { onClose: () => void; onAdd: (input: { name: string; url: string; category: string; interval_minutes: number }) => Promise<void> }) {
  const [name, setName] = useState(""); const [url, setUrl] = useState(""); const [category, setCategory] = useState("Product"); const [interval, setInterval] = useState(360); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(""); try { await onAdd({ name, url, category, interval_minutes: interval }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Target was not created"); } finally { setSaving(false); } };
  return <div className="fixed inset-0 z-40 grid place-items-center bg-[#12332f]/55 p-4" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-labelledby="target-title" className="w-full max-w-xl rounded-xl bg-[#f8faf9] p-6 shadow-2xl sm:p-8" onMouseDown={(event) => event.stopPropagation()}><div><span className="text-xs font-semibold text-[#006b62]">New target</span><h2 id="target-title" className="font-display mt-2 text-2xl font-semibold">Watch one public page.</h2><p className="mt-2 text-sm text-[#607973]">Start specific. You can add related pages after the first useful change appears.</p></div><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-semibold">Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Moli README" className="focus-ring mt-2 w-full rounded-md border border-[#9fb7b0] bg-white px-4 py-3 font-normal" /></label><label className="block text-sm font-semibold">Public URL<input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/lexmount/moli" className="focus-ring mt-2 w-full rounded-md border border-[#9fb7b0] bg-white px-4 py-3 font-normal" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="focus-ring mt-2 w-full rounded-md border border-[#9fb7b0] bg-white px-4 py-3 font-normal"><option>Product</option><option>Competitor</option><option>Documentation</option><option>Pricing</option><option>Dependency</option></select></label><label className="block text-sm font-semibold">Frequency<select value={interval} onChange={(event) => setInterval(Number(event.target.value))} className="focus-ring mt-2 w-full rounded-md border border-[#9fb7b0] bg-white px-4 py-3 font-normal"><option value={60}>Every hour</option><option value={360}>Every 6 hours</option><option value={720}>Every 12 hours</option><option value={1440}>Daily</option></select></label></div>{error && <p role="alert" className="text-sm text-[#a33a30]">{error}</p>}<div className="flex justify-end gap-3 pt-3"><button type="button" onClick={onClose} className="focus-ring rounded-md border border-[#9fb7b0] px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={saving} className="focus-ring flex items-center gap-2 rounded-md bg-[#006b62] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}Start watching</button></div></form></section></div>;
}
function EmptyMonitor({ onCreate }: { onCreate: () => void }) { return <div className="grid min-h-[520px] place-items-center p-8 text-center"><div><FileDiff className="mx-auto text-[#006b62]" /><h2 className="font-display mt-4 text-2xl font-semibold">No pages on the radar.</h2><p className="mt-2 text-sm text-[#607973]">Add a public page to create its first evidence snapshot.</p><button onClick={onCreate} className="focus-ring mt-5 inline-flex items-center gap-2 rounded-md bg-[#006b62] px-5 py-3 text-sm font-semibold text-white">Watch a page <ArrowRight size={16} /></button></div></div>; }
function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: { id: string; email?: string }) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!insforge) return; const { data, error: authError } = await insforge.auth.signInWithPassword({ email, password }); if (authError || !data?.user) return setError(authError?.message ?? "Sign in failed"); onAuthenticated({ id: data.user.id, email: data.user.email }); };
  return <main className="grid min-h-screen bg-[#e9f1ed] lg:grid-cols-[1.1fr_0.9fr]"><section className="hidden p-16 lg:flex lg:flex-col lg:justify-between"><Radar size={34} className="text-[#006b62]" /><div><h1 className="font-display max-w-xl text-5xl font-semibold leading-[1.05] tracking-[-0.045em]">The web moved.<br />Know what matters.</h1><p className="mt-5 max-w-md text-sm leading-6 text-[#56736d]">Driftwatch keeps a readable history of product, pricing, documentation, and competitor changes.</p></div></section><section className="grid place-items-center bg-[#12332f] p-6 text-white"><form onSubmit={submit} className="w-full max-w-sm"><Globe2 className="text-[#77c5b5]" /><h2 className="font-display mt-5 text-3xl font-semibold">Sign in to the monitoring desk</h2><p className="mt-2 text-sm text-[#a9c1bb]">Every target and snapshot stays inside your account.</p><label className="mt-7 block text-sm font-semibold">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="focus-ring mt-2 w-full rounded-md border border-[#5e7c75] bg-[#1b423d] px-4 py-3 font-normal" /></label><label className="mt-4 block text-sm font-semibold">Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="focus-ring mt-2 w-full rounded-md border border-[#5e7c75] bg-[#1b423d] px-4 py-3 font-normal" /></label>{error && <p role="alert" className="mt-4 text-sm text-[#ffb3a6]">{error}</p>}<button className="focus-ring mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-[#79cfbd] px-4 py-3 text-sm font-semibold text-[#12332f]">Sign in <ArrowRight size={16} /></button></form></section></main>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
