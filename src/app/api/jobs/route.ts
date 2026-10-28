import { NextResponse } from "next/server";
import { fetchLiveJobs, invalidateFeed } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "software engineer").slice(0, 160);
  if (url.searchParams.get("refresh") === "1") invalidateFeed();

  const started = Date.now();
  const requestedLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(20, Math.trunc(requestedLimit)))
    : 6;
  const feed = await fetchLiveJobs(q, limit);

  return NextResponse.json({
    query: q,
    live: feed.live,
    fetchedAt: feed.fetchedAt,
    tookMs: Date.now() - started,
    sources: feed.sources,
    jobs: feed.jobs,
  });
}
