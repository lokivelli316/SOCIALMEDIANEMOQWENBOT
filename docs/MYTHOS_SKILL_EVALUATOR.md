# MYTHOS — NVIDIA SkillEvaluator (isolated optional qualification lane)

> `MYTHOS` here is the operator's local integration-lane name. The evaluator itself is NVIDIA SkillEvaluator; this filename does not imply an Anthropic Mythos model performed the audit.

- Upstream: https://github.com/NVIDIA/SkillEvaluator; reviewed source README and pyproject version `0.9.0`.
- Target: existing **nine canonical** `.agents/skills/*/SKILL.md`. No replacement, deletion or auto-import.
- Execution: `scripts/mythos-skill-audit.sh`, or the **pull-request-scoped and manually dispatchable** GitHub Actions workflow `MYTHOS keyless skill quality audit`.
- Install on an authorized Python 3.12+ host: `python -m pip install 'skillevaluator==0.9.0'`.
- From repository root: `bash scripts/mythos-skill-audit.sh`.
- Output: `reports/mythos-skill-audit/<skill>/` JSON + CLI evidence per native skill, preserving per-skill failures.
- This runs the **keyless, static quality tier only**. It does *not* run a real agent against tasks, execute external code, issue API calls to NVIDIA models, certify third-party skills as safe, or verify upload/publish authority.
- Nonzero exit or missing skill count means HOLD; unexecuted workflow means NOT VERIFIED. Keep existing `npm run skills:validate` regardless.
- Security: do not pass keys, private repo sources, or creator data to model-backed rubric/Tier 3 without separate operator authorization. The optional workflow only checks the source in its checkout.
- Cost: the workflow runs automatically only on pull requests that change the canonical skills, the audit script, or this workflow; it is also manually dispatchable. Ordinary source pushes outside those paths do not trigger it. Review GitHub Actions billing/runner limits before deliberately changing those paths or dispatching it.
- Future Phase: after static qualification, run SkillEvaluator with/without skill impact trials under pinned task/evidence suites and appropriate budget, and record results to the existing Forge Relay/Infinite Brain ledgers. No model is allowed to certify its own success.

**Status:** SOURCE WIRED; the integration PR must retain the actual keyless SkillEvaluator execution result before merge.
