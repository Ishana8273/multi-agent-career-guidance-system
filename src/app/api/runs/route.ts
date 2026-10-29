
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

/* GET — return the latest 24 runs */
export async function GET() {
  if (!db) {
    const rows = await listLocalRuns();

    return NextResponse.json(
      {
        runs: rows.slice(0, 24).map((run) => ({
          id: run.id,
          createdAt: run.createdAt,
          targetRole: run.input.targetRole,
          name: run.input.name,
          score: run.plan.verdict.score,
          tier: run.plan.verdict.tier,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const rows = await db
    .select({
      id: runs.id,
      createdAt: runs.createdAt,
      input: runs.input,
      plan: runs.plan,
    })
    .from(runs)
    .orderBy(desc(runs.createdAt))
    .limit(24);

  const shaped = rows.map((r) => {
    const input = r.input as unknown as CandidateInput;
    const plan = r.plan as unknown as {
      verdict: { score: number; tier: string };
    };

    return {
      id: r.id,
      createdAt: r.createdAt,
      targetRole: input?.targetRole ?? "—",
      name: input?.name ?? "—",
      score: plan?.verdict?.score ?? 0,
      tier: plan?.verdict?.tier ?? "—",
    };
  });

  return NextResponse.json(
    { runs: shaped },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/* POST — run the career council and persist the result */
export async function POST(req: Request) {
  const database = db;
  const contentLength = Number(req.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return NextResponse.json(
      { error: "request body too large" },
      { status: 413 },
    );
  }

  let body: Record<string, unknown>;

  try {
    const parsed: unknown = await req.json();

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return NextResponse.json(
        { error: "request must be a JSON object" },
        { status: 400 },
      );
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "invalid json" },
      { status: 400 },
    );
  }

  const readText = (
    key: string,
    fallback: string,
    maxLength: number,
  ) => {
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

  if (!CAREER_FOCUSES.includes(
    focus as (typeof CAREER_FOCUSES)[number],
  )) {
    return NextResponse.json(
      { error: "unsupported career focus" },
      { status: 400 },
    );
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
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          // Client disconnected.
        }
      };

      try {
        send("engine", ENGINE);

        // Fetch live job listings.
        const live = await fetchLiveJobs(
          `${input.targetRole} ${input.stack}`.trim(),
          6,
        );

        // Retrieve memory for the same candidate profile.
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
                sql`lower(coalesce(${runs.input} ->> 'years', '')) = lower(${input.years})`,
                sql`lower(coalesce(${runs.input} ->> 'stack', '')) = lower(${input.stack})`,
                sql`lower(coalesce(${runs.input} ->> 'focus', '')) = lower(${input.focus})`,
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
                run.input.name.toLowerCase() ===
                  input.name.toLowerCase() &&
                run.input.currentRole.toLowerCase() ===
                  input.currentRole.toLowerCase() &&
                run.input.years.trim() === input.years.trim() &&
                run.input.stack.trim().toLowerCase() ===
                  input.stack.trim().toLowerCase() &&
                run.input.focus.trim().toLowerCase() ===
                  input.focus.trim().toLowerCase(),
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
          emit: (step) => {
            streamedSteps.push(step);
            send("step", step);
          },
          onChunk: (chunk) => {
            streamedChunks.push(chunk);
            send("chunk", chunk);
          },
        });

        // Persist the candidate, run, and memory facts.
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
              .returning({
                id: runs.id,
                createdAt: runs.createdAt,
              });

            const factsToStore = plan.facts.filter(
              (fact) => fact.source !== "memory:prior",
            );

            if (factsToStore.length) {
              await tx.insert(memoryItems).values(
                factsToStore.map((fact) => ({
                  runId: savedRun.id,
                  label: fact.label,
                  value: fact.value,
                  source: fact.source,
                  score: fact.score.toFixed(3),
                })),
              );
            }

            return savedRun;
          });

          id = row.id;
          createdAt = row.createdAt;
        } else {
          const row = await saveLocalRun({
            input,
            trace,
            chunks,
            plan,
          });

          id = row.id;
          createdAt = row.createdAt;
        }

        // Emit the completed plan only after persistence succeeds.
        send("plan", {
          id,
          createdAt,
          input,
          trace: streamedSteps.length ? streamedSteps : trace,
          chunks: streamedChunks.length ? streamedChunks : chunks,
          plan,
        });
      } catch (error) {
        send("error", {
          message:
            error instanceof Error ? error.message : "council failed",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Stream already closed.
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
