import { createHash } from "node:crypto";
import { open, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Platform, PublishResult, Receipt, ReceiptResult } from "../types.js";
import { redactSecretText } from "./redaction.js";

export function defaultReceiptPath(): string {
  return process.env.NEMOQWEN_RECEIPTS ?? fileURLToPath(new URL("../../.nemoqwen/receipts.jsonl", import.meta.url));
}

export interface ReceiptVerification {
  valid: boolean;
  legacyRecords: number;
  chainedRecords: number;
  error?: string;
}

function safeResult(result: ReceiptResult): ReceiptResult {
  const { raw: _raw, ...safe } = result as ReceiptResult & { raw?: unknown };
  if ("detail" in safe && typeof safe.detail === "string") {
    return { ...safe, detail: redactSecretText(safe.detail) } as ReceiptResult;
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

function parseLines(text: string): Receipt[] {
  const records: Receipt[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as Receipt;
      if (value && typeof value === "object") records.push(value);
    } catch {
      // Corrupt history must never be silently treated as verified. Verification reports it.
    }
  }
  return records;
}

export class ReceiptStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path = defaultReceiptPath()) {}

  async append(receipt: Receipt): Promise<void> {
    const operation = this.writeQueue.then(() => this.appendSerialized(receipt));
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async appendSerialized(receipt: Receipt): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const existing = await this.readText();
    const previous = [...parseLines(existing)].reverse().find(item => typeof item.receiptHash === "string");
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
  }

  async latestActionablePublish(
    creatorId: string,
    releaseId: string,
    platform: Platform
  ): Promise<(Receipt & { result: PublishResult }) | undefined> {
    await this.writeQueue;
    const records = parseLines(await this.readText());
    for (let index = records.length - 1; index >= 0; index--) {
      const item = records[index];
      if (!item) continue;
      if (item.creatorId !== creatorId || item.releaseId !== releaseId ||
          item.platform !== platform || item.action !== "publish") continue;
      const result = item.result as PublishResult;
      if (result.status === "hold" || result.status === "planned") continue;
      return item as Receipt & { result: PublishResult };
    }
    return undefined;
  }

  async verifyChain(): Promise<ReceiptVerification> {
    await this.writeQueue;
    const text = await this.readText();
    let legacyRecords = 0;
    let chainedRecords = 0;
    let previousHash: string | null = null;
    for (const [index, line] of text.split("\n").entries()) {
      const physicalLine = index + 1;
      if (!line.trim()) continue;
      let item: Receipt;
      try {
        item = JSON.parse(line) as Receipt;
      } catch {
        return { valid: false, legacyRecords, chainedRecords, error: `Invalid JSON at receipt line ${physicalLine}` };
      }
      if (!item.receiptHash) {
        legacyRecords++;
        previousHash = null;
        continue;
      }
      if ((item.previousReceiptHash ?? null) !== previousHash) {
        return {
          valid: false, legacyRecords, chainedRecords,
          error: `Hash predecessor mismatch at receipt line ${physicalLine}`
        };
      }
      const expected = hashReceipt(item);
      if (item.receiptHash !== expected) {
        return {
          valid: false, legacyRecords, chainedRecords,
          error: `Receipt hash mismatch at line ${physicalLine}`
        };
      }
      previousHash = item.receiptHash;
      chainedRecords++;
    }
    return { valid: true, legacyRecords, chainedRecords };
  }

  private async readText(): Promise<string> {
    try {
      return await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }
}
