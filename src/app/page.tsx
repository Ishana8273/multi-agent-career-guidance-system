import { desc } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { listLocalRuns } from "@/lib/run-store";
import type { CandidateInput } from "@/lib/roles";
import Console from "@/components/Console";

export const dynamic = "force-dynamic";

export default async function Home() {
  let history: {
    id: string;
    createdAt: Date;
    targetRole: string;
    name: string;
    score: number;
    tier: string;
  }[] = [];

  if (db) {
    try {
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

      history = rows.map((r) => {
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
    } catch (error) {
      console.error("Could not load PostgreSQL run history", error);
      history = [];
    }
  } else {
    const rows = await listLocalRuns();
    history = rows.slice(0, 24).map((run) => ({
      id: run.id,
      createdAt: new Date(run.createdAt),
      targetRole: run.input.targetRole,
      name: run.input.name,
      score: run.plan.verdict.score,
      tier: run.plan.verdict.tier,
    }));
  }

  return <Console history={history} />;
}
