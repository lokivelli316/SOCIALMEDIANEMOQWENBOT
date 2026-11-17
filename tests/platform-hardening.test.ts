import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import type { CreatorProfile, ReleaseManifest } from "../src/types.js";
import type { PlatformAdapter } from "../src/platforms/adapter.js";
import { DirectAdapterPublishError, withAuthorizedPublish } from "../src/core/publish-context.js";
import { AmbiguousOutcomeError, HoldError, fetchWithTimeout, readJsonResponse } from "../src/platforms/common.js";
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
    reddit: { enabled: true, approval: "required", credentials: { accessToken: "MYTHOS_FIXTURE_TOKEN" }, defaults: { userAgent: "script:nemoqwen-test:0.1.0 (by /u/nemoqwen_test)" } },
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
  const previousLegacy = process.env.NEMOQWEN_ALLOW_LEGACY_CREDENTIAL_REFS;
  process.env.MYTHOS_FIXTURE_TOKEN = "fixture-only";
  process.env.NEMOQWEN_ALLOW_LEGACY_CREDENTIAL_REFS = "1";
  globalThis.fetch = impl;
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.MYTHOS_FIXTURE_TOKEN;
    else process.env.MYTHOS_FIXTURE_TOKEN = previousToken;
    if (previousLegacy === undefined) delete process.env.NEMOQWEN_ALLOW_LEGACY_CREDENTIAL_REFS;
    else process.env.NEMOQWEN_ALLOW_LEGACY_CREDENTIAL_REFS = previousLegacy;
  });
}

async function authorizedPublish(
  adapter: PlatformAdapter,
  creatorProfile: CreatorProfile,
  manifest: ReleaseManifest
) {
  return withAuthorizedPublish(
    `test:${creatorProfile.id}:${manifest.id}:${adapter.platform}`,
    () => adapter.publish(creatorProfile, manifest)
  );
}

test("TikTok body-level creator-info rejection on HTTP 200 prevents post initiation", async t => {
  const calls: string[] = [];
  mockFetch(t, async url => {
    calls.push(String(url));
    return response({ error: { code: "access_denied", message: "creator info unavailable" } });
  });
  await assert.rejects(authorizedPublish(new TikTokAdapter(), creator, release), HoldError);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /creator_info/);
});

test("TikTok missing privacy options fails closed rather than bypassing preflight", async t => {
  let called = 0;
  mockFetch(t, async () => {
    called++;
    return response({ error: { code: "ok" }, data: {} });
  });
  await assert.rejects(authorizedPublish(new TikTokAdapter(), creator, release), /did not return privacy_level_options/);
  assert.equal(called, 1);
});

test("TikTok init acknowledgment remains submitted until independently verified", async t => {
  const responses = [
    response({ error: { code: "ok" }, data: { privacy_level_options: ["SELF_ONLY"] } }),
    response({ error: { code: "ok" }, data: { publish_id: "job-42" } })
  ];
  mockFetch(t, async () => responses.shift()!);
  const result = await authorizedPublish(new TikTokAdapter(), creator, release);
  assert.equal(result.status, "submitted");
  assert.equal(result.externalId, "job-42");
});

test("Facebook object acceptance remains submitted without readback", async t => {
  mockFetch(t, async () => response({ id: "1234_4567" }));
  const result = await authorizedPublish(new FacebookAdapter(), creator, release);
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
  await assert.rejects(authorizedPublish(new XAdapter(), creator, fiveAssets), HoldError);
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
  const previousRoots = process.env.NEMOQWEN_ASSET_ROOTS;
  process.env.NEMOQWEN_ASSET_ROOTS = dir;
  t.after(() => {
    if (previousRoots === undefined) delete process.env.NEMOQWEN_ASSET_ROOTS;
    else process.env.NEMOQWEN_ASSET_ROOTS = previousRoots;
  });

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

  const result = await authorizedPublish(new YouTubeAdapter(), creator, {
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


test("X successful HTTP response without data.id is submitted, never published", async t => {
  mockFetch(t, async () => response({ data: {} }));
  const result = await authorizedPublish(new XAdapter(), creator, { id: "x-no-id", title: "X no id", contentType: "text" });
  assert.equal(result.status, "submitted");
  assert.equal(result.externalId, undefined);
  assert.match(result.detail ?? "", /without data.id/);
});

test("Reddit successful submit response without data.name is submitted, never published", async t => {
  let submittedForm: URLSearchParams | undefined;
  mockFetch(t, async (_url, init) => {
    submittedForm = init?.body as URLSearchParams;
    return response({ json: { errors: [], data: {} } });
  });
  const redditCreator: CreatorProfile = {
    ...creator,
    platforms: {
      ...creator.platforms,
      reddit: { enabled: true, approval: "required", credentials: { accessToken: "MYTHOS_FIXTURE_TOKEN" }, defaults: { userAgent: "script:nemoqwen-test:0.1.0 (by /u/nemoqwen_test)" } }
    }
  };
  const result = await authorizedPublish(new RedditAdapter(), redditCreator, {
    id: "reddit-no-id", title: "No id", contentType: "link",
    url: "https://example.test/post",
    targets: { reddit: { subreddit: "test", kind: "link" } }
  });
  assert.equal(result.status, "submitted");
  assert.equal(result.externalId, undefined);
  assert.equal(submittedForm?.get("resubmit"), "false");
});

test("Reddit resubmit must be explicitly true in the manifest", async t => {
  let submittedForm: URLSearchParams | undefined;
  mockFetch(t, async (_url, init) => {
    submittedForm = init?.body as URLSearchParams;
    return response({ json: { errors: [], data: { name: "t3_ok", url: "https://reddit.test/t3_ok" } } });
  });
  await authorizedPublish(new RedditAdapter(), creator, {
    id: "reddit-resubmit", title: "Explicit repost", contentType: "link",
    url: "https://example.test/post",
    targets: { reddit: { subreddit: "test", kind: "link", resubmit: true } }
  });
  assert.equal(submittedForm?.get("resubmit"), "true");
});

test("HTTP 429 becomes HOLD with Retry-After evidence", async t => {
  mockFetch(t, async () => new Response(JSON.stringify({ error: { message: "slow down" } }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": "60" }
  }));
  await assert.rejects(
    authorizedPublish(new XAdapter(), creator, { id: "x-429", title: "Rate limit", contentType: "text" }),
    (error: unknown) => error instanceof HoldError && /Retry-After=60/.test(error.message)
  );
});

test("caller abort signal is composed with fetch timeout signal", async t => {
  mockFetch(t, ((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch);
  const controller = new AbortController();
  const request = fetchWithTimeout("https://example.test/caller-abort", { signal: controller.signal }, 30_000);
  controller.abort();
  await assert.rejects(request, /Abort/);
});


test("mutation timeout is AmbiguousOutcomeError while GET timeout remains a safe HOLD", async t => {
  mockFetch(t, ((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch);
  await assert.rejects(
    fetchWithTimeout("https://example.test/post-timeout", { method: "POST" }, 10),
    AmbiguousOutcomeError
  );
  await assert.rejects(
    fetchWithTimeout("https://example.test/get-timeout", { method: "GET" }, 10),
    (error: unknown) => error instanceof HoldError && !(error instanceof AmbiguousOutcomeError)
  );
  await assert.rejects(
    fetchWithTimeout("https://example.test/read-only-post", { method: "POST" }, 10, false),
    (error: unknown) => error instanceof HoldError && !(error instanceof AmbiguousOutcomeError)
  );
});

test("response body stall is bounded after headers arrive", async t => {
  mockFetch(t, async () => new Response(new ReadableStream<Uint8Array>({
    start() {
      // Headers are available immediately; body intentionally never closes.
    }
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const response = await fetchWithTimeout("https://example.test/body-stall", { method: "POST" }, 20);
  await assert.rejects(readJsonResponse(response), AmbiguousOutcomeError);
});

test("YouTube 308 without Range does not skip the first chunk and no-progress is bounded", async t => {
  const dir = await mkdtemp(join(tmpdir(), "nemoqwen-youtube-noprogress-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const videoPath = join(dir, "video.bin");
  await writeFile(videoPath, Buffer.alloc(1024, 5));
  const previousRoots = process.env.NEMOQWEN_ASSET_ROOTS;
  process.env.NEMOQWEN_ASSET_ROOTS = dir;
  t.after(() => {
    if (previousRoots === undefined) delete process.env.NEMOQWEN_ASSET_ROOTS;
    else process.env.NEMOQWEN_ASSET_ROOTS = previousRoots;
  });

  const ranges: string[] = [];
  let call = 0;
  mockFetch(t, async (_url, init) => {
    call++;
    if (call === 1) {
      return new Response("", { status: 200, headers: { location: "https://upload.example.test/stuck" } });
    }
    ranges.push(String(new Headers(init?.headers).get("content-range") ?? ""));
    return new Response("", { status: 308 });
  });

  await assert.rejects(authorizedPublish(new YouTubeAdapter(), creator, {
    id: "youtube-stuck",
    title: "Stuck",
    contentType: "video",
    assets: [{ id: "video", kind: "video", path: videoPath, mimeType: "video/mp4" }]
  }), /no forward progress/);

  assert.equal(ranges.length, 3);
  assert.deepEqual(ranges, [
    "bytes 0-1023/1024",
    "bytes 0-1023/1024",
    "bytes 0-1023/1024"
  ]);
});


test("direct adapter publish is rejected before any network call", async t => {
  let requests = 0;
  mockFetch(t, async () => {
    requests++;
    return response({ data: { id: "should-not-happen" } });
  });
  await assert.rejects(
    new XAdapter().publish(creator, { id: "direct-bypass", title: "No", contentType: "text" }),
    DirectAdapterPublishError
  );
  assert.equal(requests, 0);
});

test("HTTP account-state and server ambiguity map to truthful classes", async t => {
  const responses = [
    new Response(JSON.stringify({ error: { message: "token expired" } }), {
      status: 401, headers: { "content-type": "application/json" }
    }),
    new Response(JSON.stringify({ error: { message: "not authorized" } }), {
      status: 403, headers: { "content-type": "application/json" }
    }),
    new Response(JSON.stringify({ error: { message: "busy" } }), {
      status: 500, headers: { "content-type": "application/json" }
    })
  ];
  mockFetch(t, async () => responses.shift()!);

  await assert.rejects(
    authorizedPublish(new XAdapter(), creator, { id: "x-401", title: "Auth", contentType: "text" }),
    (error: unknown) => error instanceof HoldError && !(error instanceof AmbiguousOutcomeError)
  );
  await assert.rejects(
    authorizedPublish(new XAdapter(), creator, { id: "x-403", title: "Scope", contentType: "text" }),
    (error: unknown) => error instanceof HoldError && !(error instanceof AmbiguousOutcomeError)
  );
  await assert.rejects(
    authorizedPublish(new XAdapter(), creator, { id: "x-500", title: "Server", contentType: "text" }),
    AmbiguousOutcomeError
  );
});

test("X media upload uses current v2 initialize/append/finalize paths", async t => {
  const dir = await mkdtemp(join(tmpdir(), "nemoqwen-x-v2-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const mediaPath = join(dir, "clip.mp4");
  await writeFile(mediaPath, Buffer.alloc(1024, 3));

  const previousRoots = process.env.NEMOQWEN_ASSET_ROOTS;
  process.env.NEMOQWEN_ASSET_ROOTS = dir;
  t.after(() => {
    if (previousRoots === undefined) delete process.env.NEMOQWEN_ASSET_ROOTS;
    else process.env.NEMOQWEN_ASSET_ROOTS = previousRoots;
  });

  const calls: Array<{ url: string; method: string; body: unknown; headers: Headers }> = [];
  mockFetch(t, async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body, headers });
    if (url.endsWith("/initialize")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.media_type, "video/mp4");
      assert.equal(body.total_bytes, 1024);
      assert.equal(body.media_category, "tweet_video");
      return response({ data: { id: "media-1" } });
    }
    if (url.endsWith("/media-1/append")) {
      assert.ok(init?.body instanceof FormData);
      const form = init.body as FormData;
      assert.equal(form.get("segment_index"), "0");
      assert.equal(form.get("command"), null);
      assert.equal(form.get("media_id"), null);
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/media-1/finalize")) {
      return response({ data: { id: "media-1" } });
    }
    if (url === "https://api.x.com/2/tweets") {
      return response({ data: { id: "tweet-1" } });
    }
    throw new Error(`Unexpected X fixture URL: ${url}`);
  });

  const result = await authorizedPublish(new XAdapter(), creator, {
    id: "x-v2-media",
    title: "Media",
    contentType: "video",
    assets: [{ id: "clip", kind: "video", path: mediaPath, mimeType: "video/mp4" }]
  });
  assert.equal(result.status, "published");
  assert.equal(result.externalId, "tweet-1");
  assert.equal(result.assetEvidence?.[0]?.size, 1024);
  assert.match(result.assetEvidence?.[0]?.sha256 ?? "", /^[a-f0-9]{64}$/);
  assert.deepEqual(calls.map(call => [call.method, call.url]), [
    ["POST", "https://api.x.com/2/media/upload/initialize"],
    ["POST", "https://api.x.com/2/media/upload/media-1/append"],
    ["POST", "https://api.x.com/2/media/upload/media-1/finalize"],
    ["POST", "https://api.x.com/2/tweets"]
  ]);
});

test("X mixed video/photo composition is held before upload", async t => {
  let requests = 0;
  mockFetch(t, async () => {
    requests++;
    return response({});
  });
  await assert.rejects(
    authorizedPublish(new XAdapter(), creator, {
      id: "x-mixed",
      title: "Mixed",
      contentType: "video",
      assets: [
        { id: "video", kind: "video", path: "/tmp/video.mp4", mimeType: "video/mp4" },
        { id: "photo", kind: "image", path: "/tmp/photo.jpg", mimeType: "image/jpeg" }
      ]
    }),
    HoldError
  );
  assert.equal(requests, 0);
});

test("trusted asset roots block absolute and symlink escapes before any upload", async t => {
  const root = await mkdtemp(join(tmpdir(), "nemoqwen-assets-root-"));
  const outside = await mkdtemp(join(tmpdir(), "nemoqwen-assets-outside-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));

  const secret = join(outside, "secret.mp4");
  await writeFile(secret, Buffer.from("DO-NOT-UPLOAD"));
  const previousRoots = process.env.NEMOQWEN_ASSET_ROOTS;
  process.env.NEMOQWEN_ASSET_ROOTS = root;
  t.after(() => {
    if (previousRoots === undefined) delete process.env.NEMOQWEN_ASSET_ROOTS;
    else process.env.NEMOQWEN_ASSET_ROOTS = previousRoots;
  });

  let requests = 0;
  mockFetch(t, async () => {
    requests++;
    return response({});
  });

  await assert.rejects(
    authorizedPublish(new YouTubeAdapter(), creator, {
      id: "asset-escape",
      title: "Escape",
      contentType: "video",
      assets: [{ id: "secret", kind: "video", path: secret, mimeType: "video/mp4" }]
    }),
    HoldError
  );
  assert.equal(requests, 0);
});

test("Reddit release target cannot override the creator-owned User-Agent", async t => {
  let requests = 0;
  mockFetch(t, async () => {
    requests++;
    return response({});
  });
  await assert.rejects(
    authorizedPublish(new RedditAdapter(), creator, {
      id: "reddit-ua-injection",
      title: "UA",
      contentType: "text",
      targets: { reddit: { subreddit: "test", kind: "self", userAgent: "evil/header" } }
    }),
    HoldError
  );
  assert.equal(requests, 0);
});
