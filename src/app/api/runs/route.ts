import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { candidates, memoryItems, runs } from "@/db/schema";
import { runCouncil } from "@/lib/agents";
import { fetchLiveJobs } from "@/lib/feeds";
import { ENGINE } from "@/lib/llm";
import type {
  CandidateInput,
  Chunk,
  MemoryFact,
  TraceStep,
} from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!db) {
    return NextResponse.json({ runs: [] });
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

  let body: Partial<CandidateInput> = {};
  try {
    body = (await req.json()) as Partial<CandidateInput>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const input: CandidateInput = {
    name: (body.name ?? "").toString().trim().slice(0, 80) || "anonymous",
    currentRole: (body.currentRole ?? "").toString().trim().slice(0, 90) || "Engineer",
    targetRole: (body.targetRole ?? "").toString().trim().slice(0, 90) || "Senior Engineer",
    years: (body.years ?? "3").toString().slice(0, 4),
    stack: (body.stack ?? "").toString().slice(0, 320),
    focus: (body.focus ?? "promotion").toString().slice(0, 60),
    notes: (body.notes ?? "").toString().slice(0, 600),
  };

  /* 1 — live public job feeds (real outbound HTTP, cached 5 minutes) */
  const live = await fetchLiveJobs(
    `${input.targetRole} ${input.stack}`.trim(),
    6,
  );

  /* 2 — long-term memory: what the council already committed for this profile */
  let episodic: MemoryFact[] = [];
  try {
    if (!database) throw new Error("DATABASE_URL is not configured");

    const prior = await database
      .select({
        label: memoryItems.label,
        value: memoryItems.value,
        source: memoryItems.source,
        score: memoryItems.score,
        at: memoryItems.createdAt,
      })
      .from(memoryItems)
      .innerJoin(runs, eq(memoryItems.runId, runs.id))
      .where(
        sql`lower(${runs.input} ->> 'targetRole') = lower(${input.targetRole})`,
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
  } catch {
    episodic = [];
  }

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

      send("engine", ENGINE);
      send("feed", {
        live: live.live,
        fetchedAt: live.fetchedAt,
        sources: live.sources,
        jobs: live.jobs.length,
        episodic: episodic.length,
        facts: episodic,
      });

      try {
        const streamedSteps: TraceStep[] = [];
        const streamedChunks: Chunk[] = [];

        const { trace, chunks, plan } = await runCouncil(input, {
          live,
          episodic,
          paceMs: ENGINE.kind === "llm" ? 40 : 300,
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
        if (!database) {
          throw new Error("DATABASE_URL is not configured");
        }

        const [candidate] = await database
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

        const [row] = await database
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
          await database.insert(memoryItems).values(
            factsToStore.map((f) => ({
              runId: row.id,
              label: f.label,
              value: f.value,
              source: f.source,
              score: f.score.toFixed(3),
            })),
          );
        }

        send("plan", {
          id: row.id,
          createdAt: row.createdAt,
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
