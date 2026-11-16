---
name: nemoqwen-swiftui-ios
description: Build and review the future NEMOQWEN iOS client in SwiftUI while preserving the shared core contract, secure credential storage, accessibility, responsive layouts, and measurable performance.
source: project-native; derived from twostraws/SwiftUI-Agent-Skill and SwiftUI performance guidance
status: repo-native
---

# NEMOQWEN SwiftUI / iOS

Use this skill when designing, implementing, or reviewing the iOS application.

## Architecture boundary

The iOS app is a control surface, not a second social-media engine.

Do not reimplement platform policy differently in Swift.

The app should consume:
- versioned creator/release schemas;
- platform capability/status responses;
- approval policy;
- receipts;
- analytics snapshots.

If shared TypeScript cannot run directly in the chosen iOS architecture, preserve behavior through a versioned local/service API contract and shared test fixtures.

## SwiftUI rules

- Check the project's actual deployment target before using version-specific APIs.
- Prefer SwiftUI over UIKit unless a specific requirement demands UIKit.
- Use feature-based file organization.
- Keep heavy work out of view bodies.
- Stabilize list identity.
- Avoid broad observation that invalidates large view trees.
- Move network, media, decoding, and expensive transformation work off the main thread.
- Keep navigation state explicit and recoverable.

## Creator app security

- Tokens/secrets live in Keychain or an equivalent approved secure store.
- The UI may display account identity and scope state, never secret token contents.
- Deep links/OAuth callbacks must validate their pending transaction.
- Disconnect must clear local secret material and revoke when supported.
- A creator/account switch must be obvious before any public mutation.

## Mobile lifecycle

Assume:
- background execution is limited;
- the app may be suspended;
- uploads may be interrupted;
- network may disappear;
- asynchronous platform jobs may finish after the app closes.

Persist enough non-secret state to reconcile operations on next launch. Do not infer failure solely from app suspension.

## Accessibility

Require:
- Dynamic Type;
- VoiceOver labels;
- sufficient contrast;
- large touch targets;
- Reduce Motion support;
- meaningful status text independent of color;
- landscape and multitasking behavior where supported.

## Performance audit

When performance is poor:
1. classify CPU, memory, scrolling, layout, image, or update fan-out;
2. inspect code first;
3. profile on device when code alone is insufficient;
4. fix the highest-impact cause;
5. re-run the same interaction and compare before/after evidence.

## Completion boundary

"iOS app builds" is not equivalent to:
- signed;
- installable;
- authenticated;
- capable of background reconciliation;
- able to publish;
- App Store ready.

Report each state separately.
