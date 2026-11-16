---
name: nemoqwen-design-review
description: Design and review NEMOQWEN's editable creator GUI for clarity, accessibility, responsive behavior, truthful status, and non-generic operator ergonomics.
source: project-native; informed by Leonxlnx/taste-skill and agentic-awesome-skills design skills
status: repo-native
---

# NEMOQWEN Design Review

Use this skill for the future editable GUI, dashboard, Windows desktop, web surface, and shared visual system.

## Product goal

The UI is an operator surface over the same schemas and policies used by the CLI. It must expose system truth without inventing GUI-only state.

## Required surfaces

- creator switcher;
- connected account state;
- release queue;
- release detail;
- per-platform plan;
- approval controls;
- publish/readback state;
- analytics snapshots;
- comments/inbox triage;
- receipts;
- HOLD/repair queue;
- settings/theme/accessibility.

## Design invariants

- One obvious primary action per screen.
- Distinct status language: PLAN, HOLD, PUBLISHED, FAILED, UNAVAILABLE, UNCONFIGURED.
- Never hide a blocker behind a spinner.
- Never represent authentication alone as LIVE.
- Advanced controls can be available without dominating the normal path.
- Mobile layouts must collapse cleanly to one column where necessary.
- Touch targets and text must remain usable on phone.
- Keyboard navigation, visible focus, Dynamic Type/text scaling equivalents, and reduced motion are required.
- Data-dense screens should remain readable rather than becoming decorative dashboards.

## Editable GUI rule

Every user-editable value must map to a documented schema field or explicit runtime preference.

If the GUI edits:
- creator identity;
- creator types;
- voice/pillars;
- platform authority;
- platform defaults;
- release metadata;
- themes;

then the CLI/core must be able to read the same value without conversion loss.

## Avoid

- generic three-card feature rows as the default information architecture;
- fake analytics;
- decorative status lights with no semantic state;
- inaccessible low-contrast text;
- hidden destructive actions;
- hover-only controls;
- auto-running motion that ignores reduced-motion preference;
- storing secrets in ordinary local app config.

## Review receipt

Return:
- screen/flow reviewed;
- highest-impact usability issue;
- accessibility findings;
- responsive findings;
- truth/status findings;
- recommended change;
- validation viewport/input method.
