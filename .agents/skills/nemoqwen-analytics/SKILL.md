---
name: nemoqwen-analytics
description: Normalize and compare social performance across platforms without erasing raw metrics, confusing incompatible definitions, or inventing unavailable analytics.
source: project-native; informed by lokivelli316/agentic-awesome-skills analytics skills
status: repo-native
---

# NEMOQWEN Analytics

Use this skill for release snapshots, channel comparisons, experiments, and creator performance analysis.

## Evidence model

Always retain:
1. raw platform response;
2. collection timestamp;
3. creator/account identity;
4. release ID;
5. platform object ID;
6. normalized fields;
7. normalization version.

Never replace the raw metric with the normalized metric.

## Standard snapshot windows

When possible collect:
- 1 hour;
- 24 hours;
- 72 hours;
- 7 days;
- final/lifetime snapshot on explicit request.

If a window was missed, record the actual collection time. Do not backfill a synthetic value.

## Normalized metric families

Use common families only where definitions are sufficiently compatible:

- views / plays;
- unique viewers / reach;
- watch time;
- average watch duration;
- completion rate;
- rewatch/replay signals;
- likes/upvotes;
- comments/replies;
- shares/reposts;
- saves/bookmarks;
- clicks;
- follows/subscribers gained.

Platform-specific metrics remain platform-specific when semantics differ.

## Comparison rules

- Never sum "views" and "reach" as if identical.
- Never compare an upvote ratio directly to a like rate.
- Label whether a metric is account-level, post-level, video-level, or campaign-level.
- Separate missing from zero.
- Separate provisional from mature data.
- Keep platform discovery/traffic-source data in its native taxonomy unless a documented mapping exists.

## Experiment workflow

1. State hypothesis.
2. Define compared releases or variants.
3. Define window and metric.
4. Control for obvious maturity differences.
5. Record asset/copy differences.
6. Compare results.
7. Distinguish observation from causal claim.
8. Feed only evidence-backed findings into future recommendations.

## Output

Prefer a compact table:

| Platform | Object | Age | Views | Reach | Watch | Interactions | Status |
|---|---|---:|---:|---:|---:|---:|---|

Then provide:
- strongest observable signal;
- biggest uncertainty;
- next measurement;
- any recommendation explicitly tied to evidence.

Do not call a single outlier a stable strategy.
