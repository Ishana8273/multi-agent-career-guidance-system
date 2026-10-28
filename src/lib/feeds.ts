/* ------------------------------------------------------------------ *
 * LIVE JOB FEEDS — real HTTP calls to keyless public job APIs.
 * Results are relevance-ranked against the candidate's target-role query
 * and cached in-process for five minutes.
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
const cache = new Map<string, { at: number; value: FeedResult }>();

const STOP_WORDS = new Set([
  "and", "the", "for", "with", "from", "role", "jobs", "job", "work",
  "engineer", "engineering", "developer", "development", "software",
  "senior", "remote", "hybrid", "full", "stack",
]);

const terms = (q: string) =>
  [...new Set(
    q.toLowerCase().split(/[^a-z0-9+#]+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  )];

function safeJobUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

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
  const queryTerms = terms(q);
  if (!queryTerms.length) return [];

  return jobs
    .map((job) => {
      const title = job.title.toLowerCase();
      const tags = job.tags.join(" ").toLowerCase();
      const searchable = `${title} ${tags}`;
      let score = 0;
      const matched = new Set<string>();

      for (const term of queryTerms) {
        if (title.includes(term)) {
          score += 4;
          matched.add(term);
        } else if (tags.includes(term)) {
          score += 1.5;
          matched.add(term);
        }
      }

      // Reward jobs that match more than one meaningful query term.
      if (matched.size >= 2) score += 2;
      if (job.remote) score += 0.25;

      return { job, score, matched: matched.size };
    })
    .filter((item) => item.score > 0 && item.matched > 0)
    .sort((a, b) => b.score - a.score || b.matched - a.matched)
    .slice(0, limit)
    .map((item) => item.job);
}

export async function fetchLiveJobs(query: string, limit = 6): Promise<FeedResult> {
  const normalizedQuery = query.toLowerCase().trim();
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit) || 6));
  const cacheKey = `${normalizedQuery}|${safeLimit}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL) {
    return { ...cached.value, fetchedAt: new Date(cached.at).toISOString() };
  }

  const statuses: FeedStatus[] = [];
  const bucket: LiveJob[] = [];

  /* ------------------------------- remotive ------------------------------ */
  {
    const t0 = Date.now();
    try {
      const json = (await getJson("https://remotive.com/api/remote-jobs?limit=100")) as {
        jobs?: Record<string, unknown>[];
      };
      const jobs: LiveJob[] = (json.jobs ?? []).map((j) => ({
        title: String(j.title ?? ""),
        company: String(j.company_name ?? "—"),
        location: String(j.candidate_required_location ?? "remote"),
        url: safeJobUrl(j.url),
        source: "remotive" as const,
        tags: Array.isArray(j.tags)
          ? j.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 10)
          : [],
        postedAt: String(j.publication_date ?? ""),
        remote: true,
      })).filter((j) => j.title && j.url);
      const matched = rank(jobs, normalizedQuery, safeLimit);
      bucket.push(...matched);
      statuses.push({ source: "remotive" as const, count: jobs.length, matched: matched.length, ms: Date.now() - t0, ok: true });
    } catch (e) {
      statuses.push({ source: "remotive" as const, count: 0, matched: 0, ms: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  /* ------------------------------ arbeitnow ------------------------------ */
  {
    const t0 = Date.now();
    try {
      const json = (await getJson("https://www.arbeitnow.com/api/job-board-api")) as {
        data?: Record<string, unknown>[];
      };
      const jobs: LiveJob[] = (json.data ?? []).map((j) => ({
        title: String(j.title ?? ""),
        company: String(j.company_name ?? "—"),
        location: String(j.location ?? "—"),
        url: safeJobUrl(j.url),
        source: "arbeitnow" as const,
        tags: Array.isArray(j.tags)
          ? j.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 10)
          : [],
        postedAt: String(j.created_at ?? ""),
        remote: Boolean(j.remote),
      })).filter((j) => j.title && j.url);
      const matched = rank(jobs, normalizedQuery, safeLimit);
      bucket.push(...matched);
      statuses.push({ source: "arbeitnow" as const, count: jobs.length, matched: matched.length, ms: Date.now() - t0, ok: true });
    } catch (e) {
      statuses.push({ source: "arbeitnow" as const, count: 0, matched: 0, ms: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  /* ------------------------------ himalayas ------------------------------ */
  {
    const t0 = Date.now();
    try {
      const json = (await getJson("https://himalayas.app/jobs/api?limit=40&offset=0")) as {
        jobs?: Record<string, unknown>[];
      };
      const jobs: LiveJob[] = (json.jobs ?? []).map((j) => ({
        title: String(j.title ?? ""),
        company: String(j.company ?? j.companyName ?? "—"),
        location: String(j.location ?? j.timezone ?? "remote"),
        url: safeJobUrl(j.url),
        source: "himalayas" as const,
        tags: Array.isArray(j.skills)
          ? j.skills.filter((tag): tag is string => typeof tag === "string").slice(0, 10)
          : [],
        postedAt: String(j.postedAt ?? j.publishedAt ?? ""),
        remote: true,
      })).filter((j) => j.title && j.url);
      const matched = rank(jobs, normalizedQuery, safeLimit);
      bucket.push(...matched);
      statuses.push({ source: "himalayas" as const, count: jobs.length, matched: matched.length, ms: Date.now() - t0, ok: true });
    } catch (e) {
      statuses.push({ source: "himalayas" as const, count: 0, matched: 0, ms: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const seen = new Set<string>();
  const deduplicated = bucket.filter((job) => {
    const key = `${job.title.trim().toLowerCase()}|${job.company.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const value: FeedResult = {
    jobs: deduplicated.slice(0, safeLimit * 2),
    sources: statuses,
    fetchedAt: new Date().toISOString(),
    live: statuses.some((status) => status.ok),
  };
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

export function invalidateFeed() {
  cache.clear();
}
