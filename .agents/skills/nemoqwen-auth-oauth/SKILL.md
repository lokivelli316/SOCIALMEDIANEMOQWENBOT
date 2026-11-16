---
name: nemoqwen-auth-oauth
description: Design and review multi-creator authentication, OAuth, token storage, refresh, revocation, scopes, and account isolation for NEMOQWEN platform adapters and future apps.
source: project-native; informed by agentic-awesome-skills auth patterns
status: repo-native
---

# NEMOQWEN Auth and OAuth

Use this skill whenever adding creator accounts, platform authorization, token refresh, disconnect, credential storage, or app-to-service authentication.

## Core invariants

- Credentials never enter committed source.
- One creator's credentials must never be addressable through another creator's profile.
- Store semantic credential references in creator config, not secret values.
- Use least privilege.
- Authentication success does not imply publish authority.
- Publish authority is still controlled by the creator profile.
- Token refresh and revocation are first-class lifecycle states.
- Logs and receipts contain identifiers and scope state, not secret token values.

## Account state

Track separately:

```text
UNCONFIGURED
AUTH_REQUIRED
AUTHENTICATED
SCOPE_INSUFFICIENT
APP_REVIEW_REQUIRED
READY_FOR_PLAN
READY_FOR_PUBLISH
REVOKED
EXPIRED
ERROR
```

Do not collapse these into one boolean.

## OAuth workflow

1. Generate authorization request with state and PKCE where supported.
2. Bind callback to creator + platform + pending authorization transaction.
3. Validate state before token exchange.
4. Store tokens in OS/service secret storage.
5. Record non-secret account identity and granted scopes.
6. Verify the expected account, Page/channel, or creator identity.
7. Test a non-destructive read operation.
8. Only then expose publish readiness.
9. Refresh tokens through provider-supported lifecycle.
10. Disconnect by revoking where supported and deleting local secret material.

## Storage targets

- CLI/headless: environment/secret store or OS credential manager.
- Windows desktop: Windows Credential Manager / DPAPI-backed storage.
- iOS: Keychain.
- Server: managed secret store with tenant isolation.

Do not use plaintext JSON, localStorage, committed .env files, or analytics events for secrets.

## Multi-creator isolation test

For two test creators A and B:
- A cannot read B's token reference;
- A's adapter cannot select B's account;
- receipts identify the creator and account object;
- disconnecting A does not mutate B;
- refresh failure for A does not disable B.

## Scope change rule

When a new capability requires a new scope, surface the scope delta explicitly and require reauthorization where the provider requires it. Never silently widen scopes.
