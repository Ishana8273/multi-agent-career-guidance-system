# ORCHESTRA follow-up fixes

This update focuses on fresher relevance, evidence honesty, and candidate-memory isolation.

## Changes

- Resume templates now use student/project-based language for candidates with 0–1 years of experience. They avoid implying production ownership, team leadership, or migrations.
- Skill proficiency is marked unassessed because the application does not run a validated competency test. A declared technology is no longer turned into an invented `58` proficiency score.
- Ask ORCHESTRA retrieval now includes the current target role, declared stack, and career focus in the retrieval query.
- For fresher profiles, Ask ORCHESTRA filters senior/staff/lead/manager examples from retrieved and saved evidence.
- Saved-run memory reuse now requires the candidate's name, current role, target role, years of experience, stack, and focus to match. This reduces the chance that an earlier profile contaminates a new run.
- Existing caveat retained: job archetypes are examples, not live vacancies; heuristic scores are not hiring probabilities or validated assessments.

## Validation

The original project previously passed `npm run typecheck`, `npm run lint`, and `npm run build` on the user's machine. After these follow-up source edits, local verification in the packaging environment could not complete because dependency installation timed out and the environment's `node_modules` had incomplete type definitions. Please validate the updated files in your existing Windows project with:

```powershell
npm ci
npm run typecheck
npm run lint
npm run build
```

Do not run `npm audit fix --force` solely to address these changes; review audit findings separately.
