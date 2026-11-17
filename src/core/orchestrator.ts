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
import { HoldError } from "../platforms/common.js";
import { publishAuthority } from "./policy.js";
import { ReceiptStore } from "./receipts.js";

export class NemoQwenOrchestrator {
  constructor(private readonly receipts = new ReceiptStore()) {}

  plan(creator: CreatorProfile, release: ReleaseManifest, platform?: Platform): PublishPlan[] {
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
    const authority = publishAuthority(creator, platform, explicitApproval);
    if (!authority.allowed) {
      const result: PublishResult = { platform, status: "hold", detail: authority.reason };
      await this.receipt(creator, release, platform, result);
      return result;
    }

    const prior = await this.receipts.latestActionablePublish(creator.id, release.id, platform);
    if (prior && !forceRetry) {
      const result: PublishResult = {
        platform,
        status: "hold",
        externalId: prior.result.externalId,
        detail: `Duplicate protection: an earlier publish attempt for this creator/release/platform ended as ${prior.result.status}. Inspect platform state and receipts before retrying; --retry is the explicit override.`
      };
      await this.receipt(creator, release, platform, result);
      return result;
    }

    let result: PublishResult;
    try {
      result = await adapters[platform].publish(creator, release);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      result = {
        platform,
        status: error instanceof HoldError ? "hold" : "failed",
        detail
      };
    }
    await this.receipt(creator, release, platform, result);
    return result;
  }

  async inspect(creator: CreatorProfile, platform: Platform, externalId: string): Promise<ChannelSnapshot> {
    const adapter = adapters[platform];
    if (!adapter.inspect) throw new HoldError(`${platform} readback is not implemented yet`);
    return adapter.inspect(creator, externalId);
  }

  private async receipt(
    creator: CreatorProfile,
    release: ReleaseManifest,
    platform: Platform,
    result: PublishResult
  ): Promise<void> {
    const receipt: Receipt = {
      at: new Date().toISOString(),
      creatorId: creator.id,
      releaseId: release.id,
      platform,
      action: "publish",
      operationKey: `${creator.id}:${release.id}:${platform}`,
      result
    };
    await this.receipts.append(receipt);
  }
}
