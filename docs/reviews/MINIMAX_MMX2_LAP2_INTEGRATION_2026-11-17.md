# MiniMax MMX2 Lap-2 intake — integration ledger

**Reviewer:** MiniMax Code (namespace `MMX2-###`)  
**Frozen baseline inspected:** `baseline/pre-parade-lap2-20261116` @ `d8a294094813e886346808b2fe59197888ca1268`  
**Operator-uploaded review SHA-256:** `ee425479e323ad7abd7092e66eebf34c358e26d43cda1414a91e2b05cc8acd99`  
**Integration base:** post-THK2 + post-CLD2 main `42fe093e2f0a42920587dffe3f06cb3d693fcb62`  
**Integration branch:** `integration/minimax-lap2-20261117`

The original `MMX2-###` identifiers remain MiniMax's attribution. This file records integration decisions against current main; it does not renumber, erase, or claim authorship of reviewer findings.

## Reviewer evidence preserved

MiniMax reports that it cloned and checked out the exact frozen commit, kept the tree clean, reproduced `tsc` PASS, 26/26 tests PASS and 9/9 skill validation PASS, and independently ran external reproducers. SkillEvaluator scores were explicitly **not** independently rerun from that seat because PyPI was unavailable. No real platform mutation or LIVE claim was made.

## Findings already repaired before this branch

The THK2 and CLD2 integrations changed current main relative to the MiniMax frozen baseline. The following MMX2 findings were already closed or materially hardened before this branch:

- **MMX2-001** X/Reddit false `published` without object ID — repaired by THK2.
- **MMX2-002** timeout HOLD replay — repaired by CLD2 using `AmbiguousOutcomeError -> verifying`, write-ahead intent and duplicate blocking.
- **MMX2-003** caller-signal/body-phase timeout holes — repaired by THK2/CLD2.
- **MMX2-009** cross-process receipt-chain fork — repaired by CLD2 append lock.
- **MMX2-010** corruption fail-open / physical line reporting — materially repaired by THK2/CLD2; quarantine command remains open.
- **MMX2-014** receipt secret redaction/unbounded detail — materially repaired by THK2/CLD2; this branch additionally removes literal env-var names from missing-credential HOLDs.
- **MMX2-015** readback not receipted — repaired by THK2.
- **MMX2-016** disabled explicit plan — repaired by THK2.
- **MMX2-017** skill manifest/filesystem drift — repaired by THK2.
- **MMX2-019** Reddit `resubmit=true` default — repaired by THK2.
- **MMX2-020** manifest byte cap — repaired by THK2.
- **MMX2-021** `secondaryTypes` validation — repaired by THK2.
- **MMX2-022** receipt path CWD drift — repaired by THK2. This branch additionally anchors `creator-types` to the package path.
- **MMX2-028** X media category guess — this branch requires explicit MIME for local X media and derives category from asset kind.
- **MMX2-037** `verifying` dead status — CLD2 now produces it for ambiguous outcomes. `plan` receipts remain open.

## Implemented on this branch

### MMX2-004 — unrestricted local asset paths
**Candidate status: REPAIRED FOR X/YOUTUBE LOCAL PATHS + TESTED.**

- Loaded release manifests are bound to their manifest directory as a trusted root.
- Operators may add roots with `NEMOQWEN_ASSET_ROOTS` using the OS path delimiter.
- Asset access uses `realpath()` containment, requires a regular file, opens the resolved path, computes SHA-256 from the same open handle, and publishes only from that handle.
- Absolute/traversal/symlink escapes outside approved roots do not inherit authority from the manifest.
- Policy refusal maps to HOLD before network.
- Publish receipts can carry additive `assetEvidence` with asset id, root-relative path, size and SHA-256.
- In-memory manifests with local paths require explicit `NEMOQWEN_ASSET_ROOTS`; they do not inherit CWD authority.

Still open:
- a dedicated operator-facing asset-policy inspection command;
- richer media metadata preflight beyond size/path/digest.

### MMX2-005 — credential namespace isolation
**Candidate status: REPAIRED WITH OPERATOR-OWNED BINDINGS + TESTED.**

- Env-var indirection is preserved.
- Creator JSON no longer grants itself authority to arbitrary `process.env` names.
- Operator-owned `.nemoqwen/credential-bindings.json` binds creator -> platform -> credential slot -> permitted env-var name.
- `loadCreator()` validates the reference against the operator binding.
- `credential()` rechecks the binding at use, so post-load profile mutation fails closed.
- Missing-credential HOLD text no longer persists literal environment-variable names.
- Explicit compatibility override: `NEMOQWEN_ALLOW_LEGACY_CREDENTIAL_REFS=1`.
- Added `config/credential-bindings.example.json`; the real file remains git-ignored under `.nemoqwen/`.

Still open:
- OAuth refresh/expiry/revocation/account-state lifecycle (MMX2-031).

### MMX2-006 — exported adapter authority bypass
**Candidate status: MATERIALLY REPAIRED + TESTED.**

- Mutable exported `adapters` singleton removed.
- Internal registry is frozen.
- Orchestrator receives an adapter resolver for testability instead of monkeypatching the production registry.
- Every adapter `publish()` requires an authorized async publish context.
- Only the orchestrator wraps the actual mutation in that context after authority, operation-lock, dedupe and fsynced intent steps.
- Direct adapter publication is rejected before credential resolution/network.
- Regression test asserts zero network calls on direct X adapter publish.

Boundary note:
- This is a runtime/package architecture gate against accidental/consumer bypass. Source code with arbitrary repository modification can always remove a software guard; that is outside this threat model.

### MMX2-007 — async CLI success regression
**Candidate status: REPAIRED + TESTED.**

Publish exit taxonomy:
- `published` = 0
- `submitted` = 0
- `hold|verifying|planned` = 2
- `failed` = 3
- top-level internal/argument error = 1 except usage/unknown command = 2

Additional CLI hardening from MMX2-030:
- unknown publish flags are rejected;
- `--dry-run` produces plan output only, with no publish mutation/receipt;
- top-level error boundary prints the error instead of an unhandled rejection;
- `creator-types` path is package-relative rather than CWD-relative.

### MMX2-008 — account-state/rate-limit HTTP classification
**Candidate status: MATERIALLY REPAIRED + TESTED.**

- 401/403 -> HOLD for operator/account/permission reconciliation.
- 429 -> HOLD with `Retry-After` and available `X-Ratelimit-*` evidence.
- 408/5xx on a mutation -> `AmbiguousOutcomeError` -> `verifying`.
- 408/5xx on a read -> HOLD.
- 400/404/422 and other definitive non-success responses remain FAILED.
- Existing redaction and bounded-detail handling still apply.

Still open:
- platform-specific typed error-code mapping and a durable quota governor.

### MMX2-011 — X previous command-style media protocol
**Candidate status: REPAIRED TO CURRENT OFFICIAL V2 PATHS + FIXTURE TESTED; LIVE STILL HOLD.**

Primary X documentation checked during integration states:
- INIT: `POST /2/media/upload/initialize` with JSON
- APPEND: `POST /2/media/upload/{id}/append`
- FINALIZE: `POST /2/media/upload/{id}/finalize`
- STATUS: `GET /2/media/upload?command=STATUS&media_id=...`
- command-style INIT/APPEND/FINALIZE against `POST /2/media/upload` is the previous protocol.

The X changelog also states the chunked-upload quickstart moved to the dedicated v2 paths instead of the previous command-style flow.

Implementation:
- migrated INIT/APPEND/FINALIZE to those paths;
- kept 4 MiB segments;
- STATUS retains the documented command-style GET;
- fixture test asserts method/URL/body sequence.

THK2-010's original contradiction record remains preserved as historical evidence. Current official X docs resolve the implementation direction, but **one operator-authorized credentialed test account call is still required before X media is LIVE**.

### MMX2-012 — X media composition/orphans
**Candidate status: MATERIALLY REPAIRED.**

Before upload:
- <=4 photos OR one GIF OR one video;
- no video+other media;
- no GIF+other media;
- unsupported local asset kinds HOLD;
- missing MIME for local X media HOLD instead of guessing category.

If post creation fails after uploads, the resulting error records orphaned media IDs in the final receipt detail.

Still open:
- structured orphan-media receipt fields and cleanup/expiry workflow.

### MMX2-013 — Reddit User-Agent
**Candidate status: REPAIRED + TESTED.**

- User-Agent is creator-profile owned only.
- Release targets cannot inject/override it.
- Value must match `platform:app-id:version (by /u/username)`.
- shipped creator example updated to that shape.
- override attempt HOLDs before network.

### MMX2-027 — parent directory durability
**Candidate status: REPAIRED BEST-EFFORT.**

- First ledger/head creation fsyncs the parent directory after both entries are created.
- Filesystems/platforms that reject directory fsync with known unsupported errors degrade without falsifying file-fsync evidence.
- Physical Android/Termux crash/power-loss qualification remains HOLD.

## Verification on candidate branch

GitHub Actions CI:
- TypeScript `npm run check`: PASS
- tests: **63/63 PASS**
- repo-native skill validation: **9/9 PASS**

No SkillEvaluator workflow was triggered by this branch because the canonical skill files/workflow were not changed.

## Still OPEN / HOLD — no scope laundering

- **MMX2-010 remainder:** no operator quarantine/repair command or segmented receipt recovery.
- **MMX2-018 remainder:** no committed npm lockfile/`npm ci`; GitHub Actions still use mutable action tags rather than commit SHAs.
- **MMX2-023:** no `ReleaseRun` / multi-lane `publishAll()` run context.
- **MMX2-024:** complete per-adapter platform-limit preflight contract not implemented.
- **MMX2-025:** TikTok `max_video_post_duration_sec` is not yet enforced.
- **MMX2-026:** ledger still has O(n) history reads; no segmentation/retention/export command.
- **MMX2-029:** no durable per-token/platform rate-limit/quota governor.
- **MMX2-031:** OAuth/token lifecycle remains OPEN.
- **MMX2-032:** comments/inbox/moderation remains OPEN.
- **MMX2-033:** normalized/scheduled analytics remains OPEN.
- **MMX2-034:** scheduler/queue/lease/retry service remains OPEN.
- **MMX2-035:** model routing/dispatcher/auditor provider interface remains OPEN.
- **MMX2-036:** outbound federation envelope/interfaces remain OPEN in NEMOQWEN.
- **MMX2-037 remainder:** plan receipts remain reserved/not emitted.
- **MMX2-038:** durable YouTube resumable session/recovery remains OPEN.
- **MMX2-039:** several security invariants now have executable regression tests; full invariant suite remains OPEN.
- **MMX2-040:** object-ID truthfulness + readback receipts now exist, but no mechanical `live-verify` command yet.
- **MMX2-041:** historical frozen branch still predates its review contract; next freeze must include the contract before freezing.

## Federation / identity boundary

No federation role was reassigned:
- **Mausbot remains the dispatcher role under evaluation.**
- **Grokbot remains a reviewer/report source, not the dispatcher.**
- Infinite Brain, Forge Relay Exchange, StateForgeStormLedger and nemotronUltragenerator remain separate systems.
- This integration does not make any of them a second NEMOQWEN core or grant them platform credentials/publish authority.

## LIVE boundary

Nothing in this branch makes a creator/platform LIVE.

LIVE still requires real credentials and scopes, platform/app approvals as applicable, a real mutation, returned object/job ID, real readback/verification, durable receipts, and the unresolved platform-specific qualification work above.
