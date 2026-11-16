# Repo-native skills

Canonical skill root: `.agents/skills/`.

These skills travel with SOCIALMEDIANEMOQWENBOT. They are instructions and operating contracts, not claims that external tools, platform accounts, or third-party runtimes are installed.

## Active pack

- `be-ambitious` — imported unchanged from `lokivelli316/EARLYWINE-PRESIDENTIAL-BLUEPRINT`.
- `nemoqwen-social-orchestrator` — five-platform orchestration contract.
- `nemoqwen-content-adaptation` — preserve creator intent while adapting channel packages.
- `nemoqwen-analytics` — raw + normalized analytics and experiment discipline.
- `nemoqwen-browser-qa` — safe browser/UI/OAuth verification.
- `nemoqwen-auth-oauth` — multi-creator credential and OAuth lifecycle.
- `nemoqwen-security-audit` — defensive source-first security review.
- `nemoqwen-design-review` — editable GUI/accessibility/operator UX review.
- `nemoqwen-swiftui-ios` — iOS/SwiftUI architecture and performance.

## Host mirroring

Run:

```bash
npm run skills:sync
```

This mirrors the canonical pack to:
- `.claude/skills/`
- `.github/skills/`

Generated mirrors are intentionally ignored by git. The canonical source remains `.agents/skills/`.

Validate:

```bash
npm run skills:validate
```

## Provenance

See:
- `skills/manifest.json`
- `THIRD_PARTY_NOTICES.md`

Derived skills are adapted to this project's existing architecture; they are not permission to replace the five platform adapters or bypass the authority/receipt model.
