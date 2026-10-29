# ORCHESTRA follow-up fixes

- Skill status now separates `DECLARED · NOT TESTED` from `NOT ASSESSED` in the plan UI. No competency is presented as tested by this prototype.
- Skill evidence trace reports declared/not-listed counts rather than counting `critical` or `elevated` severities when all scores are unassessed.
- Interview-agent instructions now explicitly keep candidates with 0–1 years of experience on entry-level topics and avoid advanced distributed-systems/system-design questions.

## Validation

Run in the project folder:

```powershell
npm run typecheck
npm run lint
npm run build
```

Then test a 0-year candidate and confirm that the skills panel labels declared technologies as `DECLARED · NOT TESTED`, other skills as `NOT ASSESSED`, and the interview agent recommends beginner-level preparation. This package has not been run through the project's local npm checks in this environment.
