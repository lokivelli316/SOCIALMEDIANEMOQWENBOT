# SOCIALMEDIANEMOQWENBOT agent entrypoint

Before modifying this repository:

1. Read `docs/ARCHITECTURE.md`.
2. Read `CAPABILITY_LEDGER.md` when adding capabilities.
3. Read the relevant skill under `.agents/skills/<name>/SKILL.md`.
4. Inspect existing implementation before proposing replacement.
5. Preserve canonical release manifests, creator isolation, authority modes, adapters, and receipts unless an explicit approved capability changes their contract.
6. Never place credentials or tokens in committed files.
7. Code present is not account LIVE.
8. Run:
   - `npm run check`
   - `npm test`
   - `npm run skills:validate`

Recommended skills by task:

- cross-platform release work -> `nemoqwen-social-orchestrator`
- caption/package adaptation -> `nemoqwen-content-adaptation`
- metrics/experiments -> `nemoqwen-analytics`
- browser/UI/OAuth verification -> `nemoqwen-browser-qa`
- auth/token lifecycle -> `nemoqwen-auth-oauth`
- security review -> `nemoqwen-security-audit`
- GUI/dashboard design -> `nemoqwen-design-review`
- iOS/SwiftUI -> `nemoqwen-swiftui-ios`
- substantial implementation quality pass -> `be-ambitious`
