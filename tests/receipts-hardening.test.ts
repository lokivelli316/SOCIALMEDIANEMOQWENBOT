import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NemoQwenOrchestrator } from "../src/core/orchestrator.js";
import { OperationLockedError, ReceiptCorruptionError, ReceiptStore, defaultReceiptPath } from "../src/core/receipts.js";
import { adapters } from "../src/platforms/index.js";
import { AmbiguousOutcomeError } from "../src/platforms/common.js";
import { operationKeyFor } from "../src/core/operation.js";
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


test("ambiguous mutation outcome is verifying and blocks blind retry without --retry", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  const original = adapters.x.publish;
  let calls = 0;
  adapters.x.publish = async () => {
    calls++;
    if (calls === 1) throw new AmbiguousOutcomeError("fixture ambiguous mutation");
    return { platform: "x", status: "published", externalId: "duplicate-remote" };
  };
  t.after(() => { adapters.x.publish = original; });

  const orchestrator = new NemoQwenOrchestrator(fixture.store);
  const first = await orchestrator.publish(creator, release, "x");
  assert.equal(first.status, "verifying");
  const second = await orchestrator.publish(creator, release, "x");
  assert.equal(second.status, "hold");
  assert.match(second.detail ?? "", /Duplicate protection/);
  assert.equal(calls, 1);
});

test("publish intent is fsynced before adapter execution completes", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  const original = adapters.x.publish;
  let started!: () => void;
  let finish!: () => void;
  const didStart = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { finish = resolve; });
  adapters.x.publish = async () => {
    started();
    await gate;
    return { platform: "x", status: "published", externalId: "remote-intent" };
  };
  t.after(() => { adapters.x.publish = original; });

  const pending = new NemoQwenOrchestrator(fixture.store).publish(creator, release, "x");
  await didStart;
  const rows = (await readFile(fixture.path, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].phase, "intent");
  assert.equal(rows[0].result.status, "verifying");
  assert.match(rows[0].result.detail, /intent recorded/i);
  finish();
  assert.equal((await pending).status, "published");
});

test("safe final HOLD supersedes its write-ahead intent and remains retryable", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  const original = adapters.x.publish;
  let calls = 0;
  adapters.x.publish = async () => {
    calls++;
    if (calls === 1) {
      const { HoldError } = await import("../src/platforms/common.js");
      throw new HoldError("safe preflight hold");
    }
    return { platform: "x", status: "published", externalId: "after-safe-hold" };
  };
  t.after(() => { adapters.x.publish = original; });

  const orchestrator = new NemoQwenOrchestrator(fixture.store);
  assert.equal((await orchestrator.publish(creator, release, "x")).status, "hold");
  assert.equal((await orchestrator.publish(creator, release, "x")).status, "published");
  assert.equal(calls, 2);
});

test("operation lock is exclusive across ReceiptStore instances and never auto-steals", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  const other = new ReceiptStore(fixture.path);
  const releaseFirst = await fixture.store.acquireOperationLock("op:fixture");
  await assert.rejects(other.acquireOperationLock("op:fixture"), OperationLockedError);
  await releaseFirst();
  const releaseSecond = await other.acquireOperationLock("op:fixture");
  await releaseSecond();
});

test("two ReceiptStore instances serialize concurrent appends without forking the chain", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  const other = new ReceiptStore(fixture.path);
  await Promise.all(Array.from({ length: 20 }, (_, i) => {
    const store = i % 2 === 0 ? fixture.store : other;
    return store.append({
      ...receipt("published"),
      at: new Date(Date.UTC(2026, 10, 17, 0, 0, i)).toISOString(),
      result: { platform: "x", status: "published", externalId: `remote-${i}` }
    });
  }));
  const verification = await fixture.store.verifyChain();
  assert.equal(verification.valid, true);
  assert.equal(verification.records, 20);
  assert.equal(verification.headPresent, true);
});

test("corrupt receipt history fails closed for lookup and append", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  await writeFile(fixture.path, "{broken\n", "utf8");
  await assert.rejects(
    fixture.store.latestActionablePublish(creator.id, release.id, "x"),
    ReceiptCorruptionError
  );
  await assert.rejects(fixture.store.append(receipt("published")), ReceiptCorruptionError);
});

test("head anchor detects tail truncation and legacy hash stripping after chained history", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  await fixture.store.append(receipt("published"));
  await fixture.store.append({ ...receipt("published"), at: "2026-11-17T00:05:00.000Z" });
  const lines = (await readFile(fixture.path, "utf8")).trim().split("\n");
  await writeFile(fixture.path, lines[0] + "\n", "utf8");
  const truncated = await fixture.store.verifyChain();
  assert.equal(truncated.valid, false);
  assert.match(truncated.error ?? "", /head anchor/);

  const fixture2 = await tempReceiptStore();
  t.after(() => rm(fixture2.dir, { recursive: true, force: true }));
  await fixture2.store.append(receipt("published"));
  await fixture2.store.append({ ...receipt("published"), at: "2026-11-17T00:06:00.000Z" });
  const rows = (await readFile(fixture2.path, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  delete rows[1].receiptHash;
  delete rows[1].previousReceiptHash;
  await writeFile(fixture2.path, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");
  const stripped = await fixture2.store.verifyChain();
  assert.equal(stripped.valid, false);
  assert.match(stripped.error ?? "", /legacy receipt appears after chained history/i);
});

test("missing receipt ledger is not reported as verified", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  const verification = await fixture.store.verifyChain();
  assert.equal(verification.valid, false);
  assert.equal(verification.ledgerPresent, false);
  assert.equal(verification.records, 0);
});

test("operation key is collision-resistant and destination/content aware", () => {
  const a = operationKeyFor("a:b", {
    id: "c", title: "One", contentType: "text",
    targets: { reddit: { subreddit: "A", kind: "self" } }
  }, "reddit");
  const b = operationKeyFor("a", {
    id: "b:c", title: "One", contentType: "text",
    targets: { reddit: { subreddit: "B", kind: "self" } }
  }, "reddit");
  assert.notEqual(a, b);

  const sameReleaseDifferentDestinationA = operationKeyFor("creator", {
    id: "release", title: "One", contentType: "text",
    targets: { reddit: { subreddit: "A", kind: "self" } }
  }, "reddit");
  const sameReleaseDifferentDestinationB = operationKeyFor("creator", {
    id: "release", title: "One", contentType: "text",
    targets: { reddit: { subreddit: "B", kind: "self" } }
  }, "reddit");
  assert.notEqual(sameReleaseDifferentDestinationA, sameReleaseDifferentDestinationB);
});

test("oversized error detail is redacted and bounded before persistence", async t => {
  const fixture = await tempReceiptStore();
  t.after(() => rm(fixture.dir, { recursive: true, force: true }));
  await fixture.store.append({
    ...receipt("failed"),
    result: {
      platform: "x",
      status: "failed",
      detail: "access_token=secret-marker-123456 " + "x".repeat(2_000_000)
    }
  });
  const persisted = await readFile(fixture.path, "utf8");
  assert.doesNotMatch(persisted, /secret-marker/);
  assert.match(persisted, /TRUNCATED sha256=/);
  assert.ok(persisted.length < 20_000);
});
