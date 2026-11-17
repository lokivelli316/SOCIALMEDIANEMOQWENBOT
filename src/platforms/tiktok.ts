import type { ChannelSnapshot, CreatorProfile, PublishPlan, PublishResult, ReleaseManifest } from "../types.js";
import type { PlatformAdapter } from "./adapter.js";
import { requireAuthorizedPublish } from "../core/publish-context.js";
import { HoldError, boolValue, credential, defaultString, fetchWithTimeout, readJsonResponse, selectedAssets, stringValue, target } from "./common.js";

const BASE = "https://open.tiktokapis.com";

export class TikTokAdapter implements PlatformAdapter {
  readonly platform = "tiktok" as const;

  plan(creator: CreatorProfile, release: ReleaseManifest): PublishPlan {
    const t = target(release, this.platform);
    const videoUrl = stringValue(t.videoUrl) ?? selectedAssets(release, this.platform).find(a => a.kind === "video")?.url;
    return {
      platform: this.platform,
      creatorId: creator.id,
      releaseId: release.id,
      summary: `Direct-post TikTok video "${release.title}" from verified URL`,
      requiresApproval: creator.platforms.tiktok?.approval === "required",
      warnings: videoUrl ? [] : ["TikTok PULL_FROM_URL requires targets.tiktok.videoUrl or a video asset URL on a verified domain"]
    };
  }

  async publish(creator: CreatorProfile, release: ReleaseManifest): Promise<PublishResult> {
    requireAuthorizedPublish();
    const accessToken = credential(creator, this.platform, "accessToken");
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8"
    };

    const creatorInfo = await readJsonResponse(await fetchWithTimeout(`${BASE}/v2/post/publish/creator_info/query/`, {
      method: "POST",
      headers
    }, undefined, false));

    const t = target(release, this.platform);
    const privacyLevel = stringValue(t.privacyLevel)
      ?? defaultString(creator, this.platform, "privacyLevel")
      ?? "SELF_ONLY";
    const creatorInfoError = creatorInfo.error?.code;
    if (creatorInfoError && creatorInfoError !== "ok") {
      throw new HoldError(`TikTok creator-info preflight rejected: ${JSON.stringify(creatorInfo.error)}`);
    }
    const options = creatorInfo.data?.privacy_level_options;
    if (!Array.isArray(options)) {
      throw new HoldError("TikTok creator-info preflight did not return privacy_level_options; publishing held");
    }
    if (!options.includes(privacyLevel)) {
      throw new Error(`TikTok privacy level ${privacyLevel} is not available for this creator: ${options.join(", ")}`);
    }

    const videoUrl = stringValue(t.videoUrl) ?? selectedAssets(release, this.platform).find(a => a.kind === "video")?.url;
    if (!videoUrl) throw new Error("TikTok direct post requires a hosted video URL on a verified domain/prefix");

    const payload = {
      post_info: {
        title: release.text ?? release.description ?? release.title,
        privacy_level: privacyLevel,
        disable_duet: boolValue(t.disableDuet) ?? false,
        disable_comment: boolValue(t.disableComment) ?? false,
        disable_stitch: boolValue(t.disableStitch) ?? false,
        video_cover_timestamp_ms: typeof t.videoCoverTimestampMs === "number" ? t.videoCoverTimestampMs : 1000
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl
      }
    };

    const body = await readJsonResponse(await fetchWithTimeout(`${BASE}/v2/post/publish/video/init/`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }));

    const errorCode = body.error?.code;
    if (errorCode && errorCode !== "ok") throw new Error(`TikTok publish rejected: ${JSON.stringify(body.error)}`);
    const id = String(body.data?.publish_id ?? "");
    if (!id) throw new HoldError("TikTok publish job acknowledgement contained no publish_id; operation requires reconciliation before retry");
    return {
      platform: this.platform,
      status: "submitted",
      externalId: id,
      detail: "TikTok accepted the publish job; final post availability is asynchronous and must be verified separately.",
      raw: body as any
    };
  }
  async inspect(creator: CreatorProfile, externalId: string): Promise<ChannelSnapshot> {
    const accessToken = credential(creator, this.platform, "accessToken");
    const body = await readJsonResponse(await fetchWithTimeout(`${BASE}/v2/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({ publish_id: externalId })
    }, undefined, false));
    const errorCode = body.error?.code;
    if (errorCode && errorCode !== "ok") {
      throw new HoldError(`TikTok status readback rejected: ${JSON.stringify(body.error)}`);
    }
    const data = body.data ?? {};
    return {
      platform: this.platform,
      externalId,
      metrics: {
        status: typeof data.status === "string" ? data.status : null,
        fail_reason: typeof data.fail_reason === "string" ? data.fail_reason : null,
        uploaded_bytes: typeof data.uploaded_bytes === "number" ? data.uploaded_bytes : null,
        publicaly_available_post_id: Array.isArray(data.publicaly_available_post_id)
          ? data.publicaly_available_post_id.map((value: unknown) => String(value))
          : []
      },
      raw: body as any
    };
  }
}
