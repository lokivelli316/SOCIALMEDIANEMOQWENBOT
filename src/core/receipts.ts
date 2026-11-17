import { createHash } from "node:crypto";
import { open, mkdir, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Platform, PublishResult, Receipt, ReceiptResult } from "../types.js";
import { boundedRedactedDetail } from "./redaction.js";

export function defaultReceiptPath(): string {
  return process.env.NEMOQWEN_RECEIPTS ?? fileURLToPath(new URL("../../.nemoqwen/receipts.jsonl", import.meta.url));
}

export class ReceiptCorruptionError extends Error {
  readonly name = "ReceiptCorruptionError";
}

export class OperationLockedError extends Error {
  readonly name = "OperationLockedError";
  constructor(message: string, readonly lockPath: string) {
    super(message);
  }
}

export interface ReceiptVerification {
  valid: boolean;
  ledgerPresent: boolean;
  records: number;
  legacyRecords: number;
  chainedRecords: number;
  headPresent: boolean;
  error?: string;
}

function safeResult(result: ReceiptResult): ReceiptResult {
  const { raw: _raw, ...safe } = result as ReceiptResult & { raw?: unknown };
  if ("detail" in safe && typeof safe.detail === "string") {
    return { ...safe, detail: boundedRedactedDetail(safe.detail) } as ReceiptResult;
  }
  return safe as ReceiptResult;
}

function payloadForHash(receipt: Receipt): Omit<Receipt, "receiptHash"> {
  const { receiptHash: _hash, ...payload } = receipt;
  return payload;
}

function hashReceipt(receipt: Receipt): string {
  return createHash("sha256").update(JSON.stringify(payloadForHash(receipt))).digest("hex");
}

function parseLinesStrict(text: string): { records: Receipt[]; physicalLines: number[] } {
  if (text && !text.endsWith("\n")) {
    throw new ReceiptCorruptionError("Receipt ledger has a non-newline-terminated tail; repair/quarantine is required before append or publish");
  }
  const records: Receipt[] = [];
  const physicalLines: number[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    let value: Receipt;
    try {
      value = JSON.parse(line) as Receipt;
    } catch {
      throw new ReceiptCorruptionError(`Invalid JSON at receipt line ${index + 1}; repair/quarantine is required`);
    }
    if (!value || typeof value !== "object") {
      throw new ReceiptCorruptionError(`Invalid receipt object at line ${index + 1}`);
    }
    records.push(value);
    physicalLines.push(index + 1);
  }
  return { records, physicalLines };
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function syncDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Some Windows/filesystem combinations do not permit directory fsync.
    if (code !== "EINVAL" && code !== "EPERM" && code !== "ENOTSUP" && code !== "EISDIR") throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export class ReceiptStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path = defaultReceiptPath()) {}

  stateDirectory(): string {
    return dirname(this.path);
  }

  private appendLockPath(): string {
    return `${this.path}.append.lock`;
  }

  private headPath(): string {
    return `${this.path}.head.json`;
  }

  private async acquireAppendLock(): Promise<() => Promise<void>> {
    const lockPath = this.appendLockPath();
    await mkdir(dirname(lockPath), { recursive: true });
    const deadline = Date.now() + 5_000;
    while (true) {
      try {
        const handle = await open(lockPath, "wx");
        try {
          await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }) + "\n", "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        return async () => {
          try { await unlink(lockPath); } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) {
          throw new OperationLockedError(
            `Receipt append lock remains present at ${lockPath}; refusing to write until the owning process is reconciled`,
            lockPath
          );
        }
        await sleep(25);
      }
    }
  }

  async acquireOperationLock(operationKey: string): Promise<() => Promise<void>> {
    const lockDir = join(this.stateDirectory(), "operation-locks");
    await mkdir(lockDir, { recursive: true });
    const digest = createHash("sha256").update(operationKey).digest("hex");
    const lockPath = join(lockDir, `${digest}.lock`);
    let handle;
    try {
      handle = await open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new OperationLockedError(
          `Publish operation is already locked at ${lockPath}; reconcile the existing attempt before retrying`,
          lockPath
        );
      }
      throw error;
    }
    try {
      await handle.writeFile(JSON.stringify({
        pid: process.pid,
        at: new Date().toISOString(),
        operationKey
      }) + "\n", "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return async () => {
      try { await unlink(lockPath); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    };
  }

  async append(receipt: Receipt): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const releaseLock = await this.acquireAppendLock();
      try {
        await this.appendSerialized(receipt);
      } finally {
        await releaseLock();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async appendSerialized(receipt: Receipt): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const state = await this.readTextState();
    const existing = state.text;
    const parsed = parseLinesStrict(existing);
    const previous = [...parsed.records].reverse().find(item => typeof item.receiptHash === "string");
    const record: Receipt = {
      ...receipt,
      result: safeResult(receipt.result),
      previousReceiptHash: previous?.receiptHash ?? null
    };
    record.receiptHash = hashReceipt(record);
    const handle = await open(this.path, "a");
    try {
      await handle.writeFile(JSON.stringify(record) + "\n", "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    const head = {
      records: parsed.records.length + 1,
      receiptHash: record.receiptHash,
      at: new Date().toISOString()
    };
    const headHandle = await open(this.headPath(), "w");
    try {
      await headHandle.writeFile(JSON.stringify(head) + "\n", "utf8");
      await headHandle.sync();
    } finally {
      await headHandle.close();
    }
    if (!state.present) await syncDirectory(dirname(this.path));
  }

  async latestActionablePublish(
    creatorId: string,
    releaseId: string,
    platform: Platform,
    operationKey?: string
  ): Promise<(Receipt & { result: PublishResult }) | undefined> {
    await this.writeQueue;
    const { records } = parseLinesStrict((await this.readTextState()).text);
    const resolvedSafeAttempts = new Set<string>();

    for (let index = records.length - 1; index >= 0; index--) {
      const item = records[index];
      if (!item) continue;
      if (item.creatorId !== creatorId || item.releaseId !== releaseId ||
          item.platform !== platform || item.action !== "publish") continue;

      // New operation keys are collision-resistant and destination/content aware.
      // Legacy keys remain conservative: they still block rather than being silently ignored.
      if (operationKey && item.operationKey?.startsWith("op:") && item.operationKey !== operationKey) continue;

      const result = item.result as PublishResult;
      if (item.phase === "final" && item.attemptId &&
          (result.status === "hold" || result.status === "planned")) {
        resolvedSafeAttempts.add(item.attemptId);
        continue;
      }
      if (item.phase === "intent" && item.attemptId && resolvedSafeAttempts.has(item.attemptId)) continue;
      if (result.status === "hold" || result.status === "planned") continue;
      return item as Receipt & { result: PublishResult };
    }
    return undefined;
  }

  async verifyChain(): Promise<ReceiptVerification> {
    await this.writeQueue;
    const state = await this.readTextState();
    if (!state.present) {
      return {
        valid: false, ledgerPresent: false, records: 0,
        legacyRecords: 0, chainedRecords: 0, headPresent: false,
        error: "Receipt ledger does not exist"
      };
    }

    let parsed: { records: Receipt[]; physicalLines: number[] };
    try {
      parsed = parseLinesStrict(state.text);
    } catch (error) {
      return {
        valid: false, ledgerPresent: true, records: 0,
        legacyRecords: 0, chainedRecords: 0, headPresent: await this.hasHead(),
        error: error instanceof Error ? error.message : String(error)
      };
    }

    let legacyRecords = 0;
    let chainedRecords = 0;
    let previousHash: string | null = null;
    let sawChained = false;

    for (const [index, item] of parsed.records.entries()) {
      const physicalLine = parsed.physicalLines[index]!;
      if (!item.receiptHash) {
        if (sawChained) {
          return {
            valid: false, ledgerPresent: true, records: parsed.records.length,
            legacyRecords, chainedRecords, headPresent: await this.hasHead(),
            error: `Unhashed/legacy receipt appears after chained history at line ${physicalLine}`
          };
        }
        legacyRecords++;
        previousHash = null;
        continue;
      }
      sawChained = true;
      if ((item.previousReceiptHash ?? null) !== previousHash) {
        return {
          valid: false, ledgerPresent: true, records: parsed.records.length,
          legacyRecords, chainedRecords, headPresent: await this.hasHead(),
          error: `Hash predecessor mismatch at receipt line ${physicalLine}`
        };
      }
      const expected = hashReceipt(item);
      if (item.receiptHash !== expected) {
        return {
          valid: false, ledgerPresent: true, records: parsed.records.length,
          legacyRecords, chainedRecords, headPresent: await this.hasHead(),
          error: `Receipt hash mismatch at line ${physicalLine}`
        };
      }
      previousHash = item.receiptHash;
      chainedRecords++;
    }

    const head = await this.readHead();
    if (head) {
      if (head.records !== parsed.records.length || head.receiptHash !== previousHash) {
        return {
          valid: false, ledgerPresent: true, records: parsed.records.length,
          legacyRecords, chainedRecords, headPresent: true,
          error: "Receipt head anchor does not match ledger count/hash; truncation or incomplete update is possible"
        };
      }
    }

    return {
      valid: true,
      ledgerPresent: true,
      records: parsed.records.length,
      legacyRecords,
      chainedRecords,
      headPresent: Boolean(head)
    };
  }

  private async hasHead(): Promise<boolean> {
    return Boolean(await this.readHead());
  }

  private async readHead(): Promise<{ records: number; receiptHash: string | null } | undefined> {
    try {
      const value = JSON.parse(await readFile(this.headPath(), "utf8")) as { records?: unknown; receiptHash?: unknown };
      if (typeof value.records !== "number") return undefined;
      return {
        records: value.records,
        receiptHash: typeof value.receiptHash === "string" ? value.receiptHash : null
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      return undefined;
    }
  }

  private async readTextState(): Promise<{ text: string; present: boolean }> {
    try {
      return { text: await readFile(this.path, "utf8"), present: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { text: "", present: false };
      throw error;
    }
  }
}
