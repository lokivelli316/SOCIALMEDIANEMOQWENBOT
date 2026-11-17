import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCreator, loadRelease } from "../src/core/config.js";

async function withJson(value: unknown, fn: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "nemoqwen-config-test-"));
  try {
    const path = join(dir, "fixture.json");
    await writeFile(path, JSON.stringify(value), "utf8");
    await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const validCreator = {
  id: "creator-a",
  displayName: "Creator A",
  primaryType: "custom",
  platforms: {
    x: { enabled: true, approval: "required", credentials: { accessToken: "CREATOR_A_X_TOKEN" } }
  }
};

test("valid creator and release retain their original schema", async () => {
  await withJson(validCreator, async path => {
    const profile = await loadCreator(path);
    assert.equal(profile.platforms.x?.approval, "required");
  });
  await withJson({ id: "r1", title: "Release", contentType: "video", targets: { x: {} } }, async path => {
    assert.equal((await loadRelease(path)).id, "r1");
  });
});

test("creator rejects every invalid approval without acquiring publish authority", async () => {
  for (const approval of ["Required", "requried", "", "auto ", "public", null, undefined]) {
    const profile = structuredClone(validCreator) as Record<string, any>;
    profile.platforms.x.approval = approval;
    await withJson(profile, async path => {
      await assert.rejects(loadCreator(path), /platforms.x.approval must be required, draft, or auto/);
    });
  }
});

test("missing or malformed platforms and credentials are rejected explicitly", async () => {
  for (const platforms of [undefined, null, [], { x: null }, { x: { enabled: true, approval: "auto" } }]) {
    await withJson({ ...validCreator, platforms }, async path => {
      await assert.rejects(loadCreator(path), /platforms|credentials/);
    });
  }
});

test("unknown release target is rejected instead of silently ignored", async () => {
  await withJson({ id: "r1", title: "Release", contentType: "video", targets: { xtwitter: {} } }, async path => {
    await assert.rejects(loadRelease(path), /Unknown release target platform: xtwitter/);
  });
});


test("creator rejects unknown secondaryTypes instead of silently accepting typos", async () => {
  await withJson({ ...validCreator, secondaryTypes: ["maker_engineer", "nonsense-archetype"] }, async path => {
    await assert.rejects(loadCreator(path), /Unknown secondary creator type: nonsense-archetype/);
  });
});

test("manifest loader enforces a bounded input size before JSON parsing", async () => {
  const previous = process.env.NEMOQWEN_MAX_MANIFEST_BYTES;
  process.env.NEMOQWEN_MAX_MANIFEST_BYTES = "64";
  try {
    await withJson({
      id: "release-large", title: "Large", contentType: "text",
      text: "x".repeat(256)
    }, async path => {
      await assert.rejects(loadRelease(path), /limit is 64/);
    });
  } finally {
    if (previous === undefined) delete process.env.NEMOQWEN_MAX_MANIFEST_BYTES;
    else process.env.NEMOQWEN_MAX_MANIFEST_BYTES = previous;
  }
});


test("malformed assets and tags are rejected before plan/publish can crash", async () => {
  for (const assets of [{}, [null], [{ id: "a", kind: "video", platforms: ["not-a-platform"] }]]) {
    await withJson({
      id: "r-assets", title: "Malformed", contentType: "video", assets
    }, async path => {
      await assert.rejects(loadRelease(path), /assets/);
    });
  }
  await withJson({
    id: "r-tags", title: "Malformed Tags", contentType: "text", tags: ["ok", 7]
  }, async path => {
    await assert.rejects(loadRelease(path), /tags/);
  });
});
