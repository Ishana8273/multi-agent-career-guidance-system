import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!db) {
    return NextResponse.json({ error: "database is not configured" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const [row] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: row.id,
    createdAt: row.createdAt,
    input: row.input,
    trace: row.trace,
    chunks: row.chunks,
    plan: row.plan,
  });
}
