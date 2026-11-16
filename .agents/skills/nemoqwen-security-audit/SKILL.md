---
name: nemoqwen-security-audit
description: Source-first defensive security review for NEMOQWEN credentials, adapters, creator isolation, receipts, CLI, GUI, desktop, mobile, workers, and OAuth boundaries.
source: project-native; derived from Cloudflare security-audit-skill principles
status: repo-native
---

# NEMOQWEN Security Audit

Use this skill for defensive review of this repository and its deployment boundaries.

## Evidence rule

A security finding requires:
- a real trust boundary;
- a reachable input/action;
- an intended control;
- a demonstrated or source-grounded failure;
- an affected principal/resource;
- a concrete consequence.

Missing best practice alone is not a confirmed vulnerability.

## Priority surfaces

Review:
1. credential/token storage;
2. multi-creator tenant isolation;
3. platform account selection;
4. OAuth callback/state handling;
5. publish approval bypass;
6. receipt integrity and secret leakage;
7. local file/media handling;
8. browser/GUI input and XSS;
9. command execution and CLI argument handling;
10. worker/scheduler replay and idempotency;
11. webhook verification;
12. dependency/supply-chain trust;
13. desktop/mobile IPC;
14. update/signing channels.

## Safe execution

- Source inspection is read-only.
- Do not probe production or shared third-party accounts as part of an audit.
- Use test creators, fixtures, local mocks, and disposable environments.
- Do not spend paid quota or publish real content unless explicitly included in the approved validation scope.
- Never copy ambient credentials into fixtures.
- If decisive evidence depends on an external configuration not visible in source, mark it NEEDS_VALIDATION/HOLD with the exact missing fact.

## Finding format

```text
TITLE:
STATE: confirmed | needs_validation | rejected
BOUNDARY:
SOURCE PATH:
INPUT:
CONTROL EXPECTED:
OBSERVED / SOURCE EVIDENCE:
IMPACT:
SMALLEST EFFECTIVE FIX:
REGRESSION TEST:
```

Only confirmed findings receive severity.

## NEMOQWEN-specific invariants

- `--approve` cannot publish through a profile configured `draft`.
- Creator A cannot cause Creator B's adapter to use B's secrets.
- Receipts never serialize secret values.
- An ambiguous network failure cannot automatically replay a non-idempotent post.
- Web content cannot inject commands into the orchestration layer.
- A platform response cannot mutate the canonical release without an explicit reconciliation action.
- GUI clients cannot bypass core policy by calling adapters directly.
