/* ------------------------------------------------------------------ *
 * LIVE JOB FEEDS — real HTTP calls to keyless public job APIs.
 * Results are relevance-ranked against the candidate query and cached
 * in-process for five minutes so the console can be re-run freely.
 * ------------------------------------------------------------------ */

export interface LiveJob {
  title: string;
  company: string;
  location: string;
  url: string;
  source: "remotive" | "arbeitnow" | "himalayas";
  tags: string[];
  postedAt: string;
  remote: boolean;
}

export interface FeedStatus {
  source: string;
  count: number;
  matched: number;
  ms: number;
  ok: boolean;
  error?: string;
}

export interface FeedResult {
  jobs: LiveJob[];
  sources: FeedStatus[];
  fetchedAt: string;
  live: boolean;
}

const TTL = 5 * 60 * 1000;
let cache: { key: string; at: number; value: FeedResult } | null = null;

const terms = (q: string) =>
  q
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 2);

async function getJson(url: string, ms = 7000): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return res.json();
}

function rank(jobs: LiveJob[], q: string, limit: number): LiveJob[] {
  const t = terms(q);
  const scored = jobs
    .map((j) => {
      const hay = `${j.title} ${j.tags.join(" ")}`.toLowerCase();
      let hits = 0;
      for (const term of t) if (hay.includes(term)) hits += 1;
      // title matches weigh double — a "Senior Backend Engineer" posting
      // should outrank one that only tags "engineer"
      const title = j.title.toLowerCase();
      let bonus = 0;
      for (const term of t) if (title.includes(term)) bonus += 1;
      return { j, score: hits + bonus * 1.5 };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.j);
}

export async function fetchLiveJobs(
  query: string,
  limit = 6,
): Promise<FeedResult> {
  const key = query.toLowerCase().trim();
  if (cache && cache.key === key && Date.now() - cache.at < TTL) {
    return { ...cache.value, fetchedAt: new Date(cache.at).toISOString() };
  }

  const statuses: FeedStatus[] = [];
  const bucket: LiveJob[] = [];

  /* ------------------------------- remotive ------------------------------ */
  {
    const t0 = Date.now();
    try {
      const json = (await getJson(
        "https://remotive.com/api/remote-jobs?limit=100",
      )) as { jobs?: Record<string, unknown>[] };
      const jobs: LiveJob[] = (json.jobs ?? []).map((j) => ({
        title: String(j.title ?? ""),
        company: String(j.company_name ?? "—"),
        location: String(j.candidate_required_location ?? "remote"),
        url: String(j.url ?? ""),
        source: "remotive" as const,
        tags: Array.isArray(j.tags) ? (j.tags as string[]).slice(0, 6) : [],
        postedAt: String(j.publication_date ?? ""),
        remote: true,
      }));
      const matched = rank(jobs, key, 6);
      bucket.push(...matched);
      statuses.push({
        source: "remotive",
        count: jobs.length,
        matched: matched.length,
        ms: Date.now() - t0,
        ok: true,
      });
    } catch (e) {
      statuses.push({
        source: "remotive",
        count: 0,
        matched: 0,
        ms: Date.now() - t0,
        ok: false,
        error: (e as Error).message,
      });
    }
  }

  /* ------------------------------ arbeitnow ------------------------------ */
  {
    const t0 = Date.now();
    try {
      const json = (await getJson(
        "https://www.arbeitnow.com/api/job-board-api",
      )) as { data?: Record<string, unknown>[] };
      const jobs: LiveJob[] = (json.data ?? []).map((j) => ({
        title: String(j.title ?? ""),
        company: String(j.company_name ?? "—"),
        location: String(j.location ?? "—"),
        url: String(j.url ?? ""),
        source: "arbeitnow" as const,
        tags: Array.isArray(j.tags) ? (j.tags as string[]).slice(0, 6) : [],
        postedAt: String(j.created_at ?? ""),
        remote: Boolean(j.remote),
      }));
      const matched = rank(jobs, key, 6);
      bucket.push(...matched);
      statuses.push({
        source: "arbeitnow",
        count: jobs.length,
        matched: matched.length,
        ms: Date.now() - t0,
        ok: true,
      });
    } catch (e) {
      statuses.push({
        source: "arbeitnow",
        count: 0,
        matched: 0,
        ms: Date.now() - t0,
        ok: false,
        error: (e as Error).message,
      });
    }
  }

  /* ------------------------------ himalayas ------------------------------ */
  {
    const t0 = Date.now();
    try {
      const json = (await getJson(
        "https://himalayas.app/jobs/api?limit=40&offset=0",
      )) as { jobs?: Record<string, unknown>[] };
      const jobs: LiveJob[] = (json.jobs ?? []).map((j) => ({
        title: String(j.title ?? ""),
        company: String(j.company ?? j.companyName ?? "—"),
        location: String(j.location ?? j.timezone ?? "remote"),
        url: String(j.url ?? j.slug ?? ""),
        source: "himalayas" as const,
        tags: Array.isArray(j.skills) ? (j.skills as string[]).slice(0, 6) : [],
        postedAt: String(j.postedAt ?? j.publishedAt ?? ""),
        remote: true,
      }));
      const matched = rank(jobs, key, 6);
      bucket.push(...matched);
      statuses.push({
        source: "himalayas",
        count: jobs.length,
        matched: matched.length,
        ms: Date.now() - t0,
        ok: true,
      });
    } catch (e) {
      statuses.push({
        source: "himalayas",
        count: 0,
        matched: 0,
        ms: Date.now() - t0,
        ok: false,
        error: (e as Error).message,
      });
    }
  }

  const seen = new Set<string>();
  const jobs = bucket.filter((j) => {
    const k = `${j.title}|${j.company}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const value: FeedResult = {
    jobs: jobs.slice(0, limit * 2),
    sources: statuses,
    fetchedAt: new Date().toISOString(),
    live: statuses.some((s) => s.ok),
  };
  cache = { key, at: Date.now(), value };
  return value;
}

export function invalidateFeed() {
  cache = null;
}
