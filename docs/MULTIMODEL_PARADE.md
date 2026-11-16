# MULTI-MODEL CAPABILITY PARADE

Use this document when sending SOCIALMEDIANEMOQWENBOT through Meta, Muse, Grok, Claude, ChatGPT, or another capable reviewer.

## Objective

Find and specify additional capabilities for the existing system before it is transformed into a terminal command, editable GUI, Windows application, and iOS application.

The task is capability expansion and hardening. It is NOT a blank-sheet redesign.

## Required baseline

Review the repository as it exists.

Frozen pre-parade implementation reference:

- branch: `baseline/pre-parade-20261116`
- commit: `eb5854e85b3ba011823b38a6a5a733fda008a752`

The live working branch may contain coordination documentation added after that commit.

## Repo-native skill pack

Before reviewing or proposing changes:

1. Read `AGENTS.md`.
2. Read `skills/manifest.json`.
3. Load the relevant `.agents/skills/<skill>/SKILL.md` for the task.
4. Treat those skills as project operating context, not as proof that any referenced upstream runtime is installed.
5. Do not replace the skill pack with a model-specific private prompt. Propose additions through `CAPABILITY_LEDGER.md`.

Relevant skills include social orchestration, content adaptation, analytics, browser QA, auth/OAuth, security audit, editable GUI design, SwiftUI/iOS, and the imported `be-ambitious` engineering pass.

## Non-negotiable preservation rules

- Preserve existing creator abstraction.
- Preserve Facebook, TikTok, YouTube, Reddit, and X adapters.
- Preserve per-creator/per-platform authority modes.
- Preserve the receipt model.
- Preserve canonical release manifests.
- Preserve current platform boundaries unless evidence shows an implementation bug.
- Do not move secrets into repository files.
- Do not silently reduce scope.
- Do not certify LIVE based on code presence alone.
- Do not replace working modules solely for stylistic preference.

## What each model should inspect

1. Core orchestration and policy boundaries.
2. Platform adapter completeness.
3. Creator-type flexibility.
4. Multi-account isolation.
5. OAuth/token lifecycle and secure credential handling.
6. Publishing, readback, comments, inboxes, moderation, and analytics.
7. Scheduling, queues, retries, rate limits, idempotency, and failure recovery.
8. Receipts, auditability, provenance, and state reconciliation.
9. Model-routing opportunities for Nemotron, Qwen, ChatGPT/Dots-style workers, Grokbot, and other model providers.
10. Cross-platform content adaptation without destroying canonical source content.
11. Accessibility and editable GUI requirements.
12. CLI behavior and scripting/automation surfaces.
13. Windows packaging/runtime requirements.
14. iOS packaging/runtime/background-task restrictions.
15. Testing, mocks/fixtures, integration tests, and real-account verification.
16. Observability, logging, privacy, data retention, and export.
17. Multi-creator tenancy, creator onboarding, role isolation, and account disconnect/reconnect.
18. Migration/versioning strategy for schemas and adapters.
19. Plugin/extension architecture for future social networks.
20. Anything materially missing that improves creator operations without flattening the existing architecture.

## Required output from each model

Do not return a replacement architecture as the primary answer.

Return:

### A. Repository findings
- bugs
- incomplete behavior
- security weaknesses
- API assumptions that need verification
- missing tests
- maintainability risks

### B. Capability proposals

For every proposal provide:

```text
CAPABILITY:
WHY IT MATTERS:
AFFECTED MODULES:
EXTERNAL API / PERMISSION DEPENDENCY:
SECURITY IMPACT:
IMPLEMENTATION APPROACH:
REQUIRED TESTS:
ACCEPTANCE EVIDENCE:
CONFLICTS WITH EXISTING SYSTEM:
PRIORITY:
```

### C. Packaging implications

For each accepted-looking capability, state whether it affects:

- shared core
- terminal CLI
- editable GUI
- Windows desktop
- iOS
- optional web surface
- worker/scheduler service

### D. Explicit preservation statement

List the existing modules/contracts that do not need replacement.

### E. Patch option

If proposing code, prefer an additive branch or patch. Do not mutate unrelated modules.

## Reviewer-specific focus

These are focus areas, not limits.

### Meta
Focus on creator workflows, social graph/channel operations, moderation, account separation, platform-scale UX, and capability gaps.

### Muse
Focus on creator ergonomics, content workflows, media packaging, campaign surfaces, accessibility, editable GUI concepts, and creator-type flexibility.

### Grok
Focus on adversarial edge cases, X integration depth, operational automation, failure modes, rate limits, external API weirdness, and blunt gap detection.

### Claude
Focus on architecture consistency, security, data modeling, schema evolution, tests, cross-platform packaging boundaries, and long-horizon maintainability.

### ChatGPT / integration pass
Reconcile proposals into `CAPABILITY_LEDGER.md` without erasing attribution, conflicts, blockers, or required acceptance evidence.

## Round-trip order

A suggested pass is:

```text
BASELINE
  ↓
Meta review
  ↓
Muse review
  ↓
Grok review
  ↓
Claude review
  ↓
Integration / dedup / conflict ledger
  ↓
Implementation branches
  ↓
CI + integration verification
  ↓
App / CLI / GUI packaging transformation
```

The output of one reviewer may be supplied to the next, but the original baseline and this contract must travel with it so later reviewers can distinguish inherited proposals from verified repository facts.

## Completion boundary

The parade is complete only when:

- all reviewer outputs are captured;
- proposals are entered into `CAPABILITY_LEDGER.md`;
- duplicates are consolidated;
- conflicts are explicit;
- blocked items keep their original target;
- accepted items identify tests and acceptance evidence;
- no existing verified capability was silently dropped.

Implementation is a separate phase.
