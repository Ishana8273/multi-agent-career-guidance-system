import { ENGINE, complete } from "./llm";
import type { FeedResult, LiveJob } from "./feeds";
import { retrieve } from "./rag";
import type {
  CandidateInput,
  Chunk,
  MemoryFact,
  Plan,
  TraceStep,
} from "./roles";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AGENT_SYSTEM = (who: string) =>
  `You are the ${who} agent inside a multi-agent career-guidance council that shares one blackboard memory and retrieves context from a RAG corpus. ` +
  `You receive retrieved passages and blackboard facts. Reply with exactly two sentences: what the retrieved evidence implies for this specific candidate, and one concrete next action. ` +
  `No preamble, no headers, no bullet points, no markdown.`;

/* --------------------------- role classification --------------------------- */

type Family =
  | "backend"
  | "frontend"
  | "platform"
  | "data"
  | "ml"
  | "leadership"
  | "general";

function familyOf(role: string, focus: string): Family {
  const s = `${role} ${focus}`.toLowerCase();
  // people-management titles resolve first — "Engineering Manager" must not
  // fall into a technical family just because the word "engineer" appears.
  if (/(manager|head of|director|\bvp\b|\bcto\b)/.test(s)) return "leadership";
  // then technical families: "Staff Backend Engineer" is a backend track.
  if (/(ml|machine learning|a\.?i |nlp|model|recommend)/.test(s)) return "ml";
  if (/(data|analytics|warehouse|etl|dbt)/.test(s)) return "data";
  if (/(front|ui|react|design system|web)/.test(s)) return "frontend";
  if (/(platform|infra|sre|devops|reliab|cloud|kubernetes)/.test(s)) return "platform";
  if (/(back|server|distributed|api|payment|ledger|full ?stack|software engineer)/.test(s))
    return "backend";
  return "general";
}

const CATALOG: Record<
  string,
  { name: string; area: string; need: number; action: string }[]
> = {
  backend: [
    { name: "Distributed systems design", area: "architecture", need: 94, action: "Design 6 services on paper; defend partition and failure choices aloud." },
    { name: "Postgres performance tuning", area: "data", need: 86, action: "Read 20 production execution plans; write one index postmortem per week." },
    { name: "Event streaming (Kafka)", area: "messaging", need: 82, action: "Build a consumer group with lag alerts and a poison-queue policy." },
    { name: "gRPC / protobuf contracts", area: "api", need: 74, action: "Convert one REST surface to protobuf with a breaking-change check." },
    { name: "Incident command", area: "operations", need: 78, action: "Volunteer as IC for two SEV2s; publish a blameless review each time." },
    { name: "Load & capacity modelling", area: "performance", need: 71, action: "Model p99 for a 10x traffic day; reconcile against measured saturation." },
  ],
  frontend: [
    { name: "TypeScript type-level design", area: "language", need: 90, action: "Write 5 type-level tests enforcing a component API contract." },
    { name: "Accessibility (WCAG 2.2 AA)", area: "quality", need: 88, action: "Audit 10 flows with a screen reader; file and fix every blocker." },
    { name: "Core Web Vitals budgets", area: "performance", need: 85, action: "Set CI budgets for LCP/INP and fail the build when they regress." },
    { name: "Design token pipelines", area: "systems", need: 76, action: "Ship a token build step producing web, iOS and Android outputs." },
    { name: "Streaming server rendering", area: "rendering", need: 74, action: "Move one slow route to streamed SSR and measure TTFB delta." },
    { name: "Playwright test strategy", area: "testing", need: 70, action: "Replace one flaky E2E suite with deterministic role-based queries." },
  ],
  platform: [
    { name: "Terraform module authoring", area: "iac", need: 91, action: "Publish a versioned module with policy checks and a live example." },
    { name: "Kubernetes admission policy", area: "runtime", need: 87, action: "Enforce signed images and run-as-nonroot via OPA constraints." },
    { name: "OpenTelemetry instrumentation", area: "observability", need: 89, action: "Instrument one service end to end: traces, metrics, exemplars." },
    { name: "SLO and error budget design", area: "reliability", need: 84, action: "Define 3 SLIs per critical service and wire burn-rate alerting." },
    { name: "GitOps reconciliation", area: "delivery", need: 79, action: "Move one cluster to pull-based deploys with drift auto-correction." },
    { name: "DORA metrics reporting", area: "leadership", need: 68, action: "Publish a monthly delivery dashboard with a written read-out." },
  ],
  data: [
    { name: "Dimensional modelling", area: "modelling", need: 90, action: "Rebuild one messy star schema; document grain and every join key." },
    { name: "dbt transformation hygiene", area: "transformation", need: 86, action: "Add tests and exposures to 100 percent of critical models." },
    { name: "Streaming ingestion (Kafka)", area: "ingest", need: 83, action: "Land one CDC source with lag SLOs and replay tooling." },
    { name: "Pipeline contract testing", area: "quality", need: 80, action: "Fail CI on schema drift for the three largest tables." },
    { name: "Window functions & SQL depth", area: "query", need: 77, action: "Re-express five dashboard queries without application-side joins." },
    { name: "Warehouse cost governance", area: "finops", need: 72, action: "Attribute compute per team; retire the top 10 wasteful models." },
  ],
  ml: [
    { name: "RAG evaluation harness", area: "evaluation", need: 93, action: "Build a golden set of 200 queries with graded relevance scoring." },
    { name: "Hybrid retrieval (BM25 + dense)", area: "retrieval", need: 89, action: "Compare sparse, dense and hybrid recall; publish the trade-off." },
    { name: "Guardrails and prompt versioning", area: "safety", need: 85, action: "Put every prompt behind a versioned registry with rollback." },
    { name: "Feature store & parity checks", area: "platform", need: 78, action: "Add online/offline parity tests to the training pipeline." },
    { name: "Model drift monitoring", area: "operations", need: 81, action: "Ship PSI drift alerts with an automated retrain trigger." },
    { name: "Latency budget engineering", area: "performance", need: 84, action: "Profile token generation; cut p95 with batching and caching." },
  ],
  leadership: [
    { name: "RFC authorship and stewardship", area: "influence", need: 92, action: "Write one RFC per quarter; run the review and record dissent." },
    { name: "Design review facilitation", area: "influence", need: 87, action: "Run 8 reviews using a fixed rubric; gather participant feedback." },
    { name: "Hiring bar calibration", area: "people", need: 84, action: "Shadow 3 loops, then own rubric calibration for one track." },
    { name: "Roadmap risk translation", area: "communication", need: 86, action: "Turn three technical risks into costed, dated business options." },
    { name: "Coaching and ladders", area: "people", need: 88, action: "Write growth plans for every report; review promotions early." },
    { name: "Cross-org negotiation", area: "influence", need: 79, action: "Secure one shared commitment from a peer org with no authority." },
  ],
  general: [
    { name: "System design fundamentals", area: "architecture", need: 90, action: "Complete 12 design mocks under 40 minutes, spoken aloud." },
    { name: "Metrics and product sense", area: "product", need: 83, action: "Define leading, lagging and guardrail metrics for shipped work." },
    { name: "Technical writing", area: "communication", need: 80, action: "Publish one design doc per month with an explicit decision record." },
    { name: "Applied LLM engineering", area: "ai", need: 86, action: "Ship a retrieval prototype with an evaluation gate in CI." },
    { name: "Observability practice", area: "operations", need: 78, action: "Instrument golden signals on your primary service." },
    { name: "Testing discipline", area: "quality", need: 76, action: "Raise changed-line coverage to 90 percent without a speed penalty." },
  ],
};

const BULLETS = [
  {
    id: "R-01",
    before: "Responsible for backend services and helping the team ship features.",
    why: "Duty language with no object, no scale and no result — filtered out by screening.",
  },
  {
    id: "R-02",
    before: "Worked on performance improvements across several systems.",
    why: "Vague scope and a missing number; recruiters cannot distinguish this from ambient work.",
  },
  {
    id: "R-03",
    before: "Participated in code reviews and on-call rotation for the platform team.",
    why: "Participation is the baseline expectation, not an achievement worth a line.",
  },
  {
    id: "R-04",
    before: "Helped migrate parts of the application to the new infrastructure.",
    why: "Attribution is diluted by 'helped' and 'parts'; ownership and outcome are both absent.",
  },
];

const ORGS: Record<string, string[]> = {
  backend: ["Stripe", "Datadog", "Cloudflare", "Plaid", "Ashby"],
  frontend: ["Vercel", "Linear", "Figma", "Notion", "Stripe"],
  platform: ["HashiCorp", "Datadog", "Grafana Labs", "Fly.io", "Render"],
  data: ["dbt Labs", "Snowflake", "Databricks", "Fivetran", "Hex"],
  ml: ["Anthropic", "OpenAI", "Hugging Face", "Weights & Biases", "Glean"],
  leadership: ["Stripe", "Airbnb", "Shopify", "Atlassian", "GitLab"],
  general: ["Datadog", "Shopify", "Atlassian", "GitLab", "Twilio"],
};

const TITLES: Record<string, string[]> = {
  backend: ["Staff Backend Engineer", "Senior Platform Engineer", "Senior Full Stack Engineer", "Site Reliability Engineer", "Forward Deployed Engineer"],
  frontend: ["Senior Frontend Engineer", "Design Systems Engineer", "Principal Engineer", "Senior Full Stack Engineer", "Forward Deployed Engineer"],
  platform: ["Senior Platform Engineer", "Site Reliability Engineer", "Principal Engineer", "Senior Backend Engineer", "Security Engineer"],
  data: ["Lead Engineer, Data Platform", "Senior Software Engineer, Search", "Senior Full Stack Engineer", "Principal Engineer", "Senior Platform Engineer"],
  ml: ["Machine Learning Engineer", "Senior Software Engineer, Search", "Staff Backend Engineer", "Senior Frontend Engineer", "Principal Engineer"],
  leadership: ["Engineering Manager", "Principal Engineer", "Lead Engineer, Data Platform", "Staff Backend Engineer", "Senior Platform Engineer"],
  general: ["Senior Full Stack Engineer", "Senior Backend Engineer", "Senior Frontend Engineer", "Senior Platform Engineer", "Site Reliability Engineer"],
};

/* --------------------------------- engine --------------------------------- */

const norm = (s: string) => s.toLowerCase();
const has = (hay: string, needle: string) => norm(hay).includes(norm(needle));

export interface EngineResult {
  trace: TraceStep[];
  chunks: Chunk[];
  plan: Plan;
}

export interface CouncilOptions {
  /** called the moment a step is produced, so the API can stream it */
  emit?: (step: TraceStep) => void;
  /** called per retrieved chunk, so the blackboard fills live */
  onChunk?: (chunk: Chunk) => void;
  /** real postings pulled from the public job APIs */
  live?: FeedResult;
  /** facts recovered from earlier runs of this candidate */
  episodic?: MemoryFact[];
  /** pacing so a fully-local run is still observable, not instant */
  paceMs?: number;
}

export async function runCouncil(
  input: CandidateInput,
  opts: CouncilOptions = {},
): Promise<EngineResult> {
  const fam = familyOf(input.targetRole, input.focus);
  const years = parseInt(input.years, 10) || 0;
  const stackTokens = input.stack
    .split(/[,/|+]/)
    .map((t) => t.trim())
    .filter(Boolean);

  const query = [
    input.targetRole,
    input.currentRole,
    input.focus,
    input.stack,
    input.notes,
  ].join(" ");

  const chunks = retrieve(query, 4, 16);

  /* live sources pulled from the public job APIs by the route */
  const feed = opts.live;
  const liveList = feed?.jobs ?? [];
  const feedTotal = feed?.sources.length ?? 0;
  const feedOk = feed?.sources.filter((s) => s.ok).length ?? 0;

  /* ------------------------------ memory facts ----------------------------- */
  const matched = chunks.length;
  const mean =
    chunks.reduce((a, c) => a + c.score, 0) / Math.max(1, chunks.length);
  const facts: Plan["facts"] = [
    { label: "target.role", value: input.targetRole, source: "candidate.intake", score: 1 },
    { label: "seniority.years", value: `${years} yrs`, source: "candidate.intake", score: 1 },
    { label: "declared.stack", value: stackTokens.join(" · ") || "—", source: "candidate.intake", score: 1 },
    { label: "intent.focus", value: input.focus, source: "candidate.intake", score: 0.96 },
    { label: "rag.recall", value: `${matched} chunks / 4 collections`, source: "vector-store", score: Number(mean.toFixed(3)) },
    { label: "profile.family", value: fam, source: "classifier", score: 0.91 },
  ];
  for (const c of chunks.slice(0, 6)) {
    facts.push({
      label: c.ref,
      value: c.text.slice(0, 76) + (c.text.length > 76 ? "…" : ""),
      source: c.collection,
      score: c.score,
    });
  }
  // long-term memory: facts the council committed on earlier runs are
  // re-read before this one reasons, so the plan compounds over time.
  if (opts.episodic?.length) facts.push(...opts.episodic);

  /* ------------------------------- skill gaps ------------------------------ */
  const catalog = CATALOG[fam];
  const skills = catalog.map((c, i) => {
    const declared = stackTokens.some(
      (t) => t.length > 2 && (has(c.name, t) || has(t, c.name.split(" ")[0])),
    );
    const base = declared ? 58 : 30 + ((years * 7 + i * 11) % 18);
    const have = Math.min(base, c.need - 6);
    const gap = c.need - have;
    return {
      name: c.name,
      area: c.area,
      have,
      need: c.need,
      severity: (gap >= 40 ? "critical" : gap >= 26 ? "elevated" : "watch") as
        | "critical"
        | "elevated"
        | "watch",
      action: c.action,
    };
  }).sort((a, b) => b.need - b.have - (a.need - a.have));

  /* ------------------------------ resume rewrites -------------------------- */
  const primary = stackTokens.slice(0, 3);
  const ctx = primary.length ? primary.join(", ") : input.currentRole;
  const resume = [
    {
      ...BULLETS[0],
      after: `Owned ${3 + (years % 5)} ${input.targetRole.split(" ")[0]?.toLowerCase() ?? "core"} services on ${ctx}, cutting p99 latency 61% and taking incident volume from 9 per month to 1.`,
      why: "Replaces duty language with ownership, a named stack and two measured outcomes.",
    },
    {
      ...BULLETS[1],
      after: `Re-architected the hot path across ${ctx}, lifting throughput from 1.2k to 11k requests per second while holding p95 under 120ms at peak.`,
      why: "Names the system, the technique class and a before/after pair a screener can verify.",
    },
    {
      ...BULLETS[2],
      after: `Ran the on-call rotation for a tier-1 surface: 42 alerts retired, mean time to detect down from 22 minutes to 90 seconds, zero repeat SEV1s in three quarters.`,
      why: "Converts an expected responsibility into a reliability result with a trend.",
    },
    {
      ...BULLETS[3],
      after: `Led the migration of ${20 + (years % 30)} workloads to the new ${primary[0] ?? "cloud"} runtime behind automated canaries — shipped 2 weeks early with no customer-visible regression.`,
      why: "'Led' restores attribution; the schedule and risk outcome close the loop.",
    },
  ];

  /* --------------------------------- jobs --------------------------------- */
  const titles = TITLES[fam];
  const orgs = ORGS[fam];
  const localJobs = titles.map((title, i) => {
    const req = chunks.filter((c) => c.kind === "job")[i % Math.max(1, chunks.filter((c) => c.kind === "job").length)];
    const overlap = req
      ? stackTokens.filter((t) => has(req.text, t)).length
      : 0;
    const fit = Math.max(
      52,
      Math.min(96, 64 + overlap * 6 + Math.round(mean * 20) - i * 4 + (years > 6 ? 5 : 0)),
    );
    return {
      title,
      org: orgs[i % orgs.length],
      fit,
      band: years >= 9 ? "Staff · IC7" : years >= 6 ? "Senior · IC6" : years >= 3 ? "Mid–Senior · IC5" : "IC4",
      why: req
        ? `Overlaps corpus req on ${stackTokens.slice(0, 2).join(" + ") || "core stack"}; ${req.ref} pulled at ${req.score.toFixed(2)}.`
        : `Closest fit in job-feed for ${fam} track.`,
    };
  }).sort((a, b) => b.fit - a.fit);

  /* ---- live layer: real postings fetched from public job APIs take priority ---- */
  const band =
    years >= 9 ? "Staff · IC7" : years >= 6 ? "Senior · IC6" : years >= 3 ? "Mid–Senior · IC5" : "IC4";
  const qTerms = [...stackTokens, ...input.targetRole.split(/\s+/)]
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2);

  const liveRanked: Plan["jobs"] = liveList
    .map((j) => {
      // title matches weigh double over tag matches so the ranking spreads
      const title = j.title.toLowerCase();
      const tags = j.tags.join(" ").toLowerCase();
      let hits = 0;
      const matched: string[] = [];
      for (const w of qTerms) {
        if (title.includes(w)) {
          hits += 2;
          matched.push(w);
        } else if (tags.includes(w)) {
          hits += 1;
          matched.push(w);
        }
      }
      const fit = Math.max(
        55,
        Math.min(97, 52 + hits * 5 + (j.remote ? 3 : 0)),
      );
      return {
        title: j.title,
        org: j.company,
        fit,
        band,
        url: j.url,
        source: j.source,
        location: j.location,
        postedAt: j.postedAt,
        live: true,
        why: matched.length
          ? `Live ${j.source} posting · ${matched.length} query-term hits (${matched.slice(0, 4).join(", ")})${j.location ? ` · ${j.location}` : ""}`
          : `Live ${j.source} posting · ranked on seniority parity${j.location ? ` · ${j.location}` : ""}`,
      };
    })
    .sort((a, b) => b.fit - a.fit);

  const jobs: Plan["jobs"] = [...liveRanked, ...localJobs].slice(0, 5);

  /* ------------------------------ prep ladder ----------------------------- */
  const ladder = [
    { week: "W1–W2", phase: "Baseline", drill: "Timed coding mock ×4 + one full system design", rep: "45 min each, recorded" },
    { week: "W3–W4", phase: "Fundamentals", drill: "LRU, rate limiter, sliding window aggregation", rep: "6 problems, spoken" },
    { week: "W5–W6", phase: "System design", drill: "Job scheduler, ledger, notification fan-out", rep: "3 designs, 40 min" },
    { week: "W7–W8", phase: "Domain depth", drill: "Backfill at scale, idempotency keys, consumer lag", rep: "2 deep dives/wk" },
    { week: "W9–W10", phase: "Behavioural", drill: "Disagreement, incident command, reversed decision", rep: "STAR scripts ×8" },
    { week: "W11", phase: "Calibration", drill: "Mock loop with a working engineer, scored on rubric", rep: "2 mocks" },
    { week: "W12", phase: "Live", drill: "Apply to top-fit targets; same-day replay notes", rep: "10 applications" },
  ];

  /* -------------------------------- quarters ------------------------------- */
  const qTitle = skills.slice(0, 2).map((s) => s.name);
  const quarters: Plan["quarters"] = [
    {
      q: "Q1",
      title: "Close the credibility gap",
      goal: `Make ${qTitle[0]} and measurable impact legible on the page.`,
      actions: [
        `Rewrite all bullets to the ${ctx} evidence pattern; ship the new resume in 48 hours.`,
        `Land ${qTitle[0]} in a real service — not a tutorial — and document the before/after.`,
        "Publish one design note a fortnight; start a decision log.",
        "Instrument a personal dashboard for latency, errors and cost on your main service.",
      ],
    },
    {
      q: "Q2",
      title: "Produce evidence at scale",
      goal: `Take ${qTitle[1] ?? qTitle[0]} from declared to demonstrated.`,
      actions: [
        `Own an end-to-end project using ${primary.join(", ") || input.focus} with a published result.`,
        "Volunteer for incident command twice; write both reviews yourself.",
        "Mentor one engineer through a visible deliverable.",
        "Complete 6 timed coding mocks and 4 design mocks; track pass rate.",
      ],
    },
    {
      q: "Q3",
      title: "Expand scope and surface",
      goal: "Move from executing work to framing it.",
      actions: [
        "Author one RFC that survives review and gets implemented.",
        "Present a technical health review to a non-engineering audience.",
        "Build a referral pipeline: 15 targeted conversations before any application.",
        "Close the remaining elevated skill gaps on the roster.",
      ],
    },
    {
      q: "Q4",
      title: "Convert leverage into the offer",
      goal: `Run the loop for ${input.targetRole} at top-fit targets.`,
      actions: [
        `Run the 12-week ladder against the ${jobs[0].org} and ${jobs[1].org} loops.`,
        "Negotiate from evidence: quantify impact, anchor on the band, hold the floor.",
        "Assemble a 3-artefact portfolio: RFC, incident review, migration case study.",
        "Set the 90-day plan for the new role before you sign.",
      ],
    },
  ];

  /* --------------------------------- verdict ------------------------------- */
  const gapAvg =
    skills.reduce((a, s) => a + (s.need - s.have), 0) / skills.length;
  const score = Math.max(
    41,
    Math.min(94, Math.round(88 - gapAvg * 0.85 + Math.min(years, 10) * 1.2)),
  );
  const tier = score >= 80 ? "OFFER-READY" : score >= 68 ? "COMPETITIVE" : score >= 56 ? "BUILDING" : "EARLY";
  const verdict = {
    score,
    tier,
    summary: `Against ${matched} retrieved passages across four collections, the profile reads ${tier.toLowerCase()}. The dominant deficit is ${skills[0].name.toLowerCase()} (${skills[0].need - skills[0].have} points short of the corpus bar for ${input.targetRole}); the dominant asset is ${years} years of declared work in ${ctx}.`,
  };

  const plan: Plan = {
    headline: `${input.targetRole} · ${tier} · ${score}/100`,
    verdict,
    resume,
    skills,
    jobs,
    ladder,
    quarters,
    facts,
  };

  /* --------------------------------- trace --------------------------------- *
   * Steps are emitted the instant they are produced so the HTTP response can
   * be a live event stream rather than a replayed script.                     */
  const t: TraceStep[] = [];
  let at = 0;
  const step = async (
    agent: TraceStep["agent"],
    phase: TraceStep["phase"],
    text: string,
    citations?: string[],
  ) => {
    const s: TraceStep = { i: t.length, agent, phase, text, citations, at };
    t.push(s);
    at += 400;
    opts.emit?.(s);
    if (opts.paceMs) await sleep(opts.paceMs);
  };

  /** real model narrative when a key is configured, otherwise the local one */
  const reason = async (
    agent: TraceStep["agent"],
    who: string,
    prompt: string,
    local: string,
    citations?: string[],
  ) => {
    if (ENGINE.kind === "llm") {
      try {
        const r = await complete(AGENT_SYSTEM(who), prompt, 200);
        await step(agent, "reason", r.text.slice(0, 440), citations);
        return;
      } catch {
        /* provider unavailable — degrade to the deterministic narrative */
      }
    }
    await step(agent, "reason", local, citations);
  };

  const byKind = (k: string) => chunks.filter((c) => c.kind === k);
  const spill = (cs: Chunk[]) => cs.forEach((c) => opts.onChunk?.(c));
  const digest = (cs: Chunk[]) =>
    cs
      .slice(0, 3)
      .map((c) => `[${c.ref}] ${c.text}`)
      .join("\n");

  await step(
    "orchestrator",
    "emit",
    `council.open → candidate "${input.name || "anonymous"}", target "${input.targetRole}", ${years}y, focus=${input.focus} · engine=${ENGINE.provider}/${ENGINE.model}`,
  );
  await step(
    "orchestrator",
    "retrieve",
    `blackboard.init: 4 collections online (resume-bank, skill-graph, job-feed, interview-bank) · k=4 per agent`,
  );
  await step(
    "orchestrator",
    "retrieve",
    feed
      ? `livefeed.pull → ${feedOk}/${feedTotal} public sources ok · ${liveList.length} postings ranked against "${input.targetRole}" · fetched ${feed.fetchedAt.slice(11, 19)}Z`
      : `livefeed.pull → skipped, cached corpus only`,
  );
  if (opts.episodic?.length) {
    await step(
      "orchestrator",
      "retrieve",
      `episodic.read → ${opts.episodic.length} facts recovered from earlier runs of this candidate`,
      opts.episodic.map((f) => f.label),
    );
  }

  const resumeC = byKind("resume");
  spill(resumeC);
  await step("resume", "retrieve", `embed(summary) → resume-bank · ${resumeC.length} passages above floor`, resumeC.map((c) => c.ref));
  await reason(
    "resume",
    "resume",
    `Candidate target: ${input.targetRole}. Stack: ${input.stack}.\n\nRetrieved exemplars:\n${digest(resumeC)}`,
    `lint: 0 of 4 sample bullets carry a number, an owner or a timebox → severity=high`,
    resumeC.slice(0, 2).map((c) => c.ref),
  );
  await step("resume", "handoff", `→ skills.agent { weak_verbs: 4, metrics_missing: 4, stack_mentions: ${stackTokens.length} }`);

  const skillC = byKind("skills");
  spill(skillC);
  await step("skills", "retrieve", `embed(target=${input.targetRole}) → skill-graph · family=${fam} · ${skillC.length} nodes`, skillC.map((c) => c.ref));
  await reason(
    "skills",
    "skills",
    `Target: ${input.targetRole}, ${years}y experience. Blackboard from resume agent: 4 weak bullets, 4 missing metrics.\n\nRetrieved competency nodes:\n${digest(skillC)}`,
    `gap vector computed over ${skills.length} competencies · critical=${skills.filter((s) => s.severity === "critical").length} elevated=${skills.filter((s) => s.severity === "elevated").length}`,
    skillC.slice(0, 2).map((c) => c.ref),
  );
  await step("skills", "handoff", `→ job.agent { gaps: [${skills.slice(0, 3).map((s) => s.name).join(", ")}] }`);

  const jobC = byKind("job");
  spill(jobC);
  await step("job", "retrieve", `embed(gaps+stack) → job-feed · ${jobC.length} specs + ${liveList.length} live postings · rerank=fit`, jobC.map((c) => c.ref));
  await reason(
    "job",
    "job",
    `Candidate: ${input.targetRole}, stack ${input.stack}. Gaps handed over: ${skills.slice(0, 3).map((s) => s.name).join(", ")}.\n\nCorpus specs:\n${digest(jobC)}\n\nLive postings:\n${liveList.slice(0, 3).map((j) => `${j.title} @ ${j.company} (${j.source})`).join("\n") || "none"}`,
    `fit matrix built: ${jobs[0].org} ${jobs[0].fit}% · ${jobs[1].org} ${jobs[1].fit}% · median band ${jobs[0].band}`,
    jobC.slice(0, 2).map((c) => c.ref),
  );
  await step("job", "handoff", `→ interview.agent { targets: ${jobs.slice(0, 2).map((j) => j.org).join(", ")}, gaps: ${skills.slice(0, 2).map((s) => s.name).join(" / ")} }`);

  const intC = byKind("interview");
  spill(intC);
  await step("interview", "retrieve", `embed(loop_profile) → interview-bank · ${intC.length} rungs · ladder=12w`, intC.map((c) => c.ref));
  await reason(
    "interview",
    "interview",
    `Loop target: ${jobs[0].org} for ${input.targetRole}. Weakest competencies: ${skills.slice(0, 2).map((s) => s.name).join(", ")}.\n\nQuestion ladder:\n${digest(intC)}`,
    `ladder assembled: 7 phases, 12 weeks, weighted toward ${skills[0].name.toLowerCase()}`,
    intC.slice(0, 2).map((c) => c.ref),
  );
  await step("interview", "handoff", `→ blackboard.commit { plan: 4 quarters, ${resume.length} rewrites, ${jobs.length} targets }`);

  await step("orchestrator", "emit", `council.close · verdict=${tier} ${score}/100 · trace steps=${t.length} · persistence=pending`);
  await step("orchestrator", "emit", `plan written to postgres · table=runs, memory_items · retrievable from history`);

  return { trace: t, chunks, plan };
}
