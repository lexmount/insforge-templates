import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleDot,
  ExternalLink,
  FileText,
  Globe2,
  Loader2,
  LogOut,
  Plus,
  Search,
  Sparkles
} from "lucide-react";
import { connected, insforge } from "./lib/insforge";
import { initializeAnalytics } from "./lib/analytics";
import "./index.css";

initializeAnalytics();

type Project = {
  id: string;
  title: string;
  question: string;
  status: "ready" | "running" | "failed";
  summary: string;
  created_at: string;
};

type Source = {
  id: string;
  project_id: string;
  title: string;
  domain: string;
  url: string;
  excerpt: string;
  word_count: number;
  fetch_mode: string;
};

type Claim = {
  id: string;
  project_id: string;
  source_id: string;
  claim: string;
  quote: string;
  citation_label: string;
  confidence: number;
};

const demoProjects: Project[] = [
  {
    id: "demo-agent-browsers",
    title: "Agent browser runtime landscape",
    question: "Where do structure-first browsers create a durable advantage for AI agents?",
    status: "ready",
    summary: "Structure-first runtimes win when agents need repeated DOM, network, and storage access but only occasional pixels. The advantage is operational: lower memory per active episode means denser concurrency without giving up standard automation protocols.",
    created_at: "2026-08-24T09:30:00Z"
  },
  {
    id: "demo-retrieval",
    title: "Retrieval pipeline notes",
    question: "Which browser outputs reduce model context without losing evidence?",
    status: "ready",
    summary: "Semantic trees and scoped Markdown preserve document structure while removing visual noise.",
    created_at: "2026-08-22T14:10:00Z"
  }
];

const demoSources: Source[] = [
  { id: "moli", project_id: "demo-agent-browsers", title: "Moli — browser runtime for AI agents", domain: "github.com", url: "https://github.com/lexmount/moli", excerpt: "A production-ready headless browser with on-demand layout and rendering, standard automation protocols, and extraction-oriented outputs.", word_count: 1840, fetch_mode: "moli" },
  { id: "lexbench", project_id: "demo-agent-browsers", title: "Lexbench Headless Browser", domain: "github.com", url: "https://github.com/lexmount/Lexbench-Headless-Browser", excerpt: "A reproducible benchmark spanning protocol compatibility, pinned automation drivers, and web-platform semantics.", word_count: 1320, fetch_mode: "moli" },
  { id: "playwright", project_id: "demo-agent-browsers", title: "Playwright browser automation", domain: "playwright.dev", url: "https://playwright.dev", excerpt: "A cross-browser automation framework with a high-level API and CDP connectivity.", word_count: 940, fetch_mode: "basic-http" }
];

const demoClaims: Claim[] = [
  { id: "c1", project_id: "demo-agent-browsers", source_id: "moli", citation_label: "S1", confidence: 0.94, claim: "Most agent browser work consumes structure rather than continuously rendered pixels.", quote: "Structure-first operations skip layout and paint until geometry or visual output is requested." },
  { id: "c2", project_id: "demo-agent-browsers", source_id: "lexbench", citation_label: "S2", confidence: 0.91, claim: "Compatibility needs semantic checks, not successful protocol echoes.", quote: "The benchmark judges what the page finally does across protocol and web-platform layers." },
  { id: "c3", project_id: "demo-agent-browsers", source_id: "moli", citation_label: "S1", confidence: 0.88, claim: "Protocol compatibility lets teams keep existing Playwright and Selenium workflows.", quote: "CDP, WebDriver Classic, and WebDriver BiDi share one runtime." }
];

function App() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(connected);
  const [projects, setProjects] = useState<Project[]>(demoProjects);
  const [sources, setSources] = useState<Source[]>(demoSources);
  const [claims, setClaims] = useState<Claim[]>(demoClaims);
  const [selectedId, setSelectedId] = useState(demoProjects[0].id);
  const [composerOpen, setComposerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!insforge) return;
    insforge.auth.getCurrentUser().then(({ data }) => {
      setUser(data?.user ? { id: data.user.id, email: data.user.email } : null);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!insforge || !user) return;
    void loadWorkspace();
  }, [user?.id]);

  const loadWorkspace = async () => {
    if (!insforge) return;
    const [projectResult, sourceResult, claimResult] = await Promise.all([
      insforge.database.from("research_projects").select("id,title,question,status,summary,created_at").order("created_at", { ascending: false }).limit(30),
      insforge.database.from("research_sources").select("id,project_id,title,domain,url,excerpt,word_count,fetch_mode").order("created_at", { ascending: false }).limit(120),
      insforge.database.from("research_claims").select("id,project_id,source_id,claim,quote,citation_label,confidence").order("created_at", { ascending: true }).limit(180)
    ]);
    const nextError = projectResult.error || sourceResult.error || claimResult.error;
    if (nextError) {
      setError(nextError.message);
      return;
    }
    const nextProjects = (projectResult.data ?? []) as Project[];
    setProjects(nextProjects);
    setSources((sourceResult.data ?? []) as Source[]);
    setClaims((claimResult.data ?? []) as Claim[]);
    setSelectedId((current) => nextProjects.some((item) => item.id === current) ? current : nextProjects[0]?.id ?? "");
  };

  const selected = projects.find((project) => project.id === selectedId) ?? projects[0];
  const selectedSources = useMemo(() => sources.filter((source) => source.project_id === selected?.id), [sources, selected?.id]);
  const selectedClaims = useMemo(() => claims.filter((claim) => claim.project_id === selected?.id), [claims, selected?.id]);

  const runResearch = async (question: string, urls: string[]) => {
    setRunning(true);
    setError("");
    try {
      if (!insforge) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        setSelectedId(demoProjects[0].id);
      } else {
        const { data, error: invokeError } = await insforge.functions.invoke("research-run", { body: { question, urls } });
        if (invokeError) throw invokeError;
        await loadWorkspace();
        const projectId = (data as { projectId?: string } | null)?.projectId;
        if (projectId) setSelectedId(projectId);
      }
      setComposerOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Research run failed");
    } finally {
      setRunning(false);
    }
  };

  if (authLoading) return <div className="grid min-h-screen place-items-center bg-[#f3f6fb]"><Loader2 className="animate-spin text-[#1f5eff]" /></div>;
  if (connected && !user) return <AuthScreen onAuthenticated={setUser} />;

  return (
    <div className="min-h-screen bg-[#f3f6fb] text-[#101820]">
      <header className="flex h-16 items-center justify-between border-b border-[#cfd7e5] px-4 sm:px-7">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center bg-[#101820] text-white"><BookOpen size={17} /></div>
          <div><strong className="font-display text-lg tracking-tight">Threadline</strong><span className="ml-2 hidden text-xs text-[#667085] sm:inline">evidence-led research</span></div>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#596579]">
          <span className="hidden sm:inline">{connected ? user?.email : "Showcase data"}</span>
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-[#26a269]" : "bg-[#e29a24]"}`} />
          {connected && <button aria-label="Sign out" className="focus-ring p-1.5 hover:bg-white" onClick={() => void insforge?.auth.signOut().then(() => setUser(null))}><LogOut size={16} /></button>}
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-4rem)] min-w-0 lg:grid-cols-[270px_minmax(0,1fr)_330px]">
        <aside className="min-w-0 overflow-hidden border-b border-[#cfd7e5] bg-[#e9eef7] p-4 lg:border-b-0 lg:border-r lg:p-5">
          <button className="focus-ring flex w-full items-center justify-center gap-2 bg-[#1f5eff] px-4 py-3 text-sm font-semibold text-white hover:bg-[#164bd3]" onClick={() => setComposerOpen(true)}><Plus size={17} />New research</button>
          <div className="mt-7 flex items-center justify-between text-xs font-semibold text-[#667085]"><span>Research threads</span><Search size={14} /></div>
          <nav className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1" aria-label="Research projects">
            {projects.map((project) => (
              <button key={project.id} onClick={() => setSelectedId(project.id)} className={`focus-ring min-w-[220px] px-3 py-3 text-left lg:w-full ${selected?.id === project.id ? "bg-white shadow-[inset_3px_0_0_#1f5eff]" : "hover:bg-white/60"}`}>
                <span className="block truncate text-sm font-semibold">{project.title}</span>
                <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[#6b7586]"><CircleDot size={11} className={project.status === "running" ? "text-[#1f5eff]" : "text-[#26a269]"} />{project.status === "running" ? "Collecting sources" : new Date(project.created_at).toLocaleDateString()}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 p-5 sm:p-8 xl:p-10">
          {error && <div role="alert" className="mb-5 border border-[#cb4b3f] bg-[#fff3f1] px-4 py-3 text-sm text-[#8d2d25]">{error}</div>}
          {!selected ? <EmptyResearch onCreate={() => setComposerOpen(true)} /> : <>
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1f5eff]"><Sparkles size={14} />Synthesis</div>
              <h1 className="font-display mt-3 text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{selected.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5f6b7c]">{selected.question}</p>
            </div>
            <article className="mt-9 max-w-3xl border-y border-[#aeb9ca] py-7">
              <p className="font-reading text-[1.05rem] leading-8 text-[#222d3b]">{selected.summary || "Sources are being collected. The synthesis will appear here when the run completes."}</p>
            </article>
            <div className="mt-9 max-w-3xl">
              <h2 className="font-display text-xl font-semibold">Supported findings</h2>
              <div className="mt-5 space-y-6">
                {selectedClaims.map((claim) => (
                  <article key={claim.id} className="grid grid-cols-[42px_1fr] gap-3">
                    <span className="mt-0.5 grid h-8 place-items-center border border-[#1f5eff] font-mono text-[11px] font-bold text-[#1f5eff]">{claim.citation_label}</span>
                    <div>
                      <h3 className="font-display text-base font-semibold leading-6">{claim.claim}</h3>
                      <blockquote className="mt-2 border-l border-[#aeb9ca] pl-4 font-reading text-sm italic leading-6 text-[#657084]">“{claim.quote}”</blockquote>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </>}
        </section>

        <aside className="min-w-0 border-t border-[#cfd7e5] bg-white p-5 lg:border-l lg:border-t-0 lg:p-6">
          <div className="flex items-center justify-between"><h2 className="font-display text-lg font-semibold">Evidence ledger</h2><span className="font-mono text-xs text-[#687386]">{selectedSources.length} sources</span></div>
          <p className="mt-2 text-xs leading-5 text-[#6b7586]">Every finding remains attached to the page that supports it.</p>
          <div className="mt-6 space-y-5">
            {selectedSources.map((source, index) => (
              <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="focus-ring group block border-t border-[#cfd7e5] pt-4">
                <div className="flex items-center justify-between"><span className="font-mono text-[10px] font-bold text-[#1f5eff]">S{index + 1}</span><ExternalLink size={13} className="text-[#8b95a5] group-hover:text-[#1f5eff]" /></div>
                <h3 className="mt-2 text-sm font-semibold leading-5 group-hover:text-[#1f5eff]">{source.title}</h3>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#6b7586]">{source.excerpt}</p>
                <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-[#8a94a4]"><span>{source.domain}</span><span>{source.word_count.toLocaleString()} words · {source.fetch_mode}</span></div>
              </a>
            ))}
          </div>
        </aside>
      </main>

      {composerOpen && <ResearchComposer running={running} onClose={() => setComposerOpen(false)} onRun={runResearch} />}
    </div>
  );
}

function ResearchComposer({ running, onClose, onRun }: { running: boolean; onClose: () => void; onRun: (question: string, urls: string[]) => Promise<void> }) {
  const [question, setQuestion] = useState("How do structure-first browsers change the economics of AI agent workloads?");
  const [urls, setUrls] = useState("https://github.com/lexmount/moli\nhttps://github.com/lexmount/Lexbench-Headless-Browser");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onRun(question, urls.split(/\n|,/).map((value) => value.trim()).filter(Boolean));
  };
  return <div className="fixed inset-0 z-40 grid place-items-center bg-[#101820]/55 p-4" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="research-title" className="w-full max-w-2xl bg-white p-6 shadow-2xl sm:p-8" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between"><div><span className="text-xs font-semibold text-[#1f5eff]">New thread</span><h2 id="research-title" className="font-display mt-2 text-2xl font-semibold">Frame the question before collecting pages.</h2></div><button className="focus-ring p-2 text-[#667085]" onClick={onClose}>Close</button></div>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <label className="block"><span className="text-sm font-semibold">Research question</span><textarea required rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} className="focus-ring mt-2 w-full border border-[#aeb9ca] px-4 py-3 text-sm leading-6" /></label>
        <label className="block"><span className="text-sm font-semibold">Starting URLs</span><textarea required rows={4} value={urls} onChange={(event) => setUrls(event.target.value)} className="focus-ring mt-2 w-full border border-[#aeb9ca] px-4 py-3 font-mono text-xs leading-6" /><small className="mt-2 block text-xs text-[#6b7586]">One URL per line. The server validates public HTTP(S) targets before fetching.</small></label>
        <div className="flex justify-end gap-3 pt-2"><button type="button" className="focus-ring border border-[#aeb9ca] px-4 py-2.5 text-sm font-semibold" onClick={onClose}>Cancel</button><button disabled={running} className="focus-ring flex items-center gap-2 bg-[#1f5eff] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{running ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}Run research</button></div>
      </form>
    </section>
  </div>;
}

function EmptyResearch({ onCreate }: { onCreate: () => void }) {
  return <div className="grid min-h-[65vh] place-items-center text-center"><div><FileText className="mx-auto text-[#1f5eff]" /><h1 className="font-display mt-4 text-3xl font-semibold">Start with a question, not a blank document.</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#687386]">Collect pages, extract evidence, and keep every conclusion connected to its source.</p><button onClick={onCreate} className="focus-ring mt-6 inline-flex items-center gap-2 bg-[#1f5eff] px-5 py-3 text-sm font-semibold text-white">New research <ChevronRight size={16} /></button></div></div>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: { id: string; email?: string }) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!insforge) return;
    const { data, error: authError } = await insforge.auth.signInWithPassword({ email, password });
    if (authError || !data?.user) return setError(authError?.message ?? "Sign in failed");
    onAuthenticated({ id: data.user.id, email: data.user.email });
  };
  return <main className="grid min-h-screen bg-[#f3f6fb] lg:grid-cols-2"><section className="hidden bg-[#101820] p-16 text-white lg:flex lg:flex-col lg:justify-between"><BookOpen size={32} /><div><p className="font-reading max-w-lg text-3xl leading-tight">“A conclusion without a source is just a confident guess.”</p><p className="mt-5 text-sm text-[#aab7ca]">Threadline keeps the evidence attached.</p></div></section><section className="grid place-items-center p-6"><form onSubmit={submit} className="w-full max-w-sm"><Globe2 className="text-[#1f5eff]" /><h1 className="font-display mt-5 text-3xl font-semibold">Sign in to your research desk</h1><p className="mt-2 text-sm text-[#687386]">Your projects and sources are protected by row-level security.</p><label className="mt-7 block text-sm font-semibold">Email<input className="focus-ring mt-2 w-full border border-[#aeb9ca] bg-white px-4 py-3 font-normal" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="mt-4 block text-sm font-semibold">Password<input className="focus-ring mt-2 w-full border border-[#aeb9ca] bg-white px-4 py-3 font-normal" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p role="alert" className="mt-4 text-sm text-[#a33a30]">{error}</p>}<button className="focus-ring mt-6 flex w-full items-center justify-center gap-2 bg-[#1f5eff] px-4 py-3 text-sm font-semibold text-white">Sign in <ArrowRight size={16} /></button></form></section></main>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
