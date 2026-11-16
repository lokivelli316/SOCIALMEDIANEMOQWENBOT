# NEMOQWEN ULTRA execution contract

## Source of truth

A `ReleaseManifest` is canonical. Platform posts are derived representations. A platform response never silently mutates the source release.

## Roles

- **Chief of Staff**: selects campaign objective, release priority, creator voice, and constraints.
- **Dispatcher**: resolves creator profile + target adapters.
- **Don**: enforces outbound authority. Public publishing cannot bypass the creator's approval mode.
- **Receipt Clerk**: records request/result/error metadata as JSONL.
- **Auditor**: compares requested target, adapter result, and receipt. A missing external permission remains HOLD.

These are logical roles. They can be backed by Nemotron, Qwen, ChatGPT/Dots-style persistent workers, Grokbot, or other models without changing platform adapters.

## Persistent-agent behavior

The core is designed for:
1. persistent creator profiles;
2. canonical release state;
3. scheduled/queued work;
4. non-destructive autonomous analysis;
5. explicit outbound authority;
6. receipts;
7. cross-platform measurement;
8. follow-up work generated from evidence.

## Platform adapter contract

Every adapter exposes:
- `plan()`: deterministic description of what would be sent;
- `publish()`: external mutation, approval-gated by orchestrator.

Adapters may add platform-specific preflight checks. TikTok, for example, queries creator info before direct posting.

## Creator abstraction

Creator archetypes supply default content modes, not restrictions. A musician may also be a comedian and maker. A business can publish educational content. `custom` is always valid.

## Multi-account rule

Tokens are never stored in creator JSON. Creator JSON stores the environment-variable name that holds each secret. This allows separate creators/accounts on the same runtime.

## Completion boundary

Code present != account LIVE.

A platform becomes LIVE for a creator only after:
- credentials installed;
- required scopes/permissions approved;
- platform app review/audit satisfied where applicable;
- a real publish succeeds;
- the resulting platform object is read back or otherwise verified;
- the receipt contains the platform object ID.

Until then status is HOLD for that creator/platform, while independent work continues.
