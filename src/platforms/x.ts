import type {
  Asset,
  AssetEvidence,
  ChannelSnapshot,
  CreatorProfile,
  PublishPlan,
  PublishResult,
  ReleaseManifest
} from "../types.js";
import type { PlatformAdapter } from "./adapter.js";
import { requireAuthorizedPublish } from "../core/publish-context.js";
import { AssetPolicyError, openTrustedAsset } from "../core/asset-policy.js";
import { HoldError, credential, fetchWithTimeout, readJsonResponse, selectedAssets, stringValue, target } from "./common.js";

const MEDIA_URL = "https://api.x.com/2/media/upload";
const POST_URL = "https://api.x.com/2/tweets";
const CHUNK_SIZE = 4 * 1024 * 1024;

function mediaCategory(asset: Asset): string {
  if (asset.kind === "video") return "tweet_video";
  if (asset.kind === "image" && asset.mimeType === "image/gif") return "tweet_gif";
  if (asset.kind === "image") return "tweet_image";
  throw new HoldError(`X local media supports image/GIF/video assets only; received ${asset.kind}`);
}

function validateComposition(assets: Asset[]): string | undefined {
  const videos = assets.filter(asset => asset.kind === "video").length;
  const gifs = assets.filter(asset => asset.kind === "image" && asset.mimeType === "image/gif").length;
  const images = assets.filter(asset => asset.kind === "image" && asset.mimeType !== "image/gif").length;
  const unsupported = assets.length - videos - gifs - images;

  if (unsupported) return "X local media supports only image/GIF/video assets";
  if (videos > 1) return "X supports at most one video per Post";
  if (gifs > 1) return "X supports at most one animated GIF per Post";
  if (videos && assets.length !== 1) return "X does not allow a video to be mixed with other media in one Post";
  if (gifs && assets.length !== 1) return "X does not allow an animated GIF to be mixed with other media in one Post";
  if (images > 4) return "X supports at most four photos per Post";
  return undefined;
}

async function uploadMedia(
  accessToken: string,
  release: ReleaseManifest,
  asset: Asset
): Promise<{ mediaId: string; evidence: AssetEvidence }> {
  if (!asset.path) throw new HoldError(`X local asset ${asset.id} has no path`);
  if (!asset.mimeType) {
    throw new HoldError(`X local asset ${asset.id} requires mimeType before upload; category must not be guessed`);
  }

  let trusted;
  try {
    trusted = await openTrustedAsset(release, asset.path);
  } catch (error) {
    if (error instanceof AssetPolicyError) throw new HoldError(error.message);
    throw error;
  }
  try {
    if (trusted.size === 0) throw new HoldError(`X media asset ${asset.id} is empty`);

    const init = await readJsonResponse(await fetchWithTimeout(`${MEDIA_URL}/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        media_type: asset.mimeType,
        total_bytes: trusted.size,
        media_category: mediaCategory(asset)
      })
    }));
    const mediaId = String(init.data?.id ?? "");
    if (!mediaId) throw new HoldError("X media initialize returned no media id; reconcile before retrying");

    let offset = 0;
    let segment = 0;
    while (offset < trusted.size) {
      const length = Math.min(CHUNK_SIZE, trusted.size - offset);
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await trusted.handle.read(buffer, 0, length, offset);
      if (bytesRead <= 0) throw new HoldError("Unexpected EOF during X media upload");

      const form = new FormData();
      form.set("segment_index", String(segment));
      form.set(
        "media",
        new Blob([new Uint8Array(buffer.subarray(0, bytesRead))], { type: asset.mimeType }),
        asset.id
      );

      const response = await fetchWithTimeout(
        `${MEDIA_URL}/${encodeURIComponent(mediaId)}/append`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form
        }
      );
      if (!response.ok) await readJsonResponse(response);
      offset += bytesRead;
      segment += 1;
    }

    let finalized = await readJsonResponse(await fetchWithTimeout(
      `${MEDIA_URL}/${encodeURIComponent(mediaId)}/finalize`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    ));

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const processing = finalized.data?.processing_info;
      if (!processing || processing.state === "succeeded") {
        return {
          mediaId,
          evidence: {
            id: asset.id,
            relativePath: trusted.relativePath,
            size: trusted.size,
            sha256: trusted.sha256
          }
        };
      }
      if (processing.state === "failed") {
        throw new Error(`X media processing failed: ${JSON.stringify(processing.error ?? processing)}`);
      }
      const waitMs = Math.max(1, Number(processing.check_after_secs ?? 1)) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      const statusUrl = new URL(MEDIA_URL);
      statusUrl.searchParams.set("command", "STATUS");
      statusUrl.searchParams.set("media_id", mediaId);
      finalized = await readJsonResponse(await fetchWithTimeout(statusUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      }));
    }
    throw new HoldError("X media processing did not finish within polling bound");
  } finally {
    await trusted.handle.close();
  }
}

export class XAdapter implements PlatformAdapter {
  readonly platform = "x" as const;

  plan(creator: CreatorProfile, release: ReleaseManifest): PublishPlan {
    const assets = selectedAssets(release, this.platform).filter(a => a.path);
    const t = target(release, this.platform);
    const replyTo = stringValue(t.replyToId);
    const quote = stringValue(t.quotePostId);
    const mode = replyTo ? "reply" : quote ? "quote post" : "post";
    const composition = validateComposition(assets);
    const warnings: string[] = [];
    if (composition) warnings.push(`${composition}; publication will be held until corrected`);
    for (const asset of assets) {
      if (!asset.mimeType) warnings.push(`X local asset ${asset.id} requires mimeType before upload`);
    }
    return {
      platform: this.platform,
      creatorId: creator.id,
      releaseId: release.id,
      summary: `Create X ${mode} "${release.title}" with ${assets.length} local media asset(s)`,
      requiresApproval: creator.platforms.x?.approval === "required",
      warnings
    };
  }

  async publish(creator: CreatorProfile, release: ReleaseManifest): Promise<PublishResult> {
    requireAuthorizedPublish();
    const accessToken = credential(creator, this.platform, "accessToken");
    const t = target(release, this.platform);
    const assets = selectedAssets(release, this.platform).filter(a => a.path);
    const composition = validateComposition(assets);
    if (composition) throw new HoldError(composition);

    const mediaIds: string[] = [];
    const assetEvidence: AssetEvidence[] = [];
    for (const asset of assets) {
      const uploaded = await uploadMedia(accessToken, release, asset);
      mediaIds.push(uploaded.mediaId);
      assetEvidence.push(uploaded.evidence);
    }

    const payload: Record<string, unknown> = {
      text: stringValue(t.text) ?? release.text ?? release.description ?? release.title
    };
    if (mediaIds.length) payload.media = { media_ids: mediaIds };

    const replyTo = stringValue(t.replyToId);
    if (replyTo) payload.reply = { in_reply_to_tweet_id: replyTo };

    const quotePostId = stringValue(t.quotePostId);
    if (quotePostId) payload.quote_tweet_id = quotePostId;

    let body: Record<string, any>;
    try {
      body = await readJsonResponse(await fetchWithTimeout(POST_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }));
    } catch (error) {
      if (mediaIds.length) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`X Post creation failed after media upload; orphaned media IDs: ${mediaIds.join(", ")}. ${detail}`);
      }
      throw error;
    }

    const id = String(body.data?.id ?? "");
    if (!id) {
      return {
        platform: this.platform,
        status: "submitted",
        detail: "X returned a successful response without data.id; remote outcome is unverified. Do not blindly retry.",
        assetEvidence,
        raw: body as any
      };
    }
    return {
      platform: this.platform,
      status: "published",
      externalId: id,
      url: `https://x.com/i/web/status/${id}`,
      assetEvidence,
      raw: body as any
    };
  }

  async inspect(creator: CreatorProfile, externalId: string): Promise<ChannelSnapshot> {
    const accessToken = credential(creator, this.platform, "accessToken");
    const url = new URL(`https://api.x.com/2/tweets/${encodeURIComponent(externalId)}`);
    url.searchParams.set("tweet.fields", "created_at,public_metrics,possibly_sensitive");
    const body = await readJsonResponse(await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }));
    const data = body.data ?? {};
    const metrics = data.public_metrics && typeof data.public_metrics === "object"
      ? data.public_metrics
      : {};
    return {
      platform: this.platform,
      externalId,
      metrics: metrics as any,
      raw: body as any
    };
  }
}
