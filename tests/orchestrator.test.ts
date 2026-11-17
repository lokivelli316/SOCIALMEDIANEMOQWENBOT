import assert from "node:assert/strict";
import test from "node:test";
import { NemoQwenOrchestrator } from "../src/core/orchestrator.js";
import type { CreatorProfile, ReleaseManifest } from "../src/types.js";

test("plans enabled platforms for a mixed creator profile", () => {
  const creator: CreatorProfile = {
    id: "mixed",
    displayName: "Mixed Creator",
    primaryType: "musician",
    secondaryTypes: ["comedian", "maker_engineer"],
    platforms: {
      x: { enabled: true, approval: "required", credentials: {} },
      reddit: {
        enabled: true,
        approval: "required",
        credentials: {},
        defaults: { userAgent: "test/1.0" }
      }
    }
  };
  const release: ReleaseManifest = {
    id: "r1",
    contentType: "music_video",
    title: "Test",
    targets: { reddit: { subreddit: "test", kind: "self" } }
  };
  const plans = new NemoQwenOrchestrator().plan(creator, release);
  assert.deepEqual(plans.map(p => p.platform).sort(), ["reddit", "x"]);
  assert.equal(plans.every(p => p.requiresApproval), true);
});


test("explicit plan request respects disabled platform kill switch", () => {
  const creator: CreatorProfile = {
    id: "disabled",
    displayName: "Disabled",
    primaryType: "custom",
    platforms: { x: { enabled: false, approval: "required", credentials: {} } }
  };
  const release: ReleaseManifest = { id: "r-disabled", title: "No plan", contentType: "text" };
  assert.deepEqual(new NemoQwenOrchestrator().plan(creator, release, "x"), []);
});
