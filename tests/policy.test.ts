import assert from "node:assert/strict";
import test from "node:test";
import { publishAuthority } from "../src/core/policy.js";
import type { CreatorProfile } from "../src/types.js";

function creator(approval: string): CreatorProfile {
  return {
    id: "c1",
    displayName: "Creator",
    primaryType: "custom",
    platforms: {
      // Model a malformed runtime JSON value, not a TypeScript-authored profile.
      x: { enabled: true, approval: approval as "auto", credentials: {} }
    }
  } as CreatorProfile;
}

test("required blocks without explicit approval", () => {
  assert.equal(publishAuthority(creator("required"), "x", false).allowed, false);
  assert.equal(publishAuthority(creator("required"), "x", true).allowed, true);
});

test("draft always blocks publication", () => {
  assert.equal(publishAuthority(creator("draft"), "x", true).allowed, false);
});

test("auto permits publication", () => {
  assert.equal(publishAuthority(creator("auto"), "x", false).allowed, true);
});

test("invalid approval values fail closed, even when --approve is supplied", () => {
  for (const mode of ["Required", "requried", "", "auto ", "public", "require"]) {
    for (const explicit of [false, true]) {
      const decision = publishAuthority(creator(mode), "x", explicit);
      assert.equal(decision.allowed, false, `mode=${JSON.stringify(mode)}, explicit=${explicit}`);
      assert.match(decision.reason, /unknown approval mode/);
    }
  }
});

test("missing and null approval values fail closed", () => {
  for (const mode of [undefined, null]) {
    const profile = creator("auto") as CreatorProfile & { platforms: Record<string, any> };
    profile.platforms.x.approval = mode;
    assert.equal(publishAuthority(profile, "x", false).allowed, false);
  }
});
