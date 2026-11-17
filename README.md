# SOCIALMEDIANEMOQWENBOT — NEMOQWEN ULTRA

Creator-agnostic social operations core for **Facebook, TikTok, YouTube, Reddit, and X**.

The system keeps one canonical content object and produces platform-specific manifestations without letting any platform become the source of truth.

## Operating model

```text
NEMOQWEN ULTRA
  ├─ Chief of Staff       campaign intent / priorities
  ├─ Dispatcher           routes work to adapters
  ├─ Don                  outbound communications gate
  ├─ Receipt Clerk        immutable action receipts
  └─ Auditor              verifies plan vs. result
          │
          ├─ Facebook Page
          ├─ TikTok
          ├─ YouTube
          ├─ Reddit
          └─ X
```

## Creator types

Built-in archetypes are configuration, not hard-coded behavior:

- musician
- podcaster
- video_creator
- visual_artist
- streamer
- educator
- writer
- comedian
- maker_engineer
- business_brand
- nonprofit_advocacy
- custom

A creator can select one primary type, multiple secondary types, and custom content pillars. Nothing prevents adding new archetypes.

## Safety / authority boundary

- Credentials are environment variables only. Never commit tokens.
- Platform publishing is **approval-gated by creator profile**.
- `required` means an explicit `--approve` is required.
- `draft` permits planning/packaging but not public publication.
- `auto` permits publishing only for that creator + platform.
- Every external action writes a receipt.
- Missing permissions, app review, rate limits, or credentials produce **HOLD**, not fake success.

## Current implementation

| Platform | Implemented path | External requirement |
|---|---|---|
| X | text posts; local image/video upload via v2 media upload; attached media posts | X developer app + user-context token/scopes |
| Reddit | OAuth self/link submissions | approved Reddit API access + OAuth token + compliant User-Agent |
| Facebook | Page text/link posts; Page video from accessible `file_url` | Page token + Page permissions |
| TikTok | creator-info preflight + direct video post from verified URL | app approval, `video.publish`, user authorization; unaudited restrictions apply |
| YouTube | resumable video upload from local file | Google OAuth token with YouTube upload scope |

All five adapters expose the shared `inspect()` readback contract at the Lap-2 baseline. That is code/test capability only. This repository does **not** claim any creator account is LIVE until that creator's credentials, app approvals/scopes, real publish, real readback, and receipts pass.

## Quick start

```bash
npm install
cp .env.example .env
cp config/creator.example.json config/my-creator.json
cp config/release.example.json config/my-release.json

npm run check
npm test
npm run cli -- creator-types
npm run cli -- plan config/my-creator.json config/my-release.json
npm run cli -- publish config/my-creator.json config/my-release.json x --approve
npm run cli -- inspect config/my-creator.json x <external-id>
npm run cli -- receipts-verify
```

## Multi-creator credentials

Each creator profile maps semantic credential names to **environment-variable names**:

```json
{
  "platforms": {
    "x": {
      "enabled": true,
      "approval": "required",
      "credentials": {
        "accessToken": "ROBERT_X_ACCESS_TOKEN"
      }
    }
  }
}
```

A second creator can point to completely different environment variables without changing code.

## Canonical release object

A release may be a song, podcast episode, build log, artwork, lesson, comedy bit, product launch, stream clip, article, or custom object. The core stores its title, body, assets, links, tags, and per-platform targets once.

Runtime state and receipts are written under `.nemoqwen/` and ignored by git.

## Official API references

- X: https://docs.x.com/x-api/posts/manage-tweets/introduction
- Reddit: https://www.reddit.com/dev/api
- Facebook Page publishing: https://developers.facebook.com/docs/graph-api/reference/page/feed/
- Facebook Page video: https://developers.facebook.com/docs/graph-api/reference/page/videos
- TikTok Content Posting: https://developers.tiktok.com/products/content-posting-api/
- YouTube videos.insert: https://developers.google.com/youtube/v3/docs/videos/insert



## Repo-native agent skills

The repository carries its own canonical skill pack under `.agents/skills/` rather than depending on a separate machine-level skill install.

Current pack:

- `be-ambitious`
- `nemoqwen-social-orchestrator`
- `nemoqwen-content-adaptation`
- `nemoqwen-analytics`
- `nemoqwen-browser-qa`
- `nemoqwen-auth-oauth`
- `nemoqwen-security-audit`
- `nemoqwen-design-review`
- `nemoqwen-swiftui-ios`

Validate them with:

```bash
npm run skills:validate
```

Mirror them for Claude/GitHub-host skill discovery when needed:

```bash
npm run skills:sync
```

Skill provenance and third-party notices are recorded in `skills/manifest.json` and `THIRD_PARTY_NOTICES.md`. Skill presence is not runtime certification of any referenced external tool.

## Multi-model capability parade

Before app/CLI/GUI packaging, capability proposals are collected against the verified baseline rather than by independently redesigning the system.

- Capability intake and decision ledger: `CAPABILITY_LEDGER.md`
- Multi-model review contract: `docs/MULTIMODEL_PARADE.md`
- Original Lap-1 frozen reference: `baseline/pre-parade-20261116` at `eb5854e85b3ba011823b38a6a5a733fda008a752`
- Active Lap-2 frozen reference: `baseline/pre-parade-lap2-20261116` at `d8a294094813e886346808b2fe59197888ca1268`
- Lap-2 handoff: `docs/PARADE_LAP_2.md`

The parade is intended for independent reviewers across Meta, Muse, Grok/Grokbot reports, Claude, ChatGPT, Nemotron, Qwen, DeepSeek, GLM, Mistral, MiniMax, human reviewers, and later models. Mausbot is the intended dispatch role under evaluation, not an alias for Grokbot. Reviewer convergence raises priority but does not automatically authorize an architectural replacement.

See `docs/ARCHITECTURE.md` for the execution contract.
