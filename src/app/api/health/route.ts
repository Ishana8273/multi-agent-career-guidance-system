import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!db) {
    return Response.json({ ok: true, storage: "local-file" });
  }

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, storage: "postgres" });
  } catch {
    return Response.json(
      { ok: false, storage: "postgres", reason: "database connection failed" },
      { status: 503 },
    );
  }
}
