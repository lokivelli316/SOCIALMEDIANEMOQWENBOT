# Thorkant Lap 2 intake — integration ledger

**Reviewer:** THK2 / Thorkant  
**Reviewed frozen baseline:** `d8a294094813e886346808b2fe59197888ca1268`  
**Review file SHA-256 (operator upload):** `5160dcbd72c73bd7bb22354b68eb8b6fbcbef657710150bcd8a6092657bf0b7e`  
**Original reproducer SHA-256 (operator upload):** `774ae5a28f192e379c4db47488ab091139246793c3e3458c5a73f10c9a0de64a`  
**Integration branch:** `integration/thorkant-lap2-20261117`

The original THK2 IDs remain authoritative attribution. This file does not renumber, erase, or claim authorship of Thorkant findings.

## Reviewer result preserved

THK2 reported 49 findings: 33 NEW, 0 REGRESSION, 12 KNOWN-OPEN, 4 CONTRADICTION; 26 capability proposals; 8 bounded edge-case loops; 12 mocked-network reproducers, all reported confirmed. The reviewer verdict was **BLOCKER FOUND**.

## Independently source-confirmed against current main before patching

The integration pass directly confirmed the current source still had:
- THK2-001: X could return `published` without `data.id`.
- THK2-002: Reddit could return `published` without `data.name`.
- THK2-003: duplicate prevention was check-then-act, with no in-process single-flight.
- THK2-005: receipt `detail` was not redacted.
- THK2-006: default receipts path was CWD-relative.
- THK2-007: `secondaryTypes` were not validated.
- THK2-008: explicit `plan(..., platform)` skipped `enabled`.
- THK2-009: `inspect()` did not write a durable receipt.
- THK2-011: no 429 / Retry-After branch.
- THK2-017: Reddit link posts defaulted `resubmit=true`.
- THK2-023: JSON inputs had no size cap.
- THK2-024: caller abort signal was not composed with timeout.
- THK2-027: receipt chain errors counted filtered rather than physical lines.
- THK2-028: skill validation did not compare manifest vs filesystem.
- THK2-029: CI lacked explicit least-privilege permissions.
- THK2-049: SkillEvaluator documentation contradicted its workflow trigger.

## Patched on this branch

- THK2-001 / THK2-002: X and Reddit successful HTTP responses without required object IDs now remain `submitted`, never `published`; they explicitly warn against blind retry.
- THK2-003: same orchestrator + same creator/release/platform operation is single-flight.
- THK2-005: shared redaction scrubs common credential fields and Bearer tokens before API error construction and again before receipt persistence.
- THK2-006: default receipt path is stable under `$HOME/.nemoqwen/receipts.jsonl`, overridable by `NEMOQWEN_RECEIPTS`.
- THK2-007: every `secondaryTypes` entry is validated.
- THK2-008: explicitly requested disabled platforms return no plan.
- THK2-009: successful readback snapshots are hash-chained `inspect` receipts; raw adapter response bodies remain excluded from persistence.
- THK2-011: HTTP 429 becomes HOLD and preserves Retry-After evidence when present. Full quota/budget governor remains OPEN.
- THK2-017: Reddit link `resubmit` defaults false and requires an explicit boolean manifest override.
- THK2-023: creator/release JSON reads are size-bounded (default 1 MiB; `NEMOQWEN_MAX_MANIFEST_BYTES` override).
- THK2-024: caller AbortSignal and request timeout are composed.
- THK2-027: receipt verification reports physical file lines.
- THK2-028: validator fails on manifest/filesystem skill drift.
- THK2-029: CI token permission is explicitly `contents: read`.
- THK2-049: SkillEvaluator documentation now describes both path-scoped PR and manual triggers.

Regression tests were added for these behaviors. Initial branch CI exposed one test-timing defect in the new single-flight test; the test was repaired without weakening runtime behavior. Subsequent CI is the acceptance evidence for this candidate branch.

## THK2-010 reclassified to unresolved CONTRADICTION for integration

Do **not** migrate X media upload blindly.

Current evidence conflicts:
- X's current public documentation repository / current guidance points to dedicated REST paths:
  - `POST /2/media/upload/initialize`
  - `POST /2/media/upload/{id}/append`
  - `POST /2/media/upload/{id}/finalize`
  - status via `GET /2/media/upload?command=STATUS...`
- An official `xdevplatform/samples` media-upload-v2 Python sample still uses the command-style `POST /2/media/upload?command=INIT|FINALIZE` + APPEND form workflow.

Therefore THK2-010 is preserved as an external-source contradiction until authoritative docs and/or an operator-authorized credentialed live test resolve which write path actually works for this account/API generation. The existing implementation is not declared correct or broken from model consensus.

## Findings already changed after the frozen baseline

- THK2-030: the frozen branch intentionally predates the main-only Lap-2 contract. Process lesson accepted for the next freeze: commit the contract before freezing.
- THK2-031: current `main` already records both Lap-1 and Lap-2 baseline references.
- THK2-032: this integration seat has authenticated GitHub evidence that SkillEvaluator workflow run `44018005907` completed successfully with 9/9 skills; THK2 correctly could not independently inspect that run from its seat. Its evidence-access limitation is preserved, not treated as a false claim. The MYTHOS naming ambiguity is clarified in the SkillEvaluator doc.

## Still OPEN / HOLD

No silent scope reduction:
- THK2-004 torn/corrupt receipt quarantine/repair.
- THK2-010 X media protocol live resolution.
- THK2-012 reproducible npm lockfile / exact dependency pinning / npm ci.
- THK2-013–016 platform preflight / local TikTok upload / total operation deadline.
- THK2-018–022 readback distinctions, media reuse, local-file HOLD semantics, alt/accessibility and dead-data wiring.
- THK2-025–026 env parser and structured CLI.
- THK2-033 skill progressive-disclosure warning.
- THK2-034 OAuth lifecycle.
- THK2-035 creator credential namespace isolation.
- THK2-036 asset allowlisted roots + hash pinning.
- THK2-037 cross-process receipt/publish locking.
- THK2-038 YouTube resumable session crash recovery.
- THK2-039–045 scheduler, comments/inbox/moderation, analytics, model routing, shared second brain, Mausbot dispatch, standing edge-case harness.
- THK2-046–048 contradictions remain preserved until evidence resolves them.

## Live boundary

None of these source patches make a creator/platform LIVE. OAuth credentials/scopes, platform review/approval, real mutation, object/job ID, real readback and durable receipts remain required.
