import { randomUUID } from "node:crypto";
import type {
  ChannelSnapshot,
  CreatorProfile,
  Platform,
  PublishPlan,
  PublishResult,
  Receipt,
  ReleaseManifest
} from "../types.js";
import { adapters } from "../platforms/index.js";
import { AmbiguousOutcomeError, HoldError } from "../platforms/common.js";
import { operationKeyFor } from "./operation.js";
import { publishAuthority } from "./policy.js";
import { OperationLockedError, ReceiptStore } from "./receipts.js";

export class NemoQwenOrchestrator {
  private readonly inFlight = new Map<string, Promise<PublishResult>>();

  constructor(private readonly receipts = new ReceiptStore()) {}

  plan(creator: CreatorProfile, release: ReleaseManifest, platform?: Platform): PublishPlan[] {
    if (platform && !creator.platforms[platform]?.enabled) return [];
    const platforms = platform
      ? [platform]
      : (Object.keys(creator.platforms) as Platform[]).filter(p => creator.platforms[p]?.enabled);
    return platforms.map(p => adapters[p].plan(creator, release));
  }

  async publish(
    creator: CreatorProfile,
    release: ReleaseManifest,
    platform: Platform,
    explicitApproval = false,
    forceRetry = false
  ): Promise<PublishResult> {
    const operationKey = operationKeyFor(creator.id, release, platform);
    const existing = this.inFlight.get(operationKey);
    if (existing) return existing;

    const operation = this.publishOnce(
      creator, release, platform, operationKey, explicitApproval, forceRetry
    );
    this.inFlight.set(operationKey, operation);
    try {
      return await operation;
    } finally {
      if (this.inFlight.get(operationKey) === operation) this.inFlight.delete(operationKey);
    }
  }

  private async publishOnce(
    creator: CreatorProfile,
    release: ReleaseManifest,
    platform: Platform,
    operationKey: string,
    explicitApproval: boolean,
    forceRetry: boolean
  ): Promise<PublishResult> {
    const authority = publishAuthority(creator, platform, explicitApproval);
    if (!authority.allowed) {
      const result: PublishResult = { platform, status: "hold", detail: authority.reason };
      await this.receipt(creator, release, platform, operationKey, result);
      return result;
    }

    let releaseOperationLock: (() => Promise<void>) | undefined;
    try {
      releaseOperationLock = await this.receipts.acquireOperationLock(operationKey);
    } catch (error) {
      if (!(error instanceof OperationLockedError)) throw error;
      const result: PublishResult = { platform, status: "hold", detail: error.message };
      await this.receipt(creator, release, platform, operationKey, result);
      return result;
    }

    let mayReleaseLock = true;
    try {
      const prior = await this.receipts.latestActionablePublish(
        creator.id, release.id, platform, operationKey
      );
      if (prior && !forceRetry) {
        const result: PublishResult = {
          platform,
          status: "hold",
          externalId: prior.result.externalId,
          detail: `Duplicate protection: an earlier publish attempt for this operation ended as ${prior.result.status}. Inspect platform state and receipts before retrying; --retry is the explicit override.`
        };
        await this.receipt(creator, release, platform, operationKey, result);
        return result;
      }

      const attemptId = randomUUID();
      const intent: PublishResult = {
        platform,
        status: "verifying",
        detail: "Publish intent recorded and fsynced before adapter execution; a missing final record requires reconciliation before retry."
      };
      await this.receipt(
        creator, release, platform, operationKey, intent, attemptId, "intent"
      );

      // From this point forward, failure to persist the final receipt must leave the
      // operation lock behind. The remote adapter may already have mutated state.
      mayReleaseLock = false;

      let result: PublishResult;
      try {
        result = await adapters[platform].publish(creator, release);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        result = {
          platform,
          status: error instanceof AmbiguousOutcomeError
            ? "verifying"
            : error instanceof HoldError ? "hold" : "failed",
          detail
        };
      }

      await this.receipt(
        creator, release, platform, operationKey, result, attemptId, "final"
      );
      mayReleaseLock = true;
      return result;
    } finally {
      if (mayReleaseLock && releaseOperationLock) await releaseOperationLock();
    }
  }

  async inspect(creator: CreatorProfile, platform: Platform, externalId: string): Promise<ChannelSnapshot> {
    const adapter = adapters[platform];
    if (!adapter.inspect) throw new HoldError(`${platform} readback is not implemented yet`);
    const snapshot = await adapter.inspect(creator, externalId);
    const receipt: Receipt = {
      at: new Date().toISOString(),
      creatorId: creator.id,
      externalId,
      platform,
      action: "inspect",
      result: snapshot
    };
    await this.receipts.append(receipt);
    return snapshot;
  }

  private async receipt(
    creator: CreatorProfile,
    release: ReleaseManifest,
    platform: Platform,
    operationKey: string,
    result: PublishResult,
    attemptId?: string,
    phase?: "intent" | "final"
  ): Promise<void> {
    const receipt: Receipt = {
      at: new Date().toISOString(),
      creatorId: creator.id,
      releaseId: release.id,
      platform,
      action: "publish",
      operationKey,
      attemptId,
      phase,
      result
    };
    await this.receipts.append(receipt);
  }
}
