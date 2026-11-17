import { open, stat } from "node:fs/promises";
import type {
  ChannelSnapshot,
  CreatorProfile,
  PublishPlan,
  PublishResult,
  ReleaseManifest
} from "../types.js";
import type { PlatformAdapter } from "./adapter.js";
import { HoldError, credential, readJsonResponse, selectedAssets, stringValue, target } from "./common.js";

const MEDIA_URL = "https://api.x.com/2/media/upload";
const POST_URL = "https://api.x.com/2/tweets";
const CHUNK_SIZE = 4 * 1024 * 1024;

function mediaCategory(mime: string): string {
  if (mime.startsWith("video/")) return "tweet_video";
  if (mime === "image/gif") return "tweet_gif";
  return "tweet_image";
}

async function uploadMedia(accessToken: string, path: string, mimeType: string): Promise<string> {
  const info = await stat(path);
  if (info.size === 0) throw new Error(`X media file is empty: ${path}`);

  const initUrl = new URL(MEDIA_URL);
  initUrl.searchParams.set("command", "INIT");
  initUrl.searchParams.set("total_bytes", String(info.size));
  initUrl.searchParams.set("media_type", mimeType);
  initUrl.searchParams.set("media_category", mediaCategory(mimeType));

  const init = await readJsonResponse(await fetch(initUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` }
  }));
  const mediaId = String(init.data?.id ?? init.media_id_string ?? "");
  if (!mediaId) throw new Error("X media INIT returned no media id");

  const handle = await open(path, "r");
  try {
    let offset = 0;
    let segment = 0;
    while (offset < info.size) {
      const length = Math.min(CHUNK_SIZE, info.size - offset);
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead <= 0) throw new Error("Unexpected EOF during X media upload");

      const form = new FormData();
      form.set("command", "APPEND");
      form.set("media_id", mediaId);
      form.set("segment_index", String(segment));
      form.set(
        "media",
        new Blob([new Uint8Array(buffer.subarray(0, bytesRead))], { type: "application/octet-stream" }),
        "chunk"
      );

      const response = await fetch(MEDIA_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
      });
      if (!response.ok) await readJsonResponse(response);
      offset += bytesRead;
      segment += 1;
    }
  } finally {
    await handle.close();
  }

  const finalizeUrl = new URL(MEDIA_URL);
  finalizeUrl.searchParams.set("command", "FINALIZE");
  finalizeUrl.searchParams.set("media_id", mediaId);
  let finalized = await readJsonResponse(await fetch(finalizeUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` }
  }));

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const processing = finalized.data?.processing_info;
    if (!processing || processing.state === "succeeded") return mediaId;
    if (processing.state === "failed") {
      throw new Error(`X media processing failed: ${JSON.stringify(processing.error ?? processing)}`);
    }
    const waitMs = Math.max(1, Number(processing.check_after_secs ?? 1)) * 1000;
    await new Promise(resolve => setTimeout(resolve, waitMs));
    const statusUrl = new URL(MEDIA_URL);
    statusUrl.searchParams.set("command", "STATUS");
    statusUrl.searchParams.set("media_id", mediaId);
    finalized = await readJsonResponse(await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }));
  }
  throw new Error("X media processing did not finish within polling bound");
}

export class XAdapter implements PlatformAdapter {
  readonly platform = "x" as const;

  plan(creator: CreatorProfile, release: ReleaseManifest): PublishPlan {
    const assets = selectedAssets(release, this.platform).filter(a => a.path);
    const t = target(release, this.platform);
    const replyTo = stringValue(t.replyToId);
    const quote = stringValue(t.quotePostId);
    const mode = replyTo ? "reply" : quote ? "quote post" : "post";
    return {
      platform: this.platform,
      creatorId: creator.id,
      releaseId: release.id,
      summary: `Create X ${mode} "${release.title}" with ${assets.length} local media asset(s)`,
      requiresApproval: creator.platforms.x?.approval === "required",
      warnings: assets.length > 4
        ? ["X supports at most 4 selected media assets; publication will be held until corrected"]
        : []
    };
  }

  async publish(creator: CreatorProfile, release: ReleaseManifest): Promise<PublishResult> {
    const accessToken = credential(creator, this.platform, "accessToken");
    const t = target(release, this.platform);
    const assets = selectedAssets(release, this.platform).filter(a => a.path);
    if (assets.length > 4) {
      throw new HoldError(`X cannot silently discard media: ${assets.length} selected; at most 4 supported`);
    }
    const mediaIds: string[] = [];
    for (const asset of assets) {
      mediaIds.push(await uploadMedia(accessToken, asset.path!, asset.mimeType ?? "application/octet-stream"));
    }

    const payload: Record<string, unknown> = {
      text: stringValue(t.text) ?? release.text ?? release.description ?? release.title
    };
    if (mediaIds.length) payload.media = { media_ids: mediaIds };

    const replyTo = stringValue(t.replyToId);
    if (replyTo) payload.reply = { in_reply_to_tweet_id: replyTo };

    const quotePostId = stringValue(t.quotePostId);
    if (quotePostId) payload.quote_tweet_id = quotePostId;

    const body = await readJsonResponse(await fetch(POST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }));

    const id = String(body.data?.id ?? "");
    return {
      platform: this.platform,
      status: "published",
      externalId: id || undefined,
      url: id ? `https://x.com/i/web/status/${id}` : undefined,
      raw: body as any
    };
  }

  async inspect(creator: CreatorProfile, externalId: string): Promise<ChannelSnapshot> {
    const accessToken = credential(creator, this.platform, "accessToken");
    const url = new URL(`https://api.x.com/2/tweets/${encodeURIComponent(externalId)}`);
    url.searchParams.set("tweet.fields", "created_at,public_metrics,possibly_sensitive");
    const body = await readJsonResponse(await fetch(url, {
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
