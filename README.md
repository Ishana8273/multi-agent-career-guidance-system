# ORCHESTRA — Multi-Agent Career Guidance System

## Abstract

Choosing a next career step can require a person to interpret their experience, identify skill gaps, compare target roles, and prepare for interviews at the same time. ORCHESTRA is a web-based career-guidance prototype that organizes these tasks into a coordinated, four-agent workflow. A user supplies a career profile and target role; the resume, skills, job, and interview agents then work in sequence, sharing retrieved evidence and intermediate findings through a common blackboard. A bundled text corpus provides offline retrieval context, while optional language-model providers can produce agent narratives and optional public job feeds can supply current postings. The application streams the workflow to the browser and assembles the results into a printable career development plan. Run history is persisted to PostgreSQL when configured, or to a local JSON file for a no-database demonstration. The system is intended as an educational decision-support prototype: its readiness score and recommendations are indicative, should be checked against the user's actual experience, and are not guarantees of employment or professional advice.

**Keywords:** multi-agent systems, career guidance, retrieval-augmented generation, shared blackboard, skill-gap analysis, decision support.

## Problem statement

Career planning information is often distributed across resumes, job descriptions, competency frameworks, and interview preparation materials. Reviewing those sources independently can make it difficult to turn a broad career goal into a coherent set of next steps. This project demonstrates how a staged, evidence-informed software workflow can bring those perspectives together and present a traceable, personalized plan.

## Aim and objectives

**Aim:** Build an interactive decision-support application that demonstrates coordinated specialist agents for career planning.

**Objectives**

1. Collect a candidate profile, target role, experience, skills, and career focus.
2. Retrieve relevant passages from a bundled career corpus.
3. Coordinate four specialist agents over a shared blackboard and stream their trace to the UI.
4. Identify competency gaps and suggest concrete development actions.
5. Rank role targets using available corpus evidence and, when reachable, live public job feeds.
6. Produce resume rewrite examples, an interview preparation ladder, and a quarterly development roadmap.
7. Save, browse, and reload previous plans using PostgreSQL or local-file persistence.

## System architecture

```text
Candidate intake (Next.js UI)
          |
          v
Runs API (Server-Sent Events)
          |
          v
Orchestrator and shared blackboard
   |          |          |          |
Resume     Skills       Job     Interview
 agent      agent       agent      agent
   \          |          |          /
    +-- bundled career corpus (RAG) --+
    +-- optional public job feeds -----+
    +-- optional LLM provider ---------+
          |
          v
Career plan + run trace + persisted history
          |
          +-- PostgreSQL (if DATABASE_URL is set)
          +-- data/runs.json (local fallback)
```

The agents run as coordinated steps in the server application; the architecture is a multi-agent workflow, not four independently deployed services. Retrieval uses the bundled text corpus and bag-of-terms cosine scoring; it does not require an external vector database. LLM calls and public job feeds are optional integrations and may be unavailable due to configuration, network, or provider limits. The deterministic local reasoning path keeps a demo usable without an API key.

This repository is a local, single-user educational prototype. It has no authentication, tenant isolation, document-upload pipeline, or general-purpose chat endpoint, and should not be exposed as a multi-user production service. PostgreSQL run history is shared by the configured application instance.

## Main modules

| Module | Responsibility |
|---|---|
| Candidate intake | Captures profile and target-role information. |
| Resume agent | Reviews achievement bullets and proposes clearer, impact-oriented rewrites. |
| Skills agent | Compares declared experience with target-role competencies and suggests practice actions. |
| Job agent | Ranks role examples from retrieved specifications and optional live postings. |
| Interview agent | Produces a staged interview-preparation ladder. |
| Orchestrator / blackboard | Runs agents in order, shares intermediate facts, and emits an auditable trace. |
| Retrieval corpus | Supplies career, skills, role, and interview passages for offline retrieval. |
| Career Q&A | Searches question-relevant corpus passages, current profile notes, and matching candidate saved runs; displays sources and avoids answering when no evidence overlaps. |
| Career plan | Combines readiness summary, resume examples, skill gaps, role targets, preparation ladder, and quarterly roadmap. |
| Run history | Lists and reloads previous analyses from PostgreSQL or local JSON storage. |

## Methodology and workflow

1. **Profile intake:** Validate the target role and declared skill stack, then normalize the candidate inputs.
2. **Context retrieval:** Search the bundled corpus for passages relevant to the profile and career goal. If network feeds are reachable, rank their postings alongside the corpus examples.
3. **Sequential agent analysis:** The resume agent reviews evidence quality; the skills agent uses the findings to prioritize gaps; the job agent compares candidate context with role requirements; and the interview agent assembles preparation activities.
4. **Shared memory:** Each stage can write findings and citations to the shared run context. Earlier runs can contribute relevant facts to later runs.
5. **Plan generation:** The server combines the specialist outputs into one career development plan and streams progress to the browser using Server-Sent Events.
6. **Persistence and review:** Save the run, show it in history, and allow the user to reopen or print the plan.
7. **Question answering:** Ask a career question alongside the plan workflow. Search ranks the question against corpus text and matching candidate history; a configured model can synthesize only cited evidence, while local mode displays the retrieved excerpts.

## Technology

- Next.js App Router, React, and TypeScript
- Tailwind CSS and Framer Motion
- Drizzle ORM and PostgreSQL (optional)
- Local JSON run-history fallback when PostgreSQL is not configured
- Bundled TypeScript retrieval corpus and bag-of-terms cosine similarity (no embeddings or vector database)
- Optional OpenAI-compatible, Anthropic, or Gemini model providers
- Optional keyless public job APIs

## Evaluation and limitations

The application can be evaluated by entering different candidate profiles and comparing the resulting agent trace, retrieved corpus passages, estimated skill gaps, role examples, preparation ladder, and persisted history. Retrieval returns only passages with a positive term-overlap score; sparse queries can return no evidence. The UI distinguishes live public postings from illustrative role archetypes. Readiness and match values are heuristic indicators, not validated assessments or hiring probabilities. Resume rewrites are editable templates with placeholders; replace them only with outcomes and measurements the candidate can verify. Live feeds require internet access; external model reasoning requires a provider key. The bundled corpus is small and should be expanded and evaluated before making claims about broad coverage or recommendation quality. Users should verify recommendations independently and avoid submitting sensitive personal information to external providers.

## Run locally

Requirements: Node.js 20.9 or newer.

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No API key or database is required for the local demo. Without `DATABASE_URL`, saved runs are stored in `data/runs.json`; this runtime file is excluded from Git. Set `DATABASE_URL` to use PostgreSQL instead.

For PostgreSQL, copy `.env.example` to `.env`, set `DATABASE_URL` to a database you control, then run the included initial migration:

```powershell
Copy-Item .env.example .env
npm run db:migrate
npm run dev
```

The initial migration is for a new/empty schema. If a database already contains project tables or data, inspect its schema and migration state before applying it; do not reset or drop existing data.

Optional environment variables:

- `DATABASE_URL` — PostgreSQL connection string.
- `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` — enable an external reasoning provider. If multiple keys are set, provider selection follows the order in `src/lib/llm.ts`.
- Provider-specific model variables are documented in `src/lib/llm.ts`.

## API contract

These are the implemented application routes; they do not require authentication in this single-user demo.

| Method and path | Request | Success response / behavior | Dependencies |
|---|---|---|---|
| `GET /api/health` | None | `{ ok, storage }`; returns `503` when configured PostgreSQL is unreachable. | PostgreSQL, if configured |
| `GET /api/runs` | None | `{ runs: [...] }`, newest 24 saved summaries. | PostgreSQL or local JSON |
| `POST /api/runs` | Candidate JSON: name, currentRole, targetRole, years, stack, focus, notes | Server-Sent Events: engine, feed, step, chunk, then plan; validation failures use `400`/`413`, run failures emit an error event. | Bundled corpus, optional feeds/model, and configured persistence |
| `GET /api/runs/{id}` | Saved run ID | Stored input, trace, retrieved chunks, and plan; `404` if absent. | PostgreSQL or local JSON |
| `GET /api/jobs?q=...&limit=...` | Search query, optional limit (1–20) | `{ query, live, fetchedAt, sources, jobs }`. | Public job feeds / network |
| `POST /api/ask` | `{ question, candidate }` with the current candidate profile | `{ answer, sources, mode, priorRunsSearched }`; `400`/`413` on invalid/oversized input. | Bundled corpus, matching saved runs; optional model provider |

There are no registration/login, file ingestion, document deletion, or conversation-history endpoints in this project; those chatbot-specific features are outside its existing career-guidance scope.

Career Q&A searches saved history by exact case-insensitive candidate name, current role, and target role. This is a convenience for the single-user local demo, **not an authorization boundary**. Local no-key mode returns relevant source excerpts rather than model-written synthesis. With a configured model, the response is prompted to cite retrieved sources, but citations and recommendations still require user verification; bag-of-terms matching can miss paraphrases or rank incomplete context.

## Validation commands

```powershell
npm run typecheck
npm run lint
npm run build
```

There is no dedicated automated test suite in the repository yet; the routes and local workflow must be smoke-tested against the active app. A successful build alone does not verify a live PostgreSQL server or third-party providers.

## Suggested presentation outline

1. Introduce the career-planning problem and project objectives.
2. Show the candidate intake and explain the shared-blackboard workflow.
3. Run a sample profile and follow the four agent trace.
4. Review the retrieved evidence and generated career plan.
5. Demonstrate saved-run history and explain the local/PostgreSQL persistence options.
6. Discuss limitations, responsible use, and future evaluation work.

## Deployment constraints

Do not deploy this version as a public multi-user service without adding authentication, per-user history isolation, rate limits, privacy controls, and an appropriate data-retention policy. The local JSON store is intended for a single local instance and is not safe for multiple application processes sharing a filesystem. PostgreSQL mode currently shares run history within that database. Optional model providers receive candidate profile text, so obtain consent and avoid sending sensitive personal data.
