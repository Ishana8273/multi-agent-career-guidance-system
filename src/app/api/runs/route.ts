import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { candidates, memoryItems, runs } from "@/db/schema";
import { runCouncil } from "@/lib/agents";
import { fetchLiveJobs } from "@/lib/feeds";
import { ENGINE } from "@/lib/llm";
import { listLocalRuns, saveLocalRun } from "@/lib/run-store";
import type {
  CandidateInput,
  Chunk,
  MemoryFact,
  TraceStep,
} from "@/lib/roles";
import { CAREER_FOCUSES } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!db) {
    const rows = await listLocalRuns();
    return NextResponse.json({
      runs: rows.slice(0, 24).map((run) => ({
        id: run.id,
        createdAt: run.createdAt,
        targetRole: run.input.targetRole,
        name: run.input.name,
        score: run.plan.verdict.score,
        tier: run.plan.verdict.tier,
      })),
    });
  }

  const rows = await db
    .select({
      id: runs.id,
      createdAt: runs.createdAt,
      input: runs.input,
      plan: runs.plan,
    })
    .from(runs)
    .orderBy(runs.createdAt)
    .limit(24);

  const shaped = rows
    .map((r) => {
      const i = r.input as unknown as CandidateInput;
      const p = r.plan as unknown as {
        verdict: { score: number; tier: string };
      };
      return {
        id: r.id,
        createdAt: r.createdAt,
        targetRole: i?.targetRole ?? "—",
        name: i?.name ?? "—",
        score: p?.verdict?.score ?? 0,
        tier: p?.verdict?.tier ?? "—",
      };
    })
    .reverse();

  return NextResponse.json({ runs: shaped });
}

/* ------------------------------------------------------------------ *
 * POST — convenes the council as a server-sent event stream.
 *   engine   : which reasoner is configured (llm or local fallback)
 *   feed     : live public job APIs just fetched
 *   chunk    : a passage written to the shared blackboard
 *   step     : one agent action, emitted the moment it happens
 *   plan     : the committed career development plan
 *   error    : something failed
 * ------------------------------------------------------------------ */
export async function POST(req: Request) {
  const database = db;
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return NextResponse.json({ error: "request body too large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "request must be a JSON object" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const readText = (key: string, fallback: string, maxLength: number) => {
    const value = body[key];
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "string") return null;
    return value.trim().slice(0, maxLength);
  };
  const name = readText("name", "anonymous", 80);
  const currentRole = readText("currentRole", "Engineer", 90);
  const targetRole = readText("targetRole", "", 90);
  const years = readText("years", "3", 2);
  const stack = readText("stack", "", 320);
  const focus = readText("focus", "internal promotion", 60);
  const notes = readText("notes", "", 600);
  if (
    name === null ||
    currentRole === null ||
    targetRole === null ||
    years === null ||
    stack === null ||
    focus === null ||
    notes === null
  ) {
    return NextResponse.json(
      { error: "all candidate fields must be strings" },
      { status: 400 },
    );
  }
  if (!targetRole || !stack) {
    return NextResponse.json(
      { error: "target role and stack are required" },
      { status: 400 },
    );
  }
  if (!/^\d{1,2}$/.test(years) || Number(years) > 60) {
    return NextResponse.json(
      { error: "years must be a whole number between 0 and 60" },
      { status: 400 },
    );
  }
  if (!CAREER_FOCUSES.includes(focus as (typeof CAREER_FOCUSES)[number])) {
    return NextResponse.json({ error: "unsupported career focus" }, { status: 400 });
  }

  const input: CandidateInput = {
    name: name || "anonymous",
    currentRole: currentRole || "Engineer",
    targetRole,
    years,
    stack,
    focus,
    notes,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* client disconnected */
        }
      };

      try {
        send("engine", ENGINE);

        /* 1 — live public job feeds (real outbound HTTP, cached 5 minutes) */
        const live = await fetchLiveJobs(
          `${input.targetRole} ${input.stack}`.trim(),
          6,
        );

        /* 2 — reuse memory only for the same entered candidate profile */
        let episodic: MemoryFact[] = [];
        if (database) {
          const prior = await database
            .select({
              label: memoryItems.label,
              value: memoryItems.value,
              source: memoryItems.source,
              score: memoryItems.score,
            })
            .from(memoryItems)
            .innerJoin(runs, eq(memoryItems.runId, runs.id))
            .where(
              and(
                sql`lower(${runs.input} ->> 'targetRole') = lower(${input.targetRole})`,
                sql`lower(${runs.input} ->> 'name') = lower(${input.name})`,
                sql`lower(${runs.input} ->> 'currentRole') = lower(${input.currentRole})`,
              ),
            )
            .orderBy(desc(memoryItems.id))
            .limit(40);

          episodic = prior
            .filter(
              (p) =>
                !p.label.includes("#") &&
                p.source !== "memory:prior" &&
                p.value.length > 3,
            )
            .slice(0, 4)
            .map((p) => ({
              label: `prior:${p.label}`,
              value: p.value,
              source: "memory:prior",
              score: Number(p.score) || 0.6,
            }));
        } else {
          const priorRuns = await listLocalRuns();
          episodic = priorRuns
            .filter(
              (run) =>
                run.input.targetRole.toLowerCase() ===
                  input.targetRole.toLowerCase() &&
                run.input.name.toLowerCase() === input.name.toLowerCase() &&
                run.input.currentRole.toLowerCase() ===
                  input.currentRole.toLowerCase(),
            )
            .flatMap((run) => run.plan.facts)
            .filter(
              (fact) =>
                !fact.label.includes("#") &&
                fact.source !== "memory:prior" &&
                fact.value.length > 3,
            )
            .slice(0, 4)
            .map((fact) => ({
              label: `prior:${fact.label}`,
              value: fact.value,
              source: "memory:prior",
              score: Number(fact.score) || 0.6,
            }));
        }

        send("feed", {
          live: live.live,
          fetchedAt: live.fetchedAt,
          sources: live.sources,
          jobs: live.jobs.length,
          episodic: episodic.length,
          facts: episodic,
        });

        const streamedSteps: TraceStep[] = [];
        const streamedChunks: Chunk[] = [];

        const { trace, chunks, plan } = await runCouncil(input, {
          live,
          episodic,
          paceMs: ENGINE.kind === "llm" ? 40 : 300,
          persistenceLabel: database ? "postgres" : "local file",
          emit: (s) => {
            streamedSteps.push(s);
            send("step", s);
          },
          onChunk: (c) => {
            streamedChunks.push(c);
            send("chunk", c);
          },
        });

        /* 3 — persist candidate, run and blackboard facts */
        let id: string;
        let createdAt: Date | string;
        if (database) {
          const row = await database.transaction(async (tx) => {
            const [candidate] = await tx
              .insert(candidates)
              .values({
                name: input.name,
                currentRole: input.currentRole,
                targetRole: input.targetRole,
                years: input.years,
                stack: input.stack,
                focus: input.focus,
                notes: input.notes,
              })
              .returning({ id: candidates.id });

            const [savedRun] = await tx
              .insert(runs)
              .values({
                candidateId: candidate.id,
                input,
                trace,
                chunks,
                plan,
              })
              .returning({ id: runs.id, createdAt: runs.createdAt });

            const factsToStore = plan.facts.filter(
              (f) => f.source !== "memory:prior",
            );
            if (factsToStore.length) {
              await tx.insert(memoryItems).values(
                factsToStore.map((f) => ({
                  runId: savedRun.id,
                  label: f.label,
                  value: f.value,
                  source: f.source,
                  score: f.score.toFixed(3),
                })),
              );
            }
            return savedRun;
          });
          id = row.id;
          createdAt = row.createdAt;
        } else {
          const row = await saveLocalRun({ input, trace, chunks, plan });
          id = row.id;
          createdAt = row.createdAt;
        }

        send("plan", {
          id,
          createdAt,
          input,
          trace: streamedSteps.length ? streamedSteps : trace,
          chunks: streamedChunks.length ? streamedChunks : chunks,
          plan,
        });
      } catch (e) {
        send("error", { message: (e as Error).message || "council failed" });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
