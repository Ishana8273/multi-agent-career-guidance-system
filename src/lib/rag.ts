import type { AgentId, Chunk } from "./roles";

export interface Doc {
  ref: string;
  collection: string;
  kind: AgentId;
  text: string;
}

/* ------------------------------------------------------------------ *
 * RAG CORPUS — four collections, embedded offline as raw text.
 * Retrieval is bag-of-terms cosine over a shared vocabulary.
 * ------------------------------------------------------------------ */

export const CORPUS: Doc[] = [
  // ---- resume-bank: calibrated achievement bullets -----------------
  { ref: "resume-bank#01", collection: "resume-bank", kind: "resume", text: "Cut p99 checkout latency from 840ms to 190ms by rewriting the payment aggregation path and adding per-tenant circuit breakers." },
  { ref: "resume-bank#02", collection: "resume-bank", kind: "resume", text: "Owned the migration of 46 services from sidecar VMs to Kubernetes, rolling out progressively with automated canary analysis and zero customer-visible incidents." },
  { ref: "resume-bank#03", collection: "resume-bank", kind: "resume", text: "Led a four-engineer pod through a quarter-long replatform; shipped 3 weeks early and raised deployment frequency from weekly to 18x per day." },
  { ref: "resume-bank#04", collection: "resume-bank", kind: "resume", text: "Recovered $2.1M annualised infrastructure spend by profiling cold query paths in Postgres, adding covering indexes and retiring 12 unused read replicas." },
  { ref: "resume-bank#05", collection: "resume-bank", kind: "resume", text: "Designed an event-driven ingestion pipeline on Kafka handling 40k events per second at sub-second end-to-end latency with exactly-once semantics." },
  { ref: "resume-bank#06", collection: "resume-bank", kind: "resume", text: "Wrote the RFC and drove consensus across platform, security and SRE for a zero-trust service identity rollout covering 200 internal endpoints." },
  { ref: "resume-bank#07", collection: "resume-bank", kind: "resume", text: "Mentored three junior engineers to independent on-call within two quarters, running weekly design-review clinics and a documented onboarding ladder." },
  { ref: "resume-bank#08", collection: "resume-bank", kind: "resume", text: "Shipped a customer-facing analytics surface that lifted weekly active usage 34 percent and became the top-cited reason in renewal conversations." },
  { ref: "resume-bank#09", collection: "resume-bank", kind: "resume", text: "Introduced contract testing across six teams, cutting cross-service integration regressions by 71 percent and removing the nightly manual QA gate." },
  { ref: "resume-bank#10", collection: "resume-bank", kind: "resume", text: "Reduced mean time to detection from 22 minutes to 90 seconds by instrumenting golden signals and shipping SLO-backed alert routing in PagerDuty." },
  { ref: "resume-bank#11", collection: "resume-bank", kind: "resume", text: "Presented quarterly technical health reviews to the board-level engineering committee, translating architecture risk into a costed remediation backlog." },
  { ref: "resume-bank#12", collection: "resume-bank", kind: "resume", text: "Deprecated a hand-rolled ORM in favour of a query builder with typed SQL, dropping N-plus-one query incidents to zero over three release cycles." },
  { ref: "resume-bank#13", collection: "resume-bank", kind: "resume", text: "Built an internal feature-flag platform adopted by 60 engineers, enabling trunk-based development and cutting average pull request size by half." },
  { ref: "resume-bank#14", collection: "resume-bank", kind: "resume", text: "Reverse-engineered a failing vendor integration and shipped a deterministic replay harness that isolated the fault in 48 hours instead of 3 weeks." },
  { ref: "resume-bank#15", collection: "resume-bank", kind: "resume", text: "Owned accessibility conformance to WCAG 2.2 AA across a 400-component design system, raising automated coverage from 31 to 96 percent." },
  { ref: "resume-bank#16", collection: "resume-bank", kind: "resume", text: "Led incident command for a SEV1 payment outage, drove the blameless review, and landed six corrective actions that eliminated the recurrence class." },

  // ---- skill-graph: capability taxonomy with market demand ----------
  { ref: "skill-graph#01", collection: "skill-graph", kind: "skills", text: "Systems design and distributed trade-offs: partitioning, consensus, idempotency, backpressure. Interview demand very high for senior and staff bands." },
  { ref: "skill-graph#02", collection: "skill-graph", kind: "skills", text: "Kubernetes and container orchestration: workload identity, HPA, admission policy, GitOps reconciliation. Demand high, supply saturated at junior level." },
  { ref: "skill-graph#03", collection: "skill-graph", kind: "skills", text: "Observability: OpenTelemetry traces, exemplar-linked metrics, SLO error budgets, structured logging. Rising demand, thin senior supply." },
  { ref: "skill-graph#04", collection: "skill-graph", kind: "skills", text: "Postgres performance: execution plans, partial and covering indexes, vacuum and bloat control, connection pooling with PgBouncer." },
  { ref: "skill-graph#05", collection: "skill-graph", kind: "skills", text: "Event streaming with Kafka: consumer lag management, schema registry, exactly-once semantics, partition key design." },
  { ref: "skill-graph#06", collection: "skill-graph", kind: "skills", text: "Infrastructure as code: Terraform modules, state separation, policy as code with OpenPolicyAgent, drift detection pipelines." },
  { ref: "skill-graph#07", collection: "skill-graph", kind: "skills", text: "TypeScript at scale: generics, variance, branded types, type-level tests, module boundaries and compile-time enforcement." },
  { ref: "skill-graph#08", collection: "skill-graph", kind: "skills", text: "Web performance: Core Web Vitals, render blocking paths, streaming server rendering, bundle budgets enforced in CI." },
  { ref: "skill-graph#09", collection: "skill-graph", kind: "skills", text: "Design systems and component architecture: token pipelines, headless primitives, versioning and codemod-driven migration." },
  { ref: "skill-graph#10", collection: "skill-graph", kind: "skills", text: "Accessibility: WCAG 2.2 AA, screen reader verification, focus order, axe-core automation and manual audit discipline." },
  { ref: "skill-graph#11", collection: "skill-graph", kind: "skills", text: "Test strategy: contract testing, property-based testing, Playwright end-to-end, flake quarantine and deterministic fixtures." },
  { ref: "skill-graph#12", collection: "skill-graph", kind: "skills", text: "Applied LLM engineering: retrieval augmented generation, chunking strategy, evaluation harnesses, guardrails and prompt versioning." },
  { ref: "skill-graph#13", collection: "skill-graph", kind: "skills", text: "Vector search: HNSW and IVF indexes, embedding model selection, hybrid BM25 plus dense retrieval, reranking." },
  { ref: "skill-graph#14", collection: "skill-graph", kind: "skills", text: "Data modelling and SQL analytics: dimensional models, window functions, dbt transformations, contract-tested pipelines." },
  { ref: "skill-graph#15", collection: "skill-graph", kind: "skills", text: "Technical leadership: RFC authorship, design review facilitation, roadmap negotiation, stakeholder risk translation." },
  { ref: "skill-graph#16", collection: "skill-graph", kind: "skills", text: "Security engineering: threat modelling, least privilege, secret rotation, supply chain signing with SLSA provenance." },
  { ref: "skill-graph#17", collection: "skill-graph", kind: "skills", text: "Machine learning operations: feature stores, model registry, drift monitoring, offline and online parity checks." },
  { ref: "skill-graph#18", collection: "skill-graph", kind: "skills", text: "Messaging and API design: gRPC and protobuf, REST versioning, pagination contracts, idempotency keys, rate limiting." },

  // ---- job-feed: live role specifications --------------------------
  { ref: "job-feed#01", collection: "job-feed", kind: "job", text: "Staff Backend Engineer, payments platform. Own ledger correctness, high-throughput services, Postgres at scale, on-call for money movement. Requires systems design depth and incident command." },
  { ref: "job-feed#02", collection: "job-feed", kind: "job", text: "Senior Platform Engineer, developer experience. Kubernetes, Terraform, GitOps, internal golden paths, paved road tooling, DORA metrics reporting." },
  { ref: "job-feed#03", collection: "job-feed", kind: "job", text: "Senior Frontend Engineer, design systems. TypeScript, React, accessibility conformance, token pipelines, performance budgets, component API design." },
  { ref: "job-feed#04", collection: "job-feed", kind: "job", text: "Senior Software Engineer, search and relevance. Vector retrieval, BM25 plus dense hybrid, evaluation harnesses, LLM assisted ranking." },
  { ref: "job-feed#05", collection: "job-feed", kind: "job", text: "Lead Engineer, data platform. Streaming ingestion, Kafka, warehouse modelling, contract-tested pipelines, cost governance." },
  { ref: "job-feed#06", collection: "job-feed", kind: "job", text: "Senior Site Reliability Engineer. SLOs, error budgets, OpenTelemetry, capacity planning, chaos experiments, blameless postmortems." },
  { ref: "job-feed#07", collection: "job-feed", kind: "job", text: "Machine Learning Engineer, applied LLM. Retrieval augmented generation, evaluation, guardrails, prompt and model versioning, latency budgets." },
  { ref: "job-feed#08", collection: "job-feed", kind: "job", text: "Engineering Manager, product squad. Hiring, coaching, roadmap ownership, cross-functional partnership with product and design." },
  { ref: "job-feed#09", collection: "job-feed", kind: "job", text: "Principal Engineer, architecture. Org-wide technical strategy, RFC stewardship, deprecation programmes, executive communication." },
  { ref: "job-feed#10", collection: "job-feed", kind: "job", text: "Senior Full Stack Engineer, B2B SaaS. TypeScript end to end, Postgres, multi-tenancy, billing integrations, pragmatic product sense." },
  { ref: "job-feed#11", collection: "job-feed", kind: "job", text: "Security Engineer, product security. Threat modelling, SAST and SCA pipelines, dependency hygiene, secure SDLC enablement." },
  { ref: "job-feed#12", collection: "job-feed", kind: "job", text: "Forward deployed engineer, enterprise. Customer integration, rapid prototyping, API design, translating messy requirements into platform primitives." },

  // ---- interview-bank: question ladders ----------------------------
  { ref: "interview-bank#01", collection: "interview-bank", kind: "interview", text: "Behavioural: tell me about a time you disagreed with a technical decision and how you resolved it. Scored on conflict handling and evidence of influence without authority." },
  { ref: "interview-bank#02", collection: "interview-bank", kind: "interview", text: "System design: design a rate limiter for a public API. Expect token bucket versus sliding window, distributed counters, failure modes and a measured capacity estimate." },
  { ref: "interview-bank#03", collection: "interview-bank", kind: "interview", text: "System design: design a job scheduling service. Expect lease semantics, exactly-once execution, backoff, poison queues and observability." },
  { ref: "interview-bank#04", collection: "interview-bank", kind: "interview", text: "Coding: given a stream of events, compute a rolling window aggregation. Expect streaming correctness, boundary conditions and a complexity argument." },
  { ref: "interview-bank#05", collection: "interview-bank", kind: "interview", text: "Coding: implement an LRU cache with O1 operations. Expect doubly linked list plus hash map, then a discussion of concurrency and sharding." },
  { ref: "interview-bank#06", collection: "interview-bank", kind: "interview", text: "Deep dive: walk me through the hardest incident you led. Use situation, action, measurable result, and what you changed in the system afterwards." },
  { ref: "interview-bank#07", collection: "interview-bank", kind: "interview", text: "Deep dive: explain a trade-off you made that you would now reverse. Signals judgement and learning rate rather than correctness." },
  { ref: "interview-bank#08", collection: "interview-bank", kind: "interview", text: "Leadership: how do you raise the technical bar of a team that is behind? Expect concrete mechanisms: reviews, ladders, tooling, pairing, not aspirations." },
  { ref: "interview-bank#09", collection: "interview-bank", kind: "interview", text: "Product sense: how would you measure success for a feature you shipped? Expect leading and lagging indicators, guardrail metrics and a rollback threshold." },
  { ref: "interview-bank#10", collection: "interview-bank", kind: "interview", text: "Domain: how would you backfill a derived column across 200 million rows without downtime? Expect batching, dual write, verification and a rollback plan." },
  { ref: "interview-bank#11", collection: "interview-bank", kind: "interview", text: "Domain: explain idempotency keys and where they break. Expect at-least-once delivery, deduplication windows, storage TTL and client retry policy." },
  { ref: "interview-bank#12", collection: "interview-bank", kind: "interview", text: "Closing: what questions do you have for us? Prepare three calibrated questions on roadmap, on-call load, and how success is measured in the first six months." },
];

/* ------------------------------ retrieval ------------------------------ */

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);

const docTerms = CORPUS.map((d) => {
  const tf = new Map<string, number>();
  for (const t of tokenize(d.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
  const norm = Math.sqrt(
    Array.from(tf.values()).reduce((a, b) => a + b * b, 0) || 1,
  );
  return { tf, norm };
});

export function retrieve(query: string, perKind: number, k: number): Chunk[] {
  const qtf = new Map<string, number>();
  for (const t of tokenize(query)) qtf.set(t, (qtf.get(t) ?? 0) + 1);
  const qnorm = Math.sqrt(
    Array.from(qtf.values()).reduce((a, b) => a + b * b, 0) || 1,
  );

  const scored = CORPUS.map((d, i) => {
    const { tf, norm } = docTerms[i];
    let dot = 0;
    for (const [term, w] of qtf) {
      const dw = tf.get(term);
      if (dw) dot += w * dw;
    }
    const cos = dot / (qnorm * norm);
    return { d, score: cos };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // guarantee a minimum recall floor even on sparse queries
  if (scored.length < k) {
    for (const d of CORPUS) {
      if (scored.length >= k) break;
      if (!scored.some((s) => s.d.ref === d.ref)) scored.push({ d, score: 0.08 });
    }
  }

  const out: Chunk[] = [];
  const seen = new Set<string>();
  for (const kind of ["resume", "skills", "job", "interview"] as AgentId[]) {
    let n = 0;
    for (const s of scored) {
      if (n >= perKind) break;
      if (s.d.kind !== kind || seen.has(s.d.ref)) continue;
      seen.add(s.d.ref);
      out.push({
        ref: s.d.ref,
        collection: s.d.collection,
        kind,
        text: s.d.text,
        score: Number(Math.min(0.99, s.score + 0.42).toFixed(3)),
        agent: kind,
      });
      n++;
    }
  }
  // interleave so the rail fills in agent order, capped at k
  return out.slice(0, k);
}
