import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NemoQwenOrchestrator } from "../src/core/orchestrator.js";
import { ReceiptStore, defaultReceiptPath } from "../src/core/receipts.js";
import { adapters } from "../src/platforms/index.js";
import type { CreatorProfile, PublishResult, Receipt, ReleaseManifest } from "../src/types.js";

async function tempReceiptStore(): Promise<{ dir: string; path: string; store: ReceiptStore }> {
  const dir = await mkdtemp(join(tmpdir(), "nemoqwen-receipts-"));
  const path = join(dir, "receipts.jsonl");
  return { dir, path, store: new ReceiptStore(path) };
}

const creator: CreatorProfile = {
  id: "creator-a",
  displayName: "Creator A",
  primaryType: "custom",
  platforms: { x: { enabled: true, approval: "auto", credentials: {} } }
};

const release: ReleaseManifest = { id: "release-a", title: "Release A", contentType: "text" };

function receipt(status: PublishResult["status"]): Receipt {
  return {
    at: "2026-11-17T00:00:00.000Z",
    creatorId: creator.id,
    releaseId: release.id,
    platform: "x",
    action: "publish",
    operationKey: "creator-a:release-a:x",
    result: {
      platform: "x",
      status,
      externalId: "remote-1",
      raw: { access_token: "do-not-persist", nested: { secret: "nope" } }
    }
  };
}

test("receipt persistence strips raw API payloads, fsync path remains readable and hash chain verifies", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  await fixture.store.append(receipt("submitted"));
  await fixture.store.append({
    ...receipt("published"),
    at: "2026-11-17T00:01:00.000Z",
    result: { platform: "x", status: "published", externalId: "remote-1", raw: { token: "still-no" } }
  });
  const text = await readFile(fixture.path, "utf8");
  assert.doesNotMatch(text, /do-not-persist|still-no|access_token|"raw"/);
  const rows = text.trim().split("\n").map(line => JSON.parse(line));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].previousReceiptHash, null);
  assert.equal(rows[1].previousReceiptHash, rows[0].receiptHash);
  assert.equal((await fixture.store.verifyChain()).valid, true);
});

test("receipt chain reports tampering rather than treating it as verified", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  await fixture.store.append(receipt("published"));
  const row = JSON.parse((await readFile(fixture.path, "utf8")).trim());
  row.result.externalId = "tampered";
  await writeFile(fixture.path, JSON.stringify(row) + "\n", "utf8");
  const verification = await fixture.store.verifyChain();
  assert.equal(verification.valid, false);
  assert.match(verification.error ?? "", /hash mismatch/i);
});

test("legacy unhashed receipts remain readable but are explicitly counted as legacy", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  await writeFile(fixture.path, JSON.stringify(receipt("failed")) + "\n", "utf8");
  await fixture.store.append({ ...receipt("published"), at: "2026-11-17T00:02:00.000Z" });
  const verification = await fixture.store.verifyChain();
  assert.equal(verification.valid, true);
  assert.equal(verification.legacyRecords, 1);
  assert.equal(verification.chainedRecords, 1);
});

test("orchestrator holds a repeated actionable publish before touching the platform adapter", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  await fixture.store.append(receipt("submitted"));

  const original = adapters.x.publish;
  let adapterCalls = 0;
  adapters.x.publish = async () => {
    adapterCalls++;
    return { platform: "x", status: "published", externalId: "new-remote" };
  };
  t.after(() => { adapters.x.publish = original; });

  const result = await new NemoQwenOrchestrator(fixture.store).publish(creator, release, "x");
  assert.equal(result.status, "hold");
  assert.equal(result.externalId, "remote-1");
  assert.match(result.detail ?? "", /Duplicate protection/);
  assert.equal(adapterCalls, 0);
});

test("explicit retry is the only duplicate-protection override and is receipted", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  await fixture.store.append(receipt("failed"));

  const original = adapters.x.publish;
  let adapterCalls = 0;
  adapters.x.publish = async () => {
    adapterCalls++;
    return { platform: "x", status: "published", externalId: "retry-remote" };
  };
  t.after(() => { adapters.x.publish = original; });

  const result = await new NemoQwenOrchestrator(fixture.store).publish(creator, release, "x", false, true);
  assert.equal(result.status, "published");
  assert.equal(result.externalId, "retry-remote");
  assert.equal(adapterCalls, 1);
  const persisted = await readFile(fixture.path, "utf8");
  assert.match(persisted, /retry-remote/);
});


test("receipt detail is scrubbed even when an API error echoes a secret", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  await fixture.store.append({
    ...receipt("failed"),
    result: {
      platform: "x",
      status: "failed",
      detail: "HTTP 400: access_token=super-secret-marker-123456 Bearer abcdefghijklmnop"
    }
  });
  const persisted = await readFile(fixture.path, "utf8");
  assert.doesNotMatch(persisted, /super-secret-marker|abcdefghijklmnop/);
  assert.match(persisted, /REDACTED/);
});

test("same-operation concurrent publishes are single-flight in one orchestrator", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  const original = adapters.x.publish;
  let calls = 0;
  let releaseAdapter!: () => void;
  let markStarted!: () => void;
  const gate = new Promise<void>(resolve => { releaseAdapter = resolve; });
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  adapters.x.publish = async () => {
    calls++;
    markStarted();
    await gate;
    return { platform: "x", status: "published", externalId: "only-one" };
  };
  t.after(() => { adapters.x.publish = original; });

  const orchestrator = new NemoQwenOrchestrator(fixture.store);
  const first = orchestrator.publish(creator, release, "x");
  const second = orchestrator.publish(creator, release, "x");
  await started;
  assert.equal(calls, 1);
  releaseAdapter();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.externalId, "only-one");
  assert.equal(b.externalId, "only-one");
  assert.equal(calls, 1);
});

test("inspect readback writes a durable receipt while stripping raw response bodies", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  const original = adapters.x.inspect;
  adapters.x.inspect = async (_creator, externalId) => ({
    platform: "x",
    externalId,
    metrics: { like_count: 7 },
    raw: { access_token: "must-not-persist" }
  });
  t.after(() => { adapters.x.inspect = original; });
  const snapshot = await new NemoQwenOrchestrator(fixture.store).inspect(creator, "x", "tweet-7");
  assert.equal(snapshot.metrics.like_count, 7);
  const row = JSON.parse((await readFile(fixture.path, "utf8")).trim());
  assert.equal(row.action, "inspect");
  assert.equal(row.externalId, "tweet-7");
  assert.equal(row.result.metrics.like_count, 7);
  assert.equal(row.result.raw, undefined);
  assert.doesNotMatch(JSON.stringify(row), /must-not-persist/);
});

test("receipt verification reports physical line number when blank lines precede corruption", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  await fixture.store.append(receipt("published"));
  const first = (await readFile(fixture.path, "utf8")).trim();
  await writeFile(fixture.path, "\n\n" + first + "\n{broken\n", "utf8");
  const verification = await fixture.store.verifyChain();
  assert.equal(verification.valid, false);
  assert.match(verification.error ?? "", /line 4/);
});


test("default receipt path is independent of process working directory", async () => {
  const original = process.cwd();
  const first = defaultReceiptPath();
  const dir = await mkdtemp(join(tmpdir(), "nemoqwen-cwd-"));
  try {
    process.chdir(dir);
    const second = defaultReceiptPath();
    assert.equal(second, first);
    assert.match(second, /\.nemoqwen[\\/]receipts\.jsonl$/);
  } finally {
    process.chdir(original);
    await rm(dir, { recursive: true, force: true });
  }
});
