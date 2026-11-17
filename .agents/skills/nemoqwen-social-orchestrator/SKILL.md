---
name: nemoqwen-social-orchestrator
description: Coordinate one canonical creator release across Facebook, TikTok, YouTube, Reddit, and X without flattening platform differences, bypassing approval gates, or losing receipts.
source: project-native; derived from lokivelli316/agentic-awesome-skills social-orchestrator concepts
status: repo-native
---

# NEMOQWEN Social Orchestrator

Use this skill when planning, adapting, publishing, monitoring, or reconciling one release across multiple social platforms.

## Non-negotiable architecture

- The `ReleaseManifest` is canonical.
- Facebook, TikTok, YouTube, Reddit, and X are adapters, not sources of truth.
- Creator profiles own voice, content pillars, credentials mapping, and per-platform authority.
- Never rewrite the canonical release merely to satisfy one platform.
- Platform-specific copy, dimensions, metadata, cuts, and scheduling are derived manifestations.
- A failed platform lane does not cancel successful independent lanes.
- Every external mutation must be receipt-backed.
- `required`, `draft`, and `auto` authority modes must be enforced exactly.
- Missing credentials, scopes, app review, rate limits, or external verification produce HOLD, never fake success.

## Workflow

1. Load the creator profile and release manifest.
2. Identify enabled target platforms.
3. For each platform:
   - validate required assets and target fields;
   - preserve the release meaning;
   - adapt format and metadata only where necessary;
   - identify permission/API blockers before mutation;
   - produce a deterministic plan.
4. If publication is authorized, execute each adapter independently.
5. Record the returned platform object ID and receipt.
6. Read back the object or platform status when the adapter supports it.
7. Reconcile partial success:
   - published lanes remain published;
   - failed lanes remain failed;
   - external blockers remain HOLD;
   - do not replay uncertain writes blindly.
8. Feed verified platform results into analytics without mutating the canonical release.

## Cross-platform adaptation rule

Adapt to the channel; do not clone blindly.

- **Facebook:** Page/community context, native media, discussion-oriented copy where appropriate.
- **TikTok:** vertical-first media, short hook surface, creator-info and privacy preflight.
- **YouTube:** durable title/description/tags, long-form or Shorts-specific packaging as applicable.
- **Reddit:** subreddit-specific context, self/link/comment mode, community rules, no generic broadcast tone.
- **X:** concise post/reply/quote behavior, media attachments, conversation-aware copy.

Do not hard-code generic "best times," hashtag counts, or engagement folklore as truth. Use creator history and current platform evidence when available.

## Failure model

Use the runtime `PublishResult.status` vocabulary exactly when reporting adapter results:

```text
PLANNED
HOLD
SUBMITTED
VERIFYING
PUBLISHED
FAILED
```

Operational surfaces may separately describe a lane as `DEGRADED`, `UNCONFIGURED`, or `UNAVAILABLE`, but those labels are not substitutes for a runtime publish status.

A submitted asynchronous job is not equivalent to a verified public post. A `VERIFYING` result means the remote outcome is ambiguous or still requires reconciliation and MUST NOT be blindly replayed.

## Output

For a multi-platform operation report:

```text
RELEASE: <id>
CREATOR: <id>

Facebook: <state> <object id / blocker>
TikTok:  <state> <publish id / blocker>
YouTube: <state> <video id / blocker>
Reddit:  <state> <thing id / blocker>
X:       <state> <post id / blocker>

Receipts: <paths/ids>
Readback: <verified / pending / unavailable>
Next action: <smallest required repair or measurement step>
```

## Do not

- replace working adapters with generic browser automation when an official API path exists;
- merge platform credentials across creators;
- infer public authority from authentication alone;
- report aggregate reach by summing incompatible metrics without labeling the method;
- silently alter creator voice or the source release.
