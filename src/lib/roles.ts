export type AgentId = "resume" | "skills" | "job" | "interview";

export interface CandidateInput {
  name: string;
  currentRole: string;
  targetRole: string;
  years: string;
  stack: string;
  focus: string;
  notes: string;
}

export interface TraceStep {
  i: number;
  agent: AgentId | "orchestrator";
  phase: "retrieve" | "reason" | "handoff" | "emit";
  text: string;
  citations?: string[];
  at: number;
}

export interface Chunk {
  ref: string;
  collection: string;
  kind: AgentId;
  text: string;
  score: number;
  agent: AgentId;
}

export interface MemoryFact {
  label: string;
  value: string;
  source: string;
  score: number;
}

export interface Plan {
  headline: string;
  verdict: { score: number; tier: string; summary: string };
  resume: { id: string; before: string; after: string; why: string }[];
  skills: {
    name: string;
    area: string;
    have: number;
    need: number;
    severity: "critical" | "elevated" | "watch";
    action: string;
  }[];
  jobs: {
    title: string;
    org: string;
    fit: number;
    band: string;
    why: string;
    /** present when the posting was pulled live from a public job API */
    url?: string;
    source?: string;
    location?: string;
    postedAt?: string;
    live?: boolean;
  }[];
  ladder: { week: string; phase: string; drill: string; rep: string }[];
  quarters: { q: string; title: string; goal: string; actions: string[] }[];
  facts: MemoryFact[];
}

export interface RunPayload {
  input: CandidateInput;
  trace: TraceStep[];
  chunks: Chunk[];
  plan: Plan;
}
