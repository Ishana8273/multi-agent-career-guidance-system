import { NextResponse } from "next/server";
import { fetchLiveJobs, invalidateFeed } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "software engineer").slice(0, 160);
  if (url.searchParams.get("refresh") === "1") invalidateFeed();

  const started = Date.now();
  const feed = await fetchLiveJobs(q, Number(url.searchParams.get("limit")) || 6);

  return NextResponse.json({
    query: q,
    live: feed.live,
    fetchedAt: feed.fetchedAt,
    tookMs: Date.now() - started,
    sources: feed.sources,
    jobs: feed.jobs,
  });
}
