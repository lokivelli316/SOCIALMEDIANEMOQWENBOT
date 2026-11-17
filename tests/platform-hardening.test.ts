import assert from "node:assert/strict";
import test from "node:test";
import type { CreatorProfile, ReleaseManifest } from "../src/types.js";
import { HoldError } from "../src/platforms/common.js";
import { TikTokAdapter } from "../src/platforms/tiktok.js";
import { FacebookAdapter } from "../src/platforms/facebook.js";
import { RedditAdapter } from "../src/platforms/reddit.js";
import { XAdapter } from "../src/platforms/x.js";

const creator: CreatorProfile = {
  id: "test-creator",
  displayName: "Test Creator",
  primaryType: "custom",
  platforms: {
    tiktok: { enabled: true, approval: "required", credentials: { accessToken: "MYTHOS_FIXTURE_TOKEN" } },
    facebook: { enabled: true, approval: "required", credentials: { accessToken: "MYTHOS_FIXTURE_TOKEN" }, defaults: { pageId: "1234" } },
    reddit: { enabled: true, approval: "required", credentials: { accessToken: "MYTHOS_FIXTURE_TOKEN" } },
    x: { enabled: true, approval: "required", credentials: { accessToken: "MYTHOS_FIXTURE_TOKEN" } }
  }
};

const release: ReleaseManifest = {
  id: "release-1", title: "Test Release", contentType: "video",
  targets: { tiktok: { videoUrl: "https://owned.example.test/video.mp4" } }
};

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function mockFetch(t: { after: (fn: () => void) => void }, impl: typeof fetch): void {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.MYTHOS_FIXTURE_TOKEN;
  process.env.MYTHOS_FIXTURE_TOKEN = "fixture-only";
  globalThis.fetch = impl;
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.MYTHOS_FIXTURE_TOKEN;
    else process.env.MYTHOS_FIXTURE_TOKEN = previousToken;
  });
}

test("TikTok body-level creator-info rejection on HTTP 200 prevents post initiation", async t => {
  const calls: string[] = [];
  mockFetch(t, async url => {
    calls.push(String(url));
    return response({ error: { code: "access_denied", message: "creator info unavailable" } });
  });
  await assert.rejects(new TikTokAdapter().publish(creator, release), HoldError);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /creator_info/);
});

test("TikTok missing privacy options fails closed rather than bypassing preflight", async t => {
  let called = 0;
  mockFetch(t, async () => {
    called++;
    return response({ error: { code: "ok" }, data: {} });
  });
  await assert.rejects(new TikTokAdapter().publish(creator, release), /did not return privacy_level_options/);
  assert.equal(called, 1);
});

test("TikTok init acknowledgment remains submitted until independently verified", async t => {
  const responses = [
    response({ error: { code: "ok" }, data: { privacy_level_options: ["SELF_ONLY"] } }),
    response({ error: { code: "ok" }, data: { publish_id: "job-42" } })
  ];
  mockFetch(t, async () => responses.shift()!);
  const result = await new TikTokAdapter().publish(creator, release);
  assert.equal(result.status, "submitted");
  assert.equal(result.externalId, "job-42");
});

test("Facebook object acceptance remains submitted without readback", async t => {
  mockFetch(t, async () => response({ id: "1234_4567" }));
  const result = await new FacebookAdapter().publish(creator, release);
  assert.equal(result.status, "submitted");
  assert.equal(result.externalId, "1234_4567");
});

test("X refuses five selected assets before uploading or publishing", async t => {
  let requests = 0;
  mockFetch(t, async () => { requests++; return response({}); });
  const fiveAssets: ReleaseManifest = {
    id: "release-2", title: "Five photos", contentType: "image",
    assets: Array.from({ length: 5 }, (_, i) => ({ id: `asset-${i}`, kind: "image" as const, path: `/tmp/asset-${i}.png` }))
  };
  assert.match(new XAdapter().plan(creator, fiveAssets).warnings.join(" "), /held until corrected/);
  await assert.rejects(new XAdapter().publish(creator, fiveAssets), HoldError);
  assert.equal(requests, 0);
});

test("Reddit absent metrics remain null, never fabricated as zero", async t => {
  mockFetch(t, async () => response({ data: { children: [{ data: { score: 7 } }] } }));
  const snapshot = await new RedditAdapter().inspect(creator, "t3_fixture");
  assert.equal(snapshot.metrics.score, 7);
  for (const name of ["upvote_ratio", "num_comments", "ups"]) {
    assert.equal(snapshot.metrics[name], null);
  }
});
