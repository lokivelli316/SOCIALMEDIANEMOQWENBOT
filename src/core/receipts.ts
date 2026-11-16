import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Receipt } from "../types.js";

export class ReceiptStore {
  constructor(private readonly path = ".nemoqwen/receipts.jsonl") {}

  async append(receipt: Receipt): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify(receipt) + "\n", "utf8");
  }
}
