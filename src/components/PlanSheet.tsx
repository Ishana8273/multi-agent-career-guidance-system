"use client";

import { motion } from "framer-motion";
import { Printer, X } from "lucide-react";
import type { CandidateInput, Plan } from "@/lib/roles";

const sevColor: Record<string, string> = {
  critical: "#B4441F",
  elevated: "#B3690F",
  watch: "#1E5B38",
};
const sevLabel: Record<string, string> = {
  critical: "CRITICAL",
  elevated: "ELEVATED",
  watch: "WATCH",
};

function safeExternalUrl(value?: string): string | undefined {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function Rule({ label }: { label: string }) {
  return (
    <div className="mt-14 mb-7 flex items-baseline gap-4">
      <span className="lbl !text-[10px] !text-[#1A1D19]/55 whitespace-nowrap">
        {label}
      </span>
      <span className="h-px flex-1 bg-[#1A1D19]/25" />
    </div>
  );
}

export default function PlanSheet({
  input,
  plan,
  onClose,
  stamped,
}: {
  input: CandidateInput;
  plan: Plan;
  onClose: () => void;
  stamped: string;
}) {
  const jobs = plan.jobs.map((job) => ({
    ...job,
    safeUrl: safeExternalUrl(job.url),
  }));

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.72 }}
      className="fixed inset-0 z-50 overflow-y-auto bg-[#F4F1E8] text-[#1A1D19]"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at top right, rgba(30,91,56,.08), transparent 38%), linear-gradient(180deg, #f8f6ef, #ece9df)",
      }}
    >
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-14 sm:px-10">
        {/* masthead */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-[#1A1D19] pb-5">
          <div>
            <div className="lbl !text-[10px] !text-[#1A1D19]/60">
              Orchestra · council output
            </div>
            <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.6rem)] font-700 leading-[0.94] tracking-[-0.03em]" style={{ fontWeight: 700 }}>
              Career Development
              <br />
              Plan
            </h1>
          </div>
          <div className="flex flex-col items-end gap-3">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 border border-[#1A1D19]/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors hover:bg-[#1A1D19] hover:text-[#F4F1E8]"
            >
              <Printer size={12} /> Print
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 bg-[#1A1D19] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#F4F1E8] transition-colors hover:bg-[#B4441F]"
            >
              <X size={12} /> Close
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 font-mono text-[11px] text-[#1A1D19]/70">
          <span>SUBJECT: {input.name}</span>
          <span>FROM: {input.currentRole}</span>
          <span>TARGET: {input.targetRole}</span>
          <span>EXP: {input.years}y</span>
          <span>STAMP: {stamped}</span>
          <span>DOC: CDP-{plan.verdict.score}-{plan.skills.length}</span>
        </div>

        {/* verdict */}
        <Rule label="01 · Council verdict" />
        <div className="grid gap-8 md:grid-cols-[240px_1fr]">
          <div className="border border-[#1A1D19]/30 p-5">
            <div className="num text-[clamp(3.5rem,9vw,5.5rem)] font-600 leading-[0.8] tracking-[-0.05em]" style={{ fontWeight: 600 }}>
              {plan.verdict.score}
            </div>
            <div className="lbl mt-2 !text-[10px] !text-[#1A1D19]/55">
              heuristic indicator / 100 · not an assessment
            </div>
            <div
              className="mt-5 inline-block px-2 py-1 font-mono text-[10px] tracking-[0.18em]"
              style={{
                background: sevColor[plan.verdict.score >= 80 ? "watch" : "elevated"],
                color: "#F4F1E8",
              }}
            >
              {plan.verdict.tier}
            </div>
          </div>
          <p className="max-w-[62ch] text-[17px] leading-[1.6] text-[#1A1D19]/85">
            {plan.verdict.summary}
          </p>
        </div>

        {/* resume */}
        <Rule label="02 · Resume agent — editable bullet templates" />
        <p className="mb-5 border border-[#B3690F]/40 bg-[#B3690F]/8 p-3 font-mono text-[11px] leading-[1.6] text-[#1A1D19]/70">
          Templates contain placeholders, not claims about your experience.
          Replace them only with outcomes and measurements you can verify.
        </p>
        <div className="space-y-5">
          {plan.resume.map((r) => (
            <div
              key={r.id}
              className="grid gap-3 border-l-2 border-[#1A1D19]/30 pl-5 md:grid-cols-[1fr_1.25fr]"
            >
              <div>
                <div className="lbl mb-2 !text-[10px] !text-[#B4441F]">
                  {r.id} · before
                </div>
                <p className="font-mono text-[13px] leading-[1.55] text-[#1A1D19]/45 line-through decoration-[#B4441F]/50">
                  {r.before}
                </p>
              </div>
              <div>
                <div className="lbl mb-2 !text-[10px] !text-[#1E5B38]">
                  {r.id} · editable template
                </div>
                <p className="text-[15px] leading-[1.55] text-[#1A1D19]">
                  {r.after}
                </p>
                <p className="mt-2 font-mono text-[11px] leading-[1.5] text-[#1A1D19]/55">
                  ↳ {r.why}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* skills */}
        <Rule label="03 · Skills agent — gap analysis" />
        <p className="mb-4 font-mono text-[11px] leading-[1.6] text-[#1A1D19]/60">
          Proficiency values are rough rule-based estimates from the declared
          stack and experience, not a tested competency assessment.
        </p>
        <div className="space-y-4">
          {plan.skills.map((s) => (
            <div key={s.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-[15px] font-500" style={{ fontWeight: 500 }}>
                  {s.name}
                </span>
                <span className="flex items-center gap-3 font-mono text-[11px] text-[#1A1D19]/65">
                  <span className="uppercase tracking-[0.14em]">{s.area}</span>
                  <span
                    className="px-1.5 py-0.5 text-[9px] tracking-[0.18em] text-[#F4F1E8]"
                    style={{ background: sevColor[s.severity] }}
                  >
                    {sevLabel[s.severity]}
                  </span>
                  <span className="num">
                    {s.have} → {s.need}
                  </span>
                </span>
              </div>
              <div className="mt-2 h-[7px] w-full bg-[#1A1D19]/12">
                <div
                  className="h-full"
                  style={{
                    width: `${s.have}%`,
                    background: sevColor[s.severity],
                  }}
                />
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-[#1A1D19]/60">
                action: {s.action}
              </p>
            </div>
          ))}
        </div>

        {/* jobs */}
        <Rule label="04 · Job agent — role examples and live postings" />
        <p className="mb-4 font-mono text-[11px] leading-[1.6] text-[#1A1D19]/60">
          Only rows marked LIVE come from public job feeds. Other rows are
          illustrative role archetypes, not current openings. Match values are
          heuristic comparisons, not hiring probabilities.
        </p>
        <div className="border-t border-[#1A1D19]/25">
          {jobs.map((j) => (
            <div
              key={j.org + j.title}
              className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-b border-[#1A1D19]/25 py-3.5 sm:grid-cols-[1.6fr_auto_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-[15px]"
                    style={{ fontWeight: 500 }}
                  >
                    {j.title}
                  </span>
                  {j.live && (
                    <span className="border border-[#1E5B38] px-1.5 py-[1px] font-mono text-[9px] tracking-[0.16em] text-[#1E5B38]">
                      LIVE · {j.source}
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-[#1A1D19]/60">
                  {j.org} · {j.band}
                  {j.safeUrl ? (
                    <>
                      {" · "}
                      <a
                        href={j.safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-[#1E5B38]/50 underline-offset-2 hover:text-[#1E5B38]"
                      >
                        open posting
                      </a>
                    </>
                  ) : null}
                </div>
                <div className="mt-1 max-w-[54ch] font-mono text-[11px] leading-[1.5] text-[#1A1D19]/50">
                  {j.why}
                </div>
              </div>
              <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
                <div className="h-[6px] w-28 bg-[#1A1D19]/12">
                  <div
                    className="h-full bg-[#1E5B38]"
                    style={{ width: `${j.fit}%` }}
                  />
                </div>
                <span className="num w-20 text-right text-[10px] font-500 uppercase" style={{ fontWeight: 500 }}>
                  {j.fit}% heuristic
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ladder */}
        <Rule label="05 · Interview agent — 12-week ladder" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#1A1D19]/40">
                {["WINDOW", "PHASE", "DRILL", "VOLUME"].map((h) => (
                  <th
                    key={h}
                    className="lbl pb-2 !text-[10px] !text-[#1A1D19]/55"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.ladder.map((l) => (
                <tr key={l.week} className="border-b border-[#1A1D19]/15">
                  <td className="num py-3 pr-4 text-[13px] whitespace-nowrap">
                    {l.week}
                  </td>
                  <td className="py-3 pr-4 font-mono text-[12px] uppercase tracking-[0.1em] text-[#1E5B38]">
                    {l.phase}
                  </td>
                  <td className="py-3 pr-4 text-[14px] leading-[1.45]">
                    {l.drill}
                  </td>
                  <td className="py-3 font-mono text-[11px] text-[#1A1D19]/60 whitespace-nowrap">
                    {l.rep}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* quarters */}
        <Rule label="06 · Four-quarter roadmap" />
        <div className="grid gap-6 sm:grid-cols-2">
          {plan.quarters.map((q) => (
            <div key={q.q} className="border border-[#1A1D19]/30 p-5">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[11px] tracking-[0.2em] text-[#B3690F]">
                  {q.q}
                </span>
                <span className="lbl !text-[9px] !text-[#1A1D19]/45">
                  roadmap
                </span>
              </div>
              <h3
                className="mt-2 text-[19px] leading-[1.2] tracking-[-0.01em]"
                style={{ fontWeight: 600 }}
              >
                {q.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-[1.5] text-[#1A1D19]/65">
                {q.goal}
              </p>
              <ul className="mt-3.5 space-y-2">
                {q.actions.map((a) => (
                  <li
                    key={a}
                    className="flex gap-2.5 text-[13px] leading-[1.5] text-[#1A1D19]/85"
                  >
                    <span className="mt-[7px] h-[5px] w-[5px] shrink-0 bg-[#1E5B38]" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* provenance */}
        <Rule label="07 · Blackboard memory — retrieval provenance" />
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {plan.facts.map((f, i) => (
            <div
              key={f.label + i}
              className="flex items-baseline gap-3 border-b border-[#1A1D19]/12 py-1.5"
            >
              <span className="num shrink-0 text-[11px] text-[#1E5B38]">
                {f.score.toFixed(2)}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#1A1D19]/80">
                {f.label}
              </span>
              <span className="lbl !text-[9px] !text-[#1A1D19]/45 shrink-0">
                {f.source}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-16 border-t-2 border-[#1A1D19] pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#1A1D19]/55">
            Educational career decision-support prototype · resume · skills ·
            job · interview · shared blackboard · four-collection retrieval.
            Scores and recommendations are heuristic, indicative, and not
            guarantees.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
