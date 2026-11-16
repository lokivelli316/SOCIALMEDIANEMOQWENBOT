import type {
  ChannelSnapshot,
  CreatorProfile,
  Platform,
  PublishPlan,
  PublishResult,
  ReleaseManifest
} from "../types.js";

export interface PlatformAdapter {
  readonly platform: Platform;
  plan(creator: CreatorProfile, release: ReleaseManifest): PublishPlan;
  publish(creator: CreatorProfile, release: ReleaseManifest): Promise<PublishResult>;
  inspect?(creator: CreatorProfile, externalId: string): Promise<ChannelSnapshot>;
}
