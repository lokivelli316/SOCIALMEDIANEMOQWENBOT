import type { CreatorProfile, Platform, PublishPlan, PublishResult, ReleaseManifest } from "../types.js";

export interface PlatformAdapter {
  readonly platform: Platform;
  plan(creator: CreatorProfile, release: ReleaseManifest): PublishPlan;
  publish(creator: CreatorProfile, release: ReleaseManifest): Promise<PublishResult>;
}
