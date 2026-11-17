# CAPABILITY LEDGER

This ledger is the single intake surface for capability proposals from Meta, Muse, Grok, Claude, ChatGPT, human reviewers, and later implementation passes.

The existing verified implementation is the baseline. Proposals MUST add, extend, wire, repair, test, or package capabilities unless an explicit architectural replacement is approved.

## Baseline

- Repository: `lokivelli316/SOCIALMEDIANEMOQWENBOT`
- Verified implementation head before parade coordination docs: `eb5854e85b3ba011823b38a6a5a733fda008a752`
- Frozen reference branch: `baseline/pre-parade-20261116`
- CI status at baseline: PASS
- Current platforms: Facebook, TikTok, YouTube, Reddit, X
- Current creator model: multi-creator, mixed archetypes, custom creator type supported
- Existing authority model: `required | draft | auto`
- Existing receipts: JSONL under `.nemoqwen/`

## Parade Lap 2 frozen baseline

The Lap-1 baseline remains preserved above. A second frozen implementation baseline now exists after source-grounded repairs:

- Frozen branch: `baseline/pre-parade-lap2-20261116`
- Exact commit: `d8a294094813e886346808b2fe59197888ca1268`
- Hardening PR head qualified by CI: `f99192036e424bd91f8bacec27a9e2df460081ba`
- CI run: `44018763980` — TypeScript check, tests and repo-native skill validation PASS
- Separate skill-quality run: `44018005907` — NVIDIA SkillEvaluator 0.9.0 keyless Tier-1, 9/9 PASS
- Lap-2 reviewer contract: `docs/PARADE_LAP_2.md`

Verified-at-code-level repairs before Lap 2 include fail-closed publication authority, truthful asynchronous submission states, TikTok preflight hardening, X media-count refusal, unknown Reddit metrics as null, bounded platform network timeouts, explicit duplicate-publication protection, receipt raw-body redaction + hash chaining + verification CLI, Facebook/TikTok/YouTube readback methods, and bounded YouTube resumable chunks.

These are **not LIVE account claims**. Real credentials, platform permissions/reviews, external publish, real readback and receipts remain required per creator/platform.

**ID collision rule for Lap 2:** reviewers use reviewer-scoped IDs. They do not allocate new global `CAP-###` values. The integration pass assigns global IDs only after preserving provenance and reconciling duplicates/conflicts.

## Rules for capability intake

1. Do not replace the existing architecture merely because another architecture is preferred.
2. Do not remove existing platform or creator capabilities.
3. Do not silently alter the authority model.
4. Do not place credentials, refresh tokens, client secrets, or account identifiers in committed source.
5. Do not claim a platform/account is LIVE without credential installation, required approvals/scopes, real external execution, readback/verification, and receipts.
6. Every accepted capability must identify affected modules, external dependencies, tests, and completion evidence.
7. Conflicting proposals remain separate until explicitly reconciled.
8. Duplicate proposals are consolidated without erasing attribution.
9. Platform-specific constraints belong in adapters or platform policy, not in the creator core.
10. GUI, CLI, desktop, mobile, and future web clients must consume the same core schemas and authority rules.

## Status vocabulary

- **PROPOSED** — submitted but not evaluated.
- **ACCEPTED** — approved for implementation.
- **REJECTED** — explicitly declined; reason required.
- **CONFLICT** — incompatible with another proposal or existing contract.
- **BLOCKED** — implementation target retained, but an external dependency prevents completion.
- **IN PROGRESS** — implementation started.
- **IMPLEMENTED** — code exists, but verification is not yet complete.
- **VERIFIED** — tests/evidence satisfy the defined acceptance boundary.
- **LIVE** — external account/service capability has passed real execution and readback where applicable.
- **HOLD** — target remains open; one or more required conditions are not satisfied.

## Capability table

| ID | Capability | Source model/reviewer | Rationale | Affected modules | API / permission dependency | Security impact | Required tests | Status | Conflicts | Final decision / evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| CAP-001 | Persistent job queue and scheduler | Initial architecture | Enables ongoing campaign operations without coupling jobs to one UI | core, automation, receipts | runtime/scheduler choice | medium | queue persistence, retry, idempotency, crash recovery | PROPOSED |  |  |
| CAP-002 | Cross-platform analytics normalization | Initial architecture | Compare creator performance across all adapters while preserving raw platform metrics | analytics, platforms, schemas | platform analytics/read scopes | medium | fixture normalization, missing fields, schema versioning | PROPOSED |  |  |
| CAP-003 | Comment/inbox triage across supported platforms | Initial architecture | Makes channel handling bidirectional rather than publish-only | platforms, automation, policy | read/write interaction scopes | high | readback, draft reply, approval gate, receipt verification | PROPOSED |  |  |
| CAP-004 | 1h / 24h / 72h / 7d performance snapshots | Initial architecture | Provides comparable release lifecycle evidence | analytics, scheduler, receipts | analytics scopes | low | schedule accuracy, dedupe, clock drift, retry | PROPOSED |  |  |
| CAP-005 | Model routing: Nemotron + Qwen + optional external reviewers | Initial architecture | Separates planning, audit, adversarial review, and execution roles | orchestration, model providers | provider credentials/access | high | provider fallback, timeout, prompt/version receipt | PROPOSED |  |  |
| CAP-006 | Editable GUI using canonical schemas | Initial architecture | GUI edits same config used by CLI; no GUI-only hidden state | app/gui, schemas, core | UI framework | medium | round-trip config fidelity, validation, permission controls | PROPOSED |  |  |
| CAP-007 | First-class terminal command | Initial architecture | Stable operator surface for planning, publishing, inspect, analytics, and GUI launch | app/cli, core | none beyond runtime | low | command parsing, exit codes, dry-run, approval boundary | PROPOSED |  |  |
| CAP-008 | Windows desktop packaging | Initial architecture | Native installable desktop control surface over shared core | app/desktop, packaging | signing/distribution choices | medium | clean install, update, credential storage, IPC | PROPOSED |  |  |
| CAP-009 | iOS application | Initial architecture | Mobile creator operations over shared schemas/core contracts | app/mobile, API/service boundary | Apple signing, platform restrictions | high | auth, background limits, secure storage, approval UX | PROPOSED |  |  |
| CAP-010 | Creator-facing dashboard | Initial architecture | Unified releases, account state, HOLDs, analytics, receipts, and approvals | gui, analytics, receipts | depends on deployment model | medium | role isolation, data integrity, accessibility | PROPOSED |  |  |
| CAP-011 | Repo-native cross-agent skill pack | Existing repo + owned skill repos + curated starred skill sources | Gives Meta/Muse/Grok/Claude/Codex/Claude-style agents shared operating guidance inside the repo without machine-global setup | .agents/skills, scripts, CI, docs | none for instruction files; referenced external runtimes remain separate | medium | frontmatter validation, duplicate-name check, CI, host mirror sync | VERIFIED |  | Canonical root `.agents/skills`; native validation PASS; NVIDIA SkillEvaluator 0.9.0 keyless Tier-1 run `44018005907`: 9/9 PASS, 83.0–89.8/100. This does not certify external tools referenced by skills as installed/LIVE. |

## Intake template

Copy one row per distinct proposal.

```text
ID:
CAPABILITY:
SOURCE MODEL / REVIEWER:
RATIONALE:
AFFECTED MODULES:
API / PERMISSION DEPENDENCY:
SECURITY IMPACT:
REQUIRED TESTS:
STATUS:
CONFLICTS:
FINAL DECISION / EVIDENCE:
```

## Merge policy

A proposal is not accepted merely because multiple models independently suggest it. Convergence increases review priority, not authority.

When two models propose incompatible implementations for the same capability:

1. keep both proposals;
2. identify the exact conflict;
3. test or benchmark when possible;
4. preserve the baseline until one path is explicitly selected;
5. record the final decision and evidence here.

## Packaging target after the capability parade

The intended packaging direction is one shared product core with multiple control surfaces:

```text
SOCIALMEDIANEMOQWENBOT/
├── packages/
│   ├── core/
│   ├── platforms/
│   ├── analytics/
│   ├── automation/
│   ├── auth/
│   ├── receipts/
│   └── schemas/
├── apps/
│   ├── cli/
│   ├── gui/
│   ├── desktop/
│   ├── mobile/
│   └── web/          # optional
├── services/
│   ├── worker/
│   ├── scheduler/
│   └── local-api/
└── config/
    ├── creators/
    ├── themes/
    └── platform-profiles/
```

This is a packaging target, not permission to rewrite the verified core during the parade.
