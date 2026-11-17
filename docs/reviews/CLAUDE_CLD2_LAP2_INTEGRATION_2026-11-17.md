# Claude CLD2 Lap-2 intake — integration ledger

**Reviewer:** CLD2 / Claude (Sonnet 5.5)  
**Frozen baseline inspected by reviewer:** `d8a294094813e886346808b2fe59197888ca1268`  
**Operator-uploaded review SHA-256:** `82a2686786bc3573fd78e3efc253d97c3aca06c6282aa6c209f3914659b5da62`  
**Integration base:** post-THK2 main `1766503b863b82d0833057ff8d9bee884c5d6541`  
**Integration branch:** `integration/claude-lap2-20261117`

The original `CLD2-###` identifiers remain the reviewer's attribution. This document records the integration pass; it does not renumber, overwrite, or claim authorship of Claude's findings.

## Reviewer evidence preserved

Claude reported **BLOCKER FOUND**, no regressions against the repaired Lap-2 items, and 17 mocked/local reproducer probes. The review explicitly states that no live platform call, real credential, or model benchmark was performed. It also explicitly retracts the suspected Facebook v27.0 and YouTube unverified-project-private-lock claims after contrary evidence.

## Status after the prior THK2 merge

Before this CLD2 branch started, THK2 integration had already changed current `main` relative to Claude's frozen baseline:

- CLD2-005 X/Reddit false `published` without IDs: already repaired to non-final `submitted`.
- CLD2-009 CWD-relative receipt ledger: already repaired to a stable repo-anchored default, preserving the existing `.nemoqwen/receipts.jsonl` identity.
- CLD2-014 secret-bearing receipt detail: common token redaction already present, but Claude's unbounded-detail finding remained valid.
- CLD2-002 in-process same-orchestrator concurrency: THK2 added single-flight, but write-ahead intent and cross-process operation/append locking were still absent.
- CLD2-016 current-main baseline pointers already include Lap 2, but the frozen branch still intentionally predates the main-only review contract.

## Implemented on this branch

### CLD2-001 — ambiguous timeout retry
**Candidate status: REPAIRED + TESTED.**

- Added `AmbiguousOutcomeError extends HoldError`.
- Timeouts on non-idempotent mutation methods (`POST|PUT|PATCH|DELETE`) map to `verifying`, not a retryable `hold`.
- A persisted `verifying` result is actionable for duplicate protection; a second publish without `--retry` is blocked.
- GET/read-only timeout remains a normal HOLD.
- Regression test proves the first ambiguous attempt becomes `verifying`, the second call is HOLD, and the adapter is not invoked a second time.

### CLD2-002 — no write-ahead intent / cross-process race
**Candidate status: SUBSTANTIALLY REPAIRED; kill -9/device crash acceptance still HOLD.**

- Publish path now uses a collision-resistant operation key.
- An O_EXCL operation lock is acquired before duplicate lookup and remote mutation.
- The operation lock is never auto-stolen. If a process dies, the lock persists and forces reconciliation instead of blind replay.
- An fsynced `phase:"intent"` / `status:"verifying"` receipt is written before adapter execution.
- Final result carries the same `attemptId` with `phase:"final"`.
- A final safe HOLD supersedes that attempt's intent so genuinely safe preflight failures remain retryable.
- Receipt appends are serialized across `ReceiptStore` instances with an O_EXCL append lock, closing the reproduced hash-fork race at source level.
- Unit tests prove in-flight intent exists, operation lock exclusivity, concurrent multi-store append chain integrity, ambiguous retry blocking, and safe-HOLD retryability.
- **Still required:** an actual child-process kill/crash injection and physical Termux/Android kill test.

### CLD2-004 — timeout ends at headers
**Candidate status: REPAIRED + TESTED.**

- Response body consumption is now bounded separately after headers.
- Body-phase timeout on a mutation becomes `AmbiguousOutcomeError`.
- Body-phase timeout on a read remains HOLD.
- Test uses a response whose headers arrive but body never closes and proves bounded failure.

### CLD2-006 — YouTube 308 resumable loop
**Candidate status: PARTIALLY REPAIRED.**

Closed:
- missing `Range` no longer advances as if the sent chunk were accepted;
- bounded maximum chunk attempts;
- three consecutive non-advancing 308 responses HOLD;
- invalid/out-of-bounds Range HOLD;
- regression test proves no chunk skip and bounded no-progress behavior.

Still OPEN:
- durable session URI/progress persistence across process death;
- status-query resume using `Content-Range: bytes */N`;
- provider-qualified retry handling for resumable 5xx responses.

### CLD2-007 — corrupt/torn receipt fail-open
**Candidate status: PARTIALLY REPAIRED.**

- Ledger parsing used by append and dedupe is now strict.
- Non-newline-terminated tail, invalid JSON, or invalid receipt object fails closed.
- Corruption cannot silently disappear from `latestActionablePublish()`.
- Appends refuse to continue across corrupt history.
- Cross-process append lock prevents the reproduced same-file chain fork.

Still OPEN:
- operator-visible quarantine/repair command;
- O(n) full-ledger read optimization / indexed tail cache.

### CLD2-008 — tail tamper/truncation verification
**Candidate status: PARTIALLY REPAIRED.**

- Legacy/unhashed records are allowed only as a contiguous prefix.
- Hash stripping from a new tail after chained history fails verification.
- New appends write an fsynced head sidecar containing receipt count + last hash.
- Tail truncation after that anchor is detected.
- Missing ledger now returns `valid:false`, `ledgerPresent:false`, `records:0`.

Still OPEN:
- historic ledgers that predate the head sidecar remain unanchored until a controlled migration/checkpoint;
- optional external anchor in Forge Relay / State Forge Storm Ledger remains an interface proposal, not installed behavior.

### CLD2-010 — ambiguous/destination-blind operation key
**Candidate status: REPAIRED FOR NEW RECEIPTS + TESTED.**

- New keys are `op:<sha256>` over stable canonical data including creator, platform, release content/assets and platform target/destination.
- Colon-join collisions are eliminated.
- Same release ID targeting different Reddit destinations receives different operation keys.
- Legacy operation keys remain conservative and are not silently ignored.

### CLD2-014 — unbounded error detail
**Candidate status: REPAIRED + TESTED.**

- Redacted detail is bounded before persistence.
- Truncated detail records a SHA-256 digest of the redacted full text.
- Regression test feeds ~2 MB detail and verifies the durable receipt stays bounded and contains no secret marker.

### CLD2-016 / CLD2-017 process hygiene
**Candidate status: PARTIAL.**

Implemented:
- recursive test glob is quoted so adding subdirectory tests cannot cause shell expansion to hide top-level tests;
- SkillEvaluator expected skill count is derived from `skills/manifest.json`, not hard-coded to nine;
- social-orchestrator skill now distinguishes exact runtime `PublishResult.status` values from broader operational lane labels;
- manifest/filesystem skill parity and CI `contents: read` were already repaired by THK2;
- current `main` already carries Lap-2 baseline pointers.

Still OPEN:
- no committed npm lockfile / `npm ci` conversion yet;
- frozen branch itself remains conventionally frozen rather than protected/tagged because this connector exposes no branch-protection/tag mutation capability;
- Lap-2 contract remains main-only relative to the historical frozen commit; next freeze must include its contract before freezing;
- CRLF-tolerant skill frontmatter normalization remains open.

### CLD2-019 malformed release schema
**Candidate status: PARTIALLY REPAIRED.**

- `tags` must be a string array.
- `assets` must be an array of objects with valid id/kind/string fields and valid platform names.
- `assets:{}`, `assets:[null]`, and invalid platform entries fail at load rather than crashing adapters.

Still OPEN:
- creator-id/header character policy;
- dated platform constraints and preflight capability profiles;
- AI/synthetic-media metadata fields;
- account-tier-dependent media limits.

## Explicitly still HOLD

### CLD2-003 — X media upload protocol
Preserved as CONTRADICTION. Current X documentation sources disagree. Do not delete either path based on model consensus. One operator-authorized test-account media initialization is still the most valuable tie-breaker.

### CLD2-011 — creator credential isolation
Still HIGH/HOLD. Creator JSON can still name arbitrary environment variables. The next repair must preserve env-var indirection while moving authorization of variable names to an operator-owned binding/prefix policy.

### CLD2-012 — asset-root trust boundary
Still HIGH/HOLD. Schema validation is not a filesystem trust boundary. Arbitrary readable paths remain possible for programmatic/in-memory manifests and loaded manifests until realpath containment/operator-owned roots are enforced.

### CLD2-013 — normalized readback presence
Inspect receipts now exist from THK2, but a normalized `presence: present|absent|removed|restricted|unknown` contract is not yet implemented.

### CLD2-015 — approval grant bound to plan/release hash
Still proposed. The existing `required|draft|auto` semantics remain unchanged.

### CLD2-018 — accessibility metadata
`Asset.alt` remains declared but not transmitted. No false claim of accessibility wiring is made.

## Candidate branch verification

GitHub Actions candidate run:
- TypeScript `npm run check`: PASS
- tests: **53/53 PASS**
- repo-native skill validation: **9/9 PASS**
- MYTHOS/NVIDIA SkillEvaluator workflow: PASS

These are source/test claims only. They are not platform LIVE claims.

## Live boundary

No creator/platform is promoted to LIVE. OAuth lifecycle, credential binding/isolation, asset-root containment, X media protocol resolution, real publish/readback, platform approvals/scopes, scheduler/worker acceptance, Mausbot dispatch, model-provider mesh and physical S24/Termux acceptance remain explicit HOLDs.
