import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import type { CreatorProfile, ReleaseManifest } from "../src/types.js";
import { HoldError, fetchWithTimeout } from "../src/platforms/common.js";
import { TikTokAdapter } from "../src/platforms/tiktok.js";
import { FacebookAdapter } from "../src/platforms/facebook.js";
import { RedditAdapter } from "../src/platforms/reddit.js";
import { XAdapter } from "../src/platforms/x.js";
import { YouTubeAdapter } from "../src/platforms/youtube.js";

const creator: CreatorProfile = {
  id: "test-creator",
  displayName: "Test Creator",
  primaryType: "custom",
  platforms: {
    tiktok: { enabled: true, approval: "required", credentials: { accessToken: "MYTHOS_FIXTURE_TOKEN" } },
    facebook: { enabled: true, approval: "required", credentials: { accessToken: "MYTHOS_FIXTURE_TOKEN" }, defaults: { pageId: "1234" } },
    reddit: { enabled: true, approval: "required", credentials: { accessToken: "MYTHOS_FIXTURE_TOKEN" } },
    x: { enabled: true, approval: "required", credentials: { accessToken: "MYTHOS_FIXTURE_TOKEN" } },
    youtube: { enabled: true, approval: "required", credentials: { accessToken: "MYTHOS_FIXTURE_TOKEN" } }
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


test("bounded fetch timeout produces HOLD rather than an unbounded network wait", async t => {
  mockFetch(t, ((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch);
  await assert.rejects(fetchWithTimeout("https://example.test/hang", {}, 10), HoldError);
});

test("TikTok inspect uses publish status readback and preserves official status fields", async t => {
  mockFetch(t, async (_url, init) => {
    assert.equal(init?.method, "POST");
    assert.match(String(init?.body), /job-42/);
    return response({
      data: {
        status: "PUBLISH_COMPLETE",
        uploaded_bytes: 12345,
        publicaly_available_post_id: ["post-777"]
      },
      error: { code: "ok" }
    });
  });
  const snapshot = await new TikTokAdapter().inspect(creator, "job-42");
  assert.equal(snapshot.metrics.status, "PUBLISH_COMPLETE");
  assert.equal(snapshot.metrics.uploaded_bytes, 12345);
  assert.deepEqual(snapshot.metrics.publicaly_available_post_id, ["post-777"]);
});

test("Facebook inspect reads the returned object instead of treating submission as verification", async t => {
  mockFetch(t, async url => {
    assert.match(String(url), /1234_4567/);
    return response({
      id: "1234_4567",
      is_published: true,
      permalink_url: "https://facebook.example.test/post",
      created_time: "2026-11-17T00:00:00+0000"
    });
  });
  const snapshot = await new FacebookAdapter().inspect(creator, "1234_4567");
  assert.equal(snapshot.metrics.is_published, true);
  assert.equal(snapshot.metrics.permalink_url, "https://facebook.example.test/post");
});

test("YouTube inspect reads processing and privacy state for the uploaded video", async t => {
  mockFetch(t, async url => {
    assert.match(String(url), /youtube\/v3\/videos/);
    assert.match(String(url), /video-99/);
    return response({
      items: [{
        id: "video-99",
        status: { privacyStatus: "private", uploadStatus: "uploaded" },
        processingDetails: { processingStatus: "succeeded" },
        snippet: { publishedAt: "2026-11-17T00:00:00Z" }
      }]
    });
  });
  const snapshot = await new YouTubeAdapter().inspect(creator, "video-99");
  assert.equal(snapshot.metrics.privacy_status, "private");
  assert.equal(snapshot.metrics.processing_status, "succeeded");
});


test("YouTube resumable upload sends bounded chunks instead of buffering the whole file", async t => {
  const dir = await mkdtemp(join(tmpdir(), "nemoqwen-youtube-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const videoPath = join(dir, "video.bin");
  await writeFile(videoPath, Buffer.alloc(8 * 1024 * 1024 + 3, 7));

  const ranges: string[] = [];
  let call = 0;
  mockFetch(t, async (_url, init) => {
    call++;
    if (call === 1) {
      return new Response("", { status: 200, headers: { location: "https://upload.example.test/session" } });
    }
    ranges.push(String(new Headers(init?.headers).get("content-range") ?? ""));
    if (call === 2) {
      return new Response("", { status: 308, headers: { range: "bytes=0-8388607" } });
    }
    return new Response(JSON.stringify({ id: "video-chunked" }), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  });

  const result = await new YouTubeAdapter().publish(creator, {
    id: "release-youtube",
    title: "Chunked",
    contentType: "video",
    assets: [{ id: "video", kind: "video", path: videoPath, mimeType: "video/mp4" }],
    targets: { youtube: { privacyStatus: "private" } }
  });
  assert.equal(result.status, "submitted");
  assert.equal(result.externalId, "video-chunked");
  assert.deepEqual(ranges, [
    "bytes 0-8388607/8388611",
    "bytes 8388608-8388610/8388611"
  ]);
});
