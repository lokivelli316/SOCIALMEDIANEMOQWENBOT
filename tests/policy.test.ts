import assert from "node:assert/strict";
import test from "node:test";
import { publishAuthority } from "../src/core/policy.js";
import type { CreatorProfile } from "../src/types.js";

function creator(approval: "required" | "draft" | "auto"): CreatorProfile {
  return {
    id: "c1",
    displayName: "Creator",
    primaryType: "custom",
    platforms: {
      x: { enabled: true, approval, credentials: {} }
    }
  };
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
