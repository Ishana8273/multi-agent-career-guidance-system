"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Briefcase,
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileText,
  History,
  MessagesSquare,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import PlanSheet from "./PlanSheet";
import type { EngineInfo } from "@/lib/llm";
import type { FeedStatus, LiveJob } from "@/lib/feeds";
import type {
  AgentId,
  CandidateInput,
  Chunk,
  MemoryFact,
  Plan,
  TraceStep,
} from "@/lib/roles";
import { CAREER_FOCUSES } from "@/lib/roles";

/* ---------------------------------- mark ---------------------------------- */

function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M20 6.6A13.4 13.4 0 0 1 33.4 20" />
        <path d="M33.4 20A13.4 13.4 0 0 1 20 33.4" />
        <path d="M20 33.4A13.4 13.4 0 0 1 6.6 20" />
        <path d="M6.6 20A13.4 13.4 0 0 1 20 6.6" />
        <path d="M14.6 14.6 25.4 25.4M25.4 14.6 14.6 25.4" strokeWidth="1" opacity=".55" />
      </g>
      <g fill="currentColor">
        <circle cx="20" cy="6.6" r="3.1" />
        <circle cx="33.4" cy="20" r="3.1" />
        <circle cx="20" cy="33.4" r="3.1" />
        <circle cx="6.6" cy="20" r="3.1" />
      </g>
      <rect x="17.6" y="17.6" width="4.8" height="4.8" fill="currentColor" transform="rotate(45 20 20)" />
    </svg>
  );
}

/* --------------------------------- meta ----------------------------------- */

const AGENTS: {
  id: AgentId;
  code: string;
  name: string;
  model: string;
  role: string;
  Icon: typeof FileText;
}[] = [
  { id: "resume", code: "A1", name: "RESUME", model: "orch-resume-3.1", role: "Bullet linting · impact rewrites · ATS parity", Icon: FileText },
  { id: "skills", code: "A2", name: "SKILLS", model: "orch-skills-3.1", role: "Gap vectors · demand weighting · taxonomy", Icon: Sparkles },
  { id: "job", code: "A3", name: "JOB", model: "orch-job-3.1", role: "Live spec retrieval · fit ranking · bands", Icon: Briefcase },
  { id: "interview", code: "A4", name: "INTERVIEW", model: "orch-interview-3.1", role: "Loop ladder · drill design · calibration", Icon: MessagesSquare },
];

const TONE = {
  live: { c: "#FFA538", cls: "text-amber" },
  done: { c: "#5CE68A", cls: "text-phos" },
  idle: { c: "#5C6A63", cls: "text-alumdim" },
  hand: { c: "#8A9A92", cls: "text-alum" },
} as const;

type Tone = keyof typeof TONE;
type Phase = "idle" | "running" | "done";

const DEFAULT_INPUT: CandidateInput = {
  name: "Priya Raman",
  currentRole: "Software Engineer II, Payments",
  targetRole: "Staff Backend Engineer",
  years: "7",
  stack: "TypeScript, Postgres, Kafka, Kubernetes, gRPC",
  focus: "job switch",
  notes:
    "Led the ledger migration off the legacy monolith; own on-call for money movement; want scope across systems rather than features.",
};

const FOCUS = CAREER_FOCUSES;

interface HistItem {
  id: string;
  createdAt: string | Date;
  targetRole: string;
  name: string;
  score: number;
  tier: string;
}

interface FeedState {
  live: boolean;
  fetchedAt: string;
  sources: FeedStatus[];
  jobs: number;
  facts: MemoryFact[];
}

interface GuidanceAnswer {
  answer: string;
  mode: "model-grounded" | "source-excerpts" | "no-evidence";
  priorRunsSearched: number;
  sources: {
    id: string;
    ref: string;
    source: string;
    excerpt: string;
    score: number;
    savedAt?: string;
  }[];
}

/* ================================ console ================================= */

export default function Console({ history }: { history: HistItem[] }) {
  const [input, setInput] = useState<CandidateInput>(DEFAULT_INPUT);
  const [phase, setPhase] = useState<Phase>("idle");
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [runInput, setRunInput] = useState<CandidateInput | null>(null);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [storage, setStorage] = useState<
    "checking" | "local-file" | "postgres" | "unavailable"
  >("checking");
  const [feed, setFeed] = useState<FeedState | null>(null);
  const [jobs, setJobs] = useState<LiveJob[]>([]);
  const [jobQuery, setJobQuery] = useState("");
  const [jobLoading, setJobLoading] = useState(false);
  const [filter, setFilter] = useState<AgentId | "orchestrator" | "all">("all");
  const [showPlan, setShowPlan] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState("");
  const [guidanceAnswer, setGuidanceAnswer] =
    useState<GuidanceAnswer | null>(null);
  const [hist, setHist] = useState<HistItem[]>(history);
  const [tab, setTab] = useState<"agents" | "council" | "memory">("council");
  const [err, setErr] = useState("");
  const [clock, setClock] = useState("--:--:--");

  /* --------------------------------- clock -------------------------------- */
  useEffect(() => {
    const t = setInterval(
      () => setClock(new Date().toISOString().slice(11, 19)),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/health")
      .then(async (response) => ({
        ok: response.ok,
        status: (await response.json()) as {
          ok?: boolean;
          storage?: string;
        },
      }))
      .then(({ ok, status }) => {
        if (!active) return;
        if (!ok || status.ok === false) {
          setStorage("unavailable");
        } else {
          setStorage(status.storage === "postgres" ? "postgres" : "local-file");
        }
      })
      .catch(() => {
        if (active) setStorage("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  /* --------------------- live job feed (independent GET) ------------------- */
  const loadJobs = useCallback(async (q: string, refresh = false) => {
    if (!q.trim()) return;
    setJobLoading(true);
    try {
      const res = await fetch(
        `/api/jobs?q=${encodeURIComponent(q)}${refresh ? "&refresh=1" : ""}`,
      );
      const d = await res.json();
      setJobs(Array.isArray(d.jobs) ? d.jobs : []);
      setJobQuery(d.query ?? q);
      if (d.fetchedAt) {
        setFeed((f) => ({
          live: d.live,
          fetchedAt: d.fetchedAt,
          sources: d.sources ?? [],
          jobs: d.jobs?.length ?? 0,
          facts: f?.facts ?? [],
        }));
      }
    } catch {
      /* feed unavailable — the panel reports it through sources */
    } finally {
      setJobLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => loadJobs(`${DEFAULT_INPUT.targetRole} ${DEFAULT_INPUT.stack}`),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  /* --------------------------- auto-print the plan ------------------------ */
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setShowPlan(true), 900);
    return () => clearTimeout(t);
  }, [phase]);

  /* ------------------------- consume the SSE council ---------------------- */
  async function start() {
    if (!input.targetRole.trim() || !input.stack.trim()) {
      setErr("target role and stack are required for retrieval.");
      return;
    }
    setErr("");
    setHistOpen(false);
    setTrace([]);
    setChunks([]);
    setFacts([]);
    setPlan(null);
    setShowPlan(false);
    setFilter("all");
    setPhase("running");
    setTab("council");

    let terminalEvent: "plan" | "error" | null = null;
    const handle = (event: string, d: Record<string, unknown>) => {
      if (event === "engine") {
        setEngine(d as unknown as EngineInfo);
      } else if (event === "feed") {
        const f = d as unknown as FeedState;
        setFeed(f);
        if (Array.isArray(f.facts)) setFacts((p) => [...p, ...f.facts]);
      } else if (event === "step") {
        setTrace((p) => [...p, d as unknown as TraceStep]);
      } else if (event === "chunk") {
        const c = d as unknown as Chunk;
        setChunks((p) => [...p, c]);
        setFacts((p) => [
          ...p,
          {
            label: c.ref,
            value: c.text.slice(0, 78) + (c.text.length > 78 ? "…" : ""),
            source: c.collection,
            score: c.score,
          },
        ]);
      } else if (event === "plan") {
        const payload = d as {
          input: CandidateInput;
          trace: TraceStep[];
          chunks: Chunk[];
          plan: Plan;
        };
        if (!payload.input || !Array.isArray(payload.trace) || !payload.plan) {
          throw new Error("run stream returned an invalid plan");
        }
        setTrace(payload.trace);
        setChunks(payload.chunks);
        setPlan(payload.plan);
        setRunInput(payload.input);
        setInput(payload.input);
        setFacts(payload.plan.facts);
        setPhase("done");
        terminalEvent = "plan";
        loadJobs(`${payload.input.targetRole} ${payload.input.stack}`);
        fetch("/api/runs")
          .then((r) => r.json())
          .then((x) => Array.isArray(x?.runs) && setHist(x.runs))
          .catch(() => {});
      } else if (event === "error") {
        setErr(String((d as { message?: string }).message ?? "council failed"));
        setPhase("idle");
        terminalEvent = "error";
      }
    };

    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok || !res.body) {
        const errorBody = await res.json().catch(() => null);
        const message =
          errorBody &&
          typeof errorBody === "object" &&
          "error" in errorBody &&
          typeof errorBody.error === "string"
            ? errorBody.error
            : `run request failed (${res.status})`;
        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let event = "message";
          let data = "";
          for (const line of raw.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (!data) continue;
          try {
            handle(event, JSON.parse(data));
          } catch (error) {
            if (error instanceof SyntaxError) {
              throw new Error("run stream returned malformed event data");
            }
            throw error;
          }
        }
      }
      if (terminalEvent === null) {
        throw new Error("run stream ended before a result was saved");
      }
    } catch (error) {
      if (terminalEvent !== "error") {
        setErr(
          error instanceof Error ? error.message : "career run failed",
        );
        setPhase("idle");
      }
    }
  }

  function reset() {
    setPhase("idle");
    setTrace([]);
    setChunks([]);
    setFacts([]);
    setPlan(null);
    setRunInput(null);
    setFilter("all");
    setErr("");
  }

  async function loadRun(id: string) {
    try {
      const r = await fetch(`/api/runs/${id}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setTrace(d.trace);
      setChunks(d.chunks);
      setPlan(d.plan);
      setRunInput(d.input);
      setInput(d.input);
      setFacts(d.plan.facts);
      setPhase("done");
      setFilter("all");
      setHistOpen(false);
      setTab("council");
    } catch {
      setErr("could not load that run.");
    }
  }

  async function askCareerQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (askLoading) return;
    setAskLoading(true);
    setAskError("");
    setGuidanceAnswer(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: askQuestion,
          candidate: input,
        }),
      });
      const result = (await response.json()) as
        | GuidanceAnswer
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in result && result.error
            ? result.error
            : `question request failed (${response.status})`,
        );
      }
      if (
        !("answer" in result) ||
        typeof result.answer !== "string" ||
        !Array.isArray(result.sources)
      ) {
        throw new Error("question service returned an invalid response");
      }
      setGuidanceAnswer(result);
    } catch (error) {
      setAskError(
        error instanceof Error ? error.message : "could not answer question",
      );
    } finally {
      setAskLoading(false);
    }
  }

  /* ------------------------------- derivations ---------------------------- */
  const cur = phase === "running" ? trace[trace.length - 1] : undefined;

  const statusOf = (id: AgentId): { label: string; tone: Tone } => {
    if (phase === "idle") return { label: "STANDBY", tone: "idle" };
    const mine = trace.filter((s) => s.agent === id);
    if (phase === "done") return { label: "DONE", tone: "done" };
    if (mine.length && mine[mine.length - 1].phase === "handoff")
      return { label: "DONE", tone: "done" };
    if (cur?.agent === id)
      return {
        label: cur.phase === "retrieve" ? "RETRIEVING" : "REASONING",
        tone: "live",
      };
    if (mine.length) return { label: "HANDOFF", tone: "hand" };
    return { label: "QUEUED", tone: "idle" };
  };

  const confOf = (id: AgentId) => {
    const cs = chunks.filter((c) => c.agent === id);
    if (!cs.length) return "0.710";
    return (cs.reduce((a, c) => a + c.score, 0) / cs.length).toFixed(3);
  };

  const lastOf = (id: AgentId) => {
    const mine = trace.filter((s) => s.agent === id);
    return mine.length ? mine[mine.length - 1].text : "awaiting dispatch";
  };

  const lit = (id: AgentId) => trace.some((s) => s.agent === id);
  const progress = plan ? 1 : Math.min(1, trace.length / 17);

  const cited = useMemo(() => {
    const set = new Set<string>();
    for (const s of trace) for (const c of s.citations ?? []) set.add(c);
    return set;
  }, [trace]);

  const steps = trace.filter((s) => filter === "all" || s.agent === filter);
  const set = (k: keyof CandidateInput, v: string) =>
    setInput((p) => ({ ...p, [k]: v }));

  const engineKind = engine?.kind ?? "local";

  /* --------------------------------- layout -------------------------------- */
  return (
    <div className="housing flex h-dvh flex-col overflow-hidden">
      {/* ------------------------------ top rail ----------------------------- */}
      <header className="raised flex shrink-0 items-center justify-between gap-4 border-b border-hair bg-rack/80 px-4 py-3">
        <div className="flex items-center gap-3.5">
          <Mark className="h-8 w-8 text-phos glow" />
          <div>
            <div className="flex items-baseline gap-2.5">
              <span
                className="text-[17px] leading-none tracking-[0.26em] text-alum"
                style={{ fontWeight: 600 }}
              >
                ORCHESTRA
              </span>
              <span className="lbl hidden text-alumdim sm:inline">
                multi-agent career guidance · college project
              </span>
            </div>
            <div className="lbl mt-1.5 text-alumdim">
              shared blackboard · career retrieval · optional live feeds
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAskOpen(true)}
            className="flex items-center gap-2 border border-phos/50 bg-phosdim/30 px-3 py-2 font-mono text-[10px] tracking-[0.18em] text-phos uppercase transition-colors hover:bg-phosdim/60"
          >
            <MessagesSquare size={12} /> Ask guidance
          </button>
          <button
            onClick={() => setBriefOpen(true)}
            className="flex items-center gap-2 border border-hair bg-recess px-3 py-2 font-mono text-[10px] tracking-[0.18em] text-alum uppercase transition-colors hover:border-phos hover:text-phos"
          >
            <BookOpen size={12} /> Project brief
          </button>
          <span
            title={
              engineKind === "llm"
                ? `${engine?.provider} ${engine?.model}`
                : "no LLM key configured — optionally set an OpenAI, Groq, OpenRouter, Anthropic, or Gemini provider key for external narrative generation"
            }
            className="hidden items-center gap-2 border px-2.5 py-1.5 md:flex"
            style={{
              borderColor: engineKind === "llm" ? "#2DBE62" : "#4A2F0D",
              background: engineKind === "llm" ? "#0F3D22" : "#1a140a",
            }}
          >
            <span
              className={`h-[6px] w-[6px] rounded-full ${engineKind === "llm" ? "led-live" : ""}`}
              style={{
                background: engineKind === "llm" ? "#5CE68A" : "#FFA538",
                boxShadow: `0 0 6px ${engineKind === "llm" ? "#5CE68A" : "#FFA538"}`,
              }}
            />
            <span
              className="font-mono text-[9px] tracking-[0.16em] uppercase"
              style={{ color: engineKind === "llm" ? "#A8F5C6" : "#FFA538" }}
            >
              {engine
                ? `${engine.provider} · ${engine.model}`
                : "engine · probing"}
            </span>
          </span>

          <div className="mr-1 hidden items-center gap-3 md:flex">
            {[
              ["STORE", "#5CE68A"],
              ["VEC", feed?.live ? "#5CE68A" : "#FFA538"],
              ["LLM", phase === "running" ? "#FFA538" : "#5CE68A"],
            ].map(([l, c]) => (
              <span key={l} className="flex items-center gap-1.5">
                <span
                  className={`h-[7px] w-[7px] rounded-full ${phase === "running" ? "led-live" : ""}`}
                  style={{ background: c, boxShadow: `0 0 7px ${c}` }}
                />
                <span className="lbl text-alumdim">{l}</span>
              </span>
            ))}
          </div>

          <button
            onClick={() => setHistOpen(true)}
            className="flex items-center gap-2 border border-hair bg-recess px-3 py-2 font-mono text-[10px] tracking-[0.18em] text-alum uppercase transition-colors hover:border-phos hover:text-phos"
          >
            <History size={12} /> Runs
          </button>
        </div>
      </header>

      {/* mobile tab bar */}
      <div className="flex shrink-0 border-b border-hair bg-rack lg:hidden">
        {(["agents", "council", "memory"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 border-b-2 py-2.5 font-mono text-[10px] tracking-[0.18em] uppercase transition-colors ${
              tab === t
                ? "border-phos text-phos"
                : "border-transparent text-alumdim"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ------------------------------- rack -------------------------------- */}
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[1fr] lg:grid-cols-[272px_1fr_330px]">
        {/* -------------------------- agent roster -------------------------- */}
        <section
          className={`${tab === "agents" ? "flex" : "hidden"} min-h-0 flex-col overflow-hidden border-r border-hair bg-rack/60 lg:flex`}
        >
          <div className="flex items-center justify-between border-b border-hair px-4 py-3">
            <span className="lbl text-alumdim">agent roster</span>
            <span className="lbl text-alumdim">4 / 4</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {AGENTS.map((a) => {
              const st = statusOf(a.id);
              const active = filter === a.id;
              const tone = TONE[st.tone];
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    setFilter(active ? "all" : a.id);
                    setTab("council");
                  }}
                  className={`recess relative mb-2.5 block w-full overflow-hidden border p-3 text-left transition-colors ${
                    active ? "border-phos/60" : "border-hair hover:border-alumdim"
                  } ${st.tone === "live" ? "sweep" : ""}`}
                >
                  <div className="flex items-center gap-2.5">
                    <a.Icon size={13} color={tone.c} />
                    <span
                      className="text-[12px] tracking-[0.16em] text-alum"
                      style={{ fontWeight: 600 }}
                    >
                      {a.name}
                    </span>
                    <span className="lbl ml-auto" style={{ color: tone.c }}>
                      {st.label}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className="h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{
                        background: tone.c,
                        boxShadow:
                          st.tone === "idle" ? "none" : `0 0 8px ${tone.c}`,
                      }}
                    />
                    <span className="lbl text-alumdim">{a.model}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-[4px] flex-1 bg-hull">
                      <motion.div
                        className="h-full"
                        style={{ background: tone.c }}
                        animate={{ width: `${Number(confOf(a.id)) * 100}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                    <span className="num text-[10px] text-alumdim">
                      {confOf(a.id)}
                    </span>
                  </div>

                  <p className="mt-2.5 font-mono text-[10px] leading-[1.5] text-alumdim">
                    {a.role}
                  </p>
                  <p className="mt-2 truncate border-t border-hair pt-2 font-mono text-[10px] text-alum">
                    ↳ {lastOf(a.id)}
                  </p>
                </button>
              );
            })}

            <div className="recess mt-4 border border-hair p-3">
              <div className="lbl text-alumdim">orchestrator</div>
              <p className="mt-2 font-mono text-[10px] leading-[1.6] text-alum">
                round-robin dispatch over one shared blackboard. each agent
                writes facts, the next reads them — and everything the council
                committed on an earlier run is re-read before it reasons.
              </p>
            </div>
          </div>
        </section>

        {/* --------------------------- council loop -------------------------- */}
        <section
          className={`${tab === "council" ? "flex" : "hidden"} min-h-0 flex-col overflow-hidden bg-hull/60 lg:flex`}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hair px-4 py-3">
            <span className="lbl text-alumdim">
              {phase === "idle" ? "intake" : "council loop · sse"}
            </span>
            <div className="flex items-center gap-2">
              {filter !== "all" && (
                <button
                  onClick={() => setFilter("all")}
                  className="border border-phos/50 px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-phos uppercase"
                >
                  filter: {filter} ×
                </button>
              )}
              {phase !== "idle" && (
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 border border-hair px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-alum uppercase hover:border-alum hover:text-alum"
                >
                  <RotateCcw size={10} /> reset
                </button>
              )}
            </div>
          </div>

          {/* ---------------------------- idle: intake --------------------- */}
          {phase === "idle" && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div
                className="relative border-b border-hair"
                style={{
                  backgroundImage:
                    "radial-gradient(ellipse at 78% 12%, rgba(92,230,138,.12), transparent 45%), linear-gradient(110deg, rgba(11,13,12,.98), rgba(20,30,24,.88))",
                }}
              >
                <div className="flex min-h-[210px] flex-col justify-end p-6">
                  <div className="lbl text-phos">career profile intake</div>
                  <h1
                    className="mt-3 max-w-[16ch] text-[clamp(1.9rem,3.6vw,3rem)] leading-[0.95] tracking-[-0.035em] text-alum"
                    style={{ fontWeight: 600 }}
                  >
                    One career goal.
                    <br />
                    Four specialist agents.
                    <span className="text-phos glow"> One plan.</span>
                  </h1>
                  <p className="mt-4 max-w-[64ch] text-[13px] leading-[1.65] text-alum">
                    ORCHESTRA is a college project prototype for career
                    decision support. It combines resume, skills, job-market,
                    and interview perspectives into one evidence-linked
                    development plan.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2 font-mono text-[10px] tracking-[0.14em] text-alumdim uppercase">
                    <span>4 specialised agents</span>
                    <span>bundled career corpus</span>
                    <span>optional live job feeds</span>
                    <span>streamed, traceable workflow</span>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="subject name">
                    <input
                      className={inputCls}
                      value={input.name}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder="your name"
                    />
                  </Field>
                  <Field label="years of experience">
                    <input
                      className={inputCls}
                      value={input.years}
                      onChange={(e) => set("years", e.target.value)}
                      inputMode="numeric"
                      placeholder="7"
                    />
                  </Field>
                  <Field label="current role">
                    <input
                      className={inputCls}
                      value={input.currentRole}
                      onChange={(e) => set("currentRole", e.target.value)}
                      placeholder="Software Engineer II"
                    />
                  </Field>
                  <Field label="target role">
                    <input
                      className={targetInputCls}
                      value={input.targetRole}
                      onChange={(e) => set("targetRole", e.target.value)}
                      placeholder="Staff Backend Engineer"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="declared stack — drives retrieval">
                      <input
                        className={inputCls}
                        value={input.stack}
                        onChange={(e) => set("stack", e.target.value)}
                        placeholder="TypeScript, Postgres, Kafka, Kubernetes"
                      />
                    </Field>
                  </div>
                  <Field label="intent">
                    <select
                      className={inputCls}
                      value={input.focus}
                      onChange={(e) => set("focus", e.target.value)}
                    >
                      {FOCUS.map((f) => (
                        <option key={f} value={f} className="bg-rack">
                          {f}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="context notes">
                    <input
                      className={inputCls}
                      value={input.notes}
                      onChange={(e) => set("notes", e.target.value)}
                      placeholder="anything the council should weigh"
                    />
                  </Field>
                </div>

                {err && (
                  <p className="mt-4 border border-amber/50 bg-amberdim/40 px-3 py-2 font-mono text-[11px] text-amber">
                    ! {err}
                  </p>
                )}

                <button
                  onClick={start}
                  className="mt-5 flex w-full items-center justify-center gap-3 bg-phos px-5 py-4 font-mono text-[12px] tracking-[0.24em] text-hull uppercase transition-colors hover:bg-phosbright"
                >
                  <Play size={14} /> convene the council
                </button>
                <p className="mt-2.5 font-mono text-[10px] leading-[1.6] text-alumdim">
                  POST /api/runs → server-sent event stream. the route searches
                  the career corpus, optionally fetches live job feeds, re-reads
                  prior run memory, and runs the four specialist agents. the
                  plan is saved to{" "}
                  {storage === "postgres"
                    ? "postgres"
                    : storage === "local-file"
                      ? "local data/runs.json"
                      : storage === "checking"
                        ? "storage being checked"
                        : "unavailable storage"}.
                </p>
              </div>
            </div>
          )}

          {/* -------------------------- running / done ---------------------- */}
          {phase !== "idle" && trace.length > 0 && (
            <>
              {/* signal path */}
              <div className="shrink-0 border-b border-hair bg-rack/60 px-5 py-4">
                <div className="flex items-center">
                  {AGENTS.map((a, i) => (
                    <Fragment key={a.id}>
                      <div className="flex shrink-0 flex-col items-center gap-2">
                        <motion.div
                          animate={{
                            backgroundColor: lit(a.id)
                              ? cur?.agent === a.id
                                ? "#FFA538"
                                : "#5CE68A"
                              : "#1E2422",
                            boxShadow: lit(a.id)
                              ? `0 0 14px ${cur?.agent === a.id ? "#FFA538" : "#5CE68A"}`
                              : "0 0 0px rgba(0,0,0,0)",
                          }}
                          transition={{ duration: 0.12 }}
                          className="h-3.5 w-3.5 rotate-45 border"
                          style={{
                            borderColor: lit(a.id)
                              ? cur?.agent === a.id
                                ? "#FFA538"
                                : "#5CE68A"
                              : "#2A322E",
                          }}
                        />
                        <span
                          className="lbl"
                          style={{ color: lit(a.id) ? "#8A9A92" : "#5C6A63" }}
                        >
                          {a.code}
                        </span>
                      </div>
                      {i < AGENTS.length - 1 && (
                        <div className="relative mx-1.5 mb-5 h-px flex-1 bg-hair">
                          <motion.div
                            className="absolute inset-y-0 left-0 bg-phos"
                            initial={{ width: "0%" }}
                            animate={{
                              width: lit(AGENTS[i + 1].id) ? "100%" : "0%",
                            }}
                            transition={{ duration: 0.45, ease: "easeOut" }}
                            style={{ boxShadow: "0 0 8px #5CE68A" }}
                          />
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div className="h-[3px] flex-1 bg-hull">
                    <motion.div
                      className="h-full bg-phos"
                      animate={{ width: `${progress * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <span className="num text-[10px] text-alumdim">
                    {String(trace.length).padStart(2, "0")}/
                    {plan ? trace.length : "··"}
                  </span>
                </div>
              </div>

              {/* streamed log */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {steps.map((s, n) => {
                  const isLast = n === steps.length - 1;
                  const col =
                    s.agent === "orchestrator"
                      ? "#8A9A92"
                      : s.phase === "handoff"
                        ? "#FFA538"
                        : s.phase === "retrieve"
                          ? "#A8F5C6"
                          : "#5CE68A";
                  const tag =
                    s.agent === "orchestrator" ? "ORCH" : s.agent.toUpperCase();
                  return (
                    <motion.div
                      key={s.i}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18 }}
                      className="grid grid-cols-[46px_78px_1fr] gap-2 border-l-2 py-[3px] pl-2 font-mono text-[12px] leading-[1.5]"
                      style={{ borderLeftColor: "#2A322E" }}
                    >
                      <span className="num text-alumdim">
                        {String(s.i).padStart(3, "0")}
                      </span>
                      <span
                        className="truncate tracking-[0.1em]"
                        style={{ color: col }}
                      >
                        {tag}
                      </span>
                      <span className="break-words text-alum">
                        {s.text}
                        {isLast && phase === "running" && (
                          <span className="caret ml-0.5 text-phos">▌</span>
                        )}
                        {(s.citations?.length ?? 0) > 0 && (
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            {s.citations!.map((c) => (
                              <span
                                key={c}
                                className="border border-phosdim bg-phosdim/40 px-1.5 py-[1px] text-[10px] text-phos"
                              >
                                rag:{c}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    </motion.div>
                  );
                })}
                {steps.length === 0 && (
                  <p className="font-mono text-[11px] text-alumdim">
                    no steps for this agent in the current trace.
                  </p>
                )}
              </div>

              {/* footer bar */}
              {phase === "done" && plan && (
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-hair bg-rack px-4 py-3">
                  <span className="lbl text-phos glow">
                    plan committed · {plan.verdict.tier}{" "}
                    {plan.verdict.score}/100
                  </span>
                  <button
                    onClick={() => setShowPlan(true)}
                    className="flex items-center gap-2 bg-amber px-4 py-2.5 font-mono text-[11px] tracking-[0.2em] text-hull uppercase transition-colors hover:bg-amber/85"
                  >
                    print plan <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </>
          )}

          {phase !== "idle" && trace.length === 0 && !err && (
            <div className="flex flex-1 items-center justify-center">
              <span className="lbl animate-pulse text-phos">
                establishing stream…
              </span>
            </div>
          )}
        </section>

        {/* ------------------------ feeds + memory rail ----------------------- */}
        <section
          className={`${tab === "memory" ? "flex" : "hidden"} min-h-0 flex-col overflow-hidden border-l border-hair bg-rack/60 lg:flex`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-hair px-4 py-3">
            <span className="lbl text-alumdim">live job feed</span>
            <button
              onClick={() =>
                loadJobs(
                  jobQuery || `${input.targetRole} ${input.stack}`,
                  true,
                )
              }
              disabled={jobLoading}
              className="flex items-center gap-1.5 border border-hair px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-alum uppercase transition-colors hover:border-phos hover:text-phos disabled:opacity-40"
            >
              <RefreshCw size={10} className={jobLoading ? "animate-spin" : ""} />
              {jobLoading ? "get" : "refresh"}
            </button>
          </div>

          <div className="shrink-0 border-b border-hair px-3 py-2.5">
            <div className="lbl mb-2 text-alumdim">
              GET /api/jobs · {feed?.fetchedAt?.slice(11, 19) ?? "--:--:--"}Z
            </div>
            {(feed?.sources ?? []).map((s) => (
              <div
                key={s.source}
                className="flex items-center gap-2 py-[3px] font-mono text-[10px]"
              >
                <span
                  className="h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{
                    background: s.ok ? "#5CE68A" : "#FFA538",
                    boxShadow: `0 0 5px ${s.ok ? "#5CE68A" : "#FFA538"}`,
                  }}
                />
                <span className="w-[74px] shrink-0 text-alum">{s.source}</span>
                <span className="num text-alumdim">
                  {s.matched}/{s.count}
                </span>
                <span className="num ml-auto text-alumdim">{s.ms}ms</span>
              </div>
            ))}
            {!feed && (
              <p className="font-mono text-[10px] text-alumdim">
                querying public job apis…
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {jobs.slice(0, 5).map((j) => (
              <a
                key={`${j.title}-${j.company}`}
                href={j.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="recess mb-2 block border border-hair p-2.5 transition-colors hover:border-phos/60"
              >
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-[12px] leading-[1.35] text-alum">
                    {j.title}
                  </span>
                  <ExternalLink size={11} className="mt-0.5 shrink-0 text-alumdim" />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[11px] text-phos">{j.company}</span>
                  <span className="lbl text-alumdim">{j.location}</span>
                  <span className="ml-auto border border-hair px-1.5 py-[1px] font-mono text-[9px] tracking-[0.12em] text-alumdim uppercase">
                    {j.source}
                  </span>
                </div>
              </a>
            ))}
            {jobs.length === 0 && !jobLoading && (
              <p className="font-mono text-[10px] leading-[1.7] text-alumdim">
                no live postings matched the query. the corpus feed still
                ranks local specs.
              </p>
            )}

            <div className="mt-5 flex items-center justify-between border-b border-hair pb-2">
              <span className="lbl text-alumdim">shared memory</span>
              <span className="num text-[10px] text-phos">{facts.length}</span>
            </div>

            <div className="mt-2.5">
              {facts.length === 0 && (
                <div className="recess border border-dashed border-hair p-4">
                  <p className="font-mono text-[11px] leading-[1.7] text-alumdim">
                    blackboard empty.
                    <br />
                    <br />
                    agents write facts here during the run; each carries its
                    source collection and cosine similarity so the plan stays
                    auditable.
                  </p>
                </div>
              )}

              {facts.map((f, i) => {
                const isChunk = f.label.includes("#");
                const isPrior = f.source === "memory:prior";
                return (
                  <motion.div
                    key={f.label + i}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                    className={`recess mb-2 border p-2.5 ${
                      isPrior
                        ? "border-amberdim"
                        : isChunk
                          ? "border-phosdim"
                          : "border-hair"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="truncate font-mono text-[10px] tracking-[0.08em]"
                        style={{
                          color: isPrior
                            ? "#FFA538"
                            : isChunk
                              ? "#5CE68A"
                              : "#8A9A92",
                        }}
                      >
                        {f.label}
                      </span>
                      <span
                        className="num shrink-0 text-[10px]"
                        style={{
                          color:
                            f.score >= 0.75
                              ? "#5CE68A"
                              : f.score >= 0.5
                                ? "#FFA538"
                                : "#5C6A63",
                        }}
                      >
                        {f.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-[1.5] text-alum">
                      {f.value}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="lbl text-alumdim">{f.source}</span>
                      <div className="h-[3px] w-16 bg-hull">
                        <div
                          className="h-full bg-phosmid"
                          style={{ width: `${Math.min(100, f.score * 100)}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {cited.size > 0 && (
              <div className="lbl mt-4 border-t border-hair pt-3 text-alumdim">
                {cited.size} relevant corpus passages retrieved this run
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-hair px-4 py-2.5">
            <div className="lbl text-alumdim">
              bundled corpus · bag-of-terms cosine · 4 collections
            </div>
          </div>
        </section>
      </main>

      {/* ----------------------------- status strip ---------------------------- */}
      <footer className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-t border-hair bg-rack px-4 py-2">
        {[
          ["state", phase.toUpperCase()],
          ["steps", String(trace.length)],
          ["chunks", String(chunks.length)],
          ["facts", String(facts.length)],
          ["feed", feed?.live ? "LIVE" : feed ? "DOWN" : "—"],
          ["model", engineKind === "llm" ? "LLM" : "LOCAL"],
          [
            "persist",
            plan
              ? storage === "postgres"
                ? "POSTGRES ✓"
                : storage === "local-file"
                  ? "LOCAL FILE ✓"
                  : "STORAGE DOWN"
              : phase === "running"
                ? "PENDING"
                : storage === "unavailable"
                  ? "STORAGE DOWN"
                  : "—",
          ],
          ["utc", clock],
        ].map(([k, v]) => (
          <span key={k} className="flex items-center gap-2">
            <span className="lbl text-alumdim">{k}</span>
            <span
              className="num text-[10px]"
              style={{
                color:
                  v === "DONE" ||
                  v === "POSTGRES ✓" ||
                  v === "LOCAL FILE ✓" ||
                  v === "LIVE" ||
                  v === "LLM"
                    ? "#5CE68A"
                    : v === "RUNNING" ||
                        v === "DOWN" ||
                        v === "LOCAL" ||
                        v === "STORAGE DOWN"
                      ? "#FFA538"
                      : "#8A9A92",
              }}
            >
              {v}
            </span>
          </span>
        ))}
        <span className="lbl ml-auto hidden text-alumdim sm:inline">
          orchestra console · sse
        </span>
      </footer>

      {/* ------------------------------- overlays ------------------------------ */}
      <AnimatePresence>
        {showPlan && plan && runInput && (
          <PlanSheet
            input={runInput}
            plan={plan}
            stamped={new Date().toISOString().slice(0, 10)}
            onClose={() => setShowPlan(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {briefOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close project brief"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBriefOpen(false)}
              className="fixed inset-0 z-40 cursor-default bg-hull/85"
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-brief-title"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              className="fixed inset-x-4 top-[8vh] z-50 mx-auto max-h-[84vh] max-w-3xl overflow-y-auto border border-hair bg-rack p-5 shadow-2xl sm:inset-x-auto sm:w-[min(760px,92vw)] sm:p-8"
            >
              <div className="flex items-start justify-between gap-5 border-b border-hair pb-4">
                <div>
                  <div className="lbl text-phos">college project overview</div>
                  <h2
                    id="project-brief-title"
                    className="mt-2 text-2xl tracking-tight text-cream"
                    style={{ fontWeight: 600 }}
                  >
                    ORCHESTRA
                  </h2>
                  <p className="mt-1 font-mono text-[11px] text-alumdim">
                    Multi-Agent Career Guidance System
                  </p>
                </div>
                <button
                  onClick={() => setBriefOpen(false)}
                  aria-label="Close project brief"
                  className="text-alumdim transition-colors hover:text-phos"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-5 space-y-5 text-[13px] leading-[1.7] text-alum">
                <section>
                  <h3 className="lbl text-phos">Abstract</h3>
                  <p className="mt-2">
                    ORCHESTRA is an educational decision-support prototype
                    that coordinates resume, skills, job, and interview
                    specialists to turn a candidate profile and target role
                    into one evidence-linked career development plan. The
                    agents share retrieved passages and intermediate findings
                    through a blackboard, stream their workflow to the
                    interface, and save plans so users can revisit them.
                  </p>
                </section>
                <section>
                  <h3 className="lbl text-phos">Problem and aim</h3>
                  <p className="mt-2">
                    Career preparation involves disconnected information about
                    experience, competencies, job requirements, and interview
                    expectations. This project demonstrates a coordinated
                    workflow for bringing those perspectives together and
                    translating them into practical next steps.
                  </p>
                </section>
                <section>
                  <h3 className="lbl text-phos">Method and architecture</h3>
                  <p className="mt-2">
                    Candidate intake → bundled-corpus retrieval and optional
                    job-feed retrieval → sequential specialist-agent analysis
                    → shared blackboard → streamed career plan → saved run
                    history. Ask guidance searches the career corpus, current
                    profile notes, and matching saved runs, then displays
                    supporting sources.
                    Retrieval uses bag-of-terms cosine scoring; external model
                    generation is optional and evidence-grounded.
                  </p>
                </section>
                <section>
                  <h3 className="lbl text-phos">Project outputs</h3>
                  <p className="mt-2">
                    The report includes editable resume templates with
                    placeholders, estimated target-role skill gaps,
                    illustrative role archetypes alongside any live postings,
                    an interview preparation ladder, a quarterly roadmap, and
                    cited retrieved passages. Ask guidance adds free-form,
                    career-focused questions against this evidence. The
                    workflow trace makes each agent step observable.
                  </p>
                </section>
                <section className="border border-amber/40 bg-amberdim/30 p-3">
                  <h3 className="lbl text-amber">Scope and responsible use</h3>
                  <p className="mt-2 text-alum">
                    This is a college project prototype, not a validated
                    employment assessment. Readiness and match scores are
                    rule-based heuristics; skill gaps are estimates from
                    declared inputs. Replace every resume placeholder only
                    with facts you can verify. Optional AI providers may
                    process submitted profile text; avoid entering sensitive
                    information.
                  </p>
                </section>
              </div>
              <div className="mt-6 flex justify-end border-t border-hair pt-4">
                <button
                  onClick={() => setBriefOpen(false)}
                  className="border border-phos/50 px-4 py-2 font-mono text-[10px] tracking-[0.16em] text-phos uppercase hover:bg-phosdim"
                >
                  Return to console
                </button>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {askOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close career guidance"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAskOpen(false)}
              className="fixed inset-0 z-40 cursor-default bg-hull/85"
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="career-question-title"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              className="fixed inset-x-4 top-[5vh] z-50 mx-auto max-h-[90vh] max-w-3xl overflow-y-auto border border-phos/40 bg-rack p-5 shadow-2xl sm:inset-x-auto sm:w-[min(820px,94vw)] sm:p-8"
            >
              <div className="flex items-start justify-between gap-5 border-b border-hair pb-4">
                <div>
                  <div className="lbl text-phos">evidence-grounded · career questions</div>
                  <h2
                    id="career-question-title"
                    className="mt-2 text-xl tracking-tight text-cream sm:text-2xl"
                    style={{ fontWeight: 600 }}
                  >
                    Ask ORCHESTRA
                  </h2>
                  <p className="mt-2 max-w-[68ch] text-[12px] leading-[1.6] text-alumdim">
                    Ask about resumes, role skills, interview preparation, or
                    career planning. Search uses the entered target role and
                    stack, the built-in career corpus, and saved runs with the
                    same candidate name and roles.
                  </p>
                </div>
                <button
                  onClick={() => setAskOpen(false)}
                  aria-label="Close career guidance"
                  className="text-alumdim transition-colors hover:text-phos"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={askCareerQuestion} className="mt-5">
                <label
                  htmlFor="career-question"
                  className="lbl text-alumdim"
                >
                  your career question
                </label>
                <textarea
                  id="career-question"
                  value={askQuestion}
                  onChange={(event) => setAskQuestion(event.target.value)}
                  maxLength={700}
                  rows={3}
                  placeholder="What should I learn first to move into a staff backend role?"
                  className="mt-2 w-full resize-y border border-hair bg-recess px-3 py-3 text-[13px] leading-[1.6] text-cream outline-none placeholder:text-alumdim focus:border-phos"
                  required
                />
                <div className="mt-1 flex justify-between font-mono text-[9px] text-alumdim">
                  <span>
                    Profile: {input.name || "unnamed"} · {input.targetRole}
                  </span>
                  <span>{askQuestion.length}/700</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-[9px] text-alumdim">
                    Retrieval is keyword-based. Without an AI provider key,
                    the app returns cited source excerpts instead of generated
                    prose. If configured, the provider receives your question,
                    profile context, and retrieved excerpts.
                  </span>
                  <button
                    type="submit"
                    disabled={askLoading || !askQuestion.trim()}
                    className="flex items-center gap-2 bg-phos px-4 py-2.5 font-mono text-[10px] tracking-[0.16em] text-hull uppercase transition-colors hover:bg-phosbright disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <MessagesSquare size={13} />
                    {askLoading ? "searching sources…" : "get grounded guidance"}
                  </button>
                </div>
              </form>

              {askError && (
                <p
                  role="alert"
                  className="mt-4 border border-amber/50 bg-amberdim/40 px-3 py-2 font-mono text-[11px] text-amber"
                >
                  ! {askError}
                </p>
              )}

              {guidanceAnswer && (
                <div className="mt-6 border-t border-hair pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="lbl text-phos">response</h3>
                    <span className="font-mono text-[9px] tracking-[0.12em] text-alumdim uppercase">
                      {guidanceAnswer.mode === "model-grounded"
                        ? "model response · cited"
                        : guidanceAnswer.mode === "no-evidence"
                          ? "no supporting evidence"
                          : "retrieved source excerpts"}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-[13px] leading-[1.75] text-alum">
                    {guidanceAnswer.answer}
                  </p>

                  {guidanceAnswer.sources.length > 0 && (
                    <section className="mt-5">
                      <div className="lbl text-alumdim">
                        supporting sources ·{" "}
                        {guidanceAnswer.priorRunsSearched} matching saved runs
                        searched
                      </div>
                      <div className="mt-2 space-y-2">
                        {guidanceAnswer.sources.map((source) => (
                          <article
                            key={`${source.id}-${source.ref}-${source.savedAt ?? ""}`}
                            className="recess border border-hair p-3"
                          >
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="font-mono text-[10px] text-phos">
                                [{source.id}]
                              </span>
                              <span className="font-mono text-[10px] text-alum">
                                {source.ref}
                              </span>
                              <span className="lbl text-alumdim">
                                {source.source}
                              </span>
                              <span className="num ml-auto text-[9px] text-alumdim">
                                similarity {source.score.toFixed(3)}
                              </span>
                            </div>
                            <p className="mt-2 text-[12px] leading-[1.6] text-alumdim">
                              {source.excerpt}
                            </p>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                  <p className="mt-4 border border-amber/35 bg-amberdim/20 p-3 font-mono text-[10px] leading-[1.6] text-alumdim">
                    This prototype can miss relevant passages or retrieve
                    incomplete context. Verify recommendations against your
                    actual experience; the result is not a validated career
                    assessment.
                  </p>
                </div>
              )}
            </motion.section>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {histOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistOpen(false)}
              className="fixed inset-0 z-40 bg-hull/80"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 right-0 z-50 flex w-[min(420px,92vw)] flex-col border-l border-hair bg-rack"
            >
              <div className="flex items-center justify-between border-b border-hair px-4 py-3">
                <span className="lbl text-alumdim">saved run history</span>
                <button
                  onClick={() => setHistOpen(false)}
                  className="text-alumdim hover:text-phos"
                  aria-label="close history"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {hist.length === 0 && (
                  <p className="p-3 font-mono text-[11px] text-alumdim">
                    no committed runs yet.
                  </p>
                )}
                {hist.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => loadRun(h.id)}
                    className="recess mb-2 flex w-full items-center gap-3 border border-hair p-3 text-left transition-colors hover:border-phos/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-alum">
                        {h.targetRole}
                      </div>
                      <div className="lbl mt-1.5 text-alumdim">
                        {h.name} ·{" "}
                        {new Date(h.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-[17px] text-phos">{h.score}</div>
                      <div className="lbl mt-1 text-alumdim">{h.tier}</div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------- fields --------------------------------- */

const inputCls =
  "w-full border border-hair bg-recess px-3 py-2.5 font-mono text-[13px] text-phosbright outline-none transition-colors placeholder:text-alumdim/70 focus:border-phos";

const targetInputCls =
  "w-full border border-phos/55 bg-recess px-3 py-2.5 font-mono text-[13px] text-phosbright outline-none transition-colors placeholder:text-alumdim/70 focus:border-phos";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="lbl mb-1.5 block text-alumdim">{label}</span>
      {children}
    </label>
  );
}
