import { open, stat } from "node:fs/promises";
import type { ChannelSnapshot, CreatorProfile, PublishPlan, PublishResult, ReleaseManifest } from "../types.js";
import type { PlatformAdapter } from "./adapter.js";
import { HoldError, credential, defaultString, fetchWithTimeout, readJsonResponse, selectedAssets, stringValue, target } from "./common.js";

export class YouTubeAdapter implements PlatformAdapter {
  readonly platform = "youtube" as const;

  plan(creator: CreatorProfile, release: ReleaseManifest): PublishPlan {
    const asset = selectedAssets(release, this.platform).find(a => a.kind === "video" && a.path);
    return {
      platform: this.platform,
      creatorId: creator.id,
      releaseId: release.id,
      summary: `Upload YouTube video "${release.title}" using resumable upload`,
      requiresApproval: creator.platforms.youtube?.approval === "required",
      warnings: asset ? [] : ["YouTube upload requires a local video asset path"]
    };
  }

  async publish(creator: CreatorProfile, release: ReleaseManifest): Promise<PublishResult> {
    const accessToken = credential(creator, this.platform, "accessToken");
    const asset = selectedAssets(release, this.platform).find(a => a.kind === "video" && a.path);
    if (!asset?.path) throw new Error("YouTube upload requires a local video asset path");

    const info = await stat(asset.path);
    const mime = asset.mimeType ?? "video/mp4";
    const t = target(release, this.platform);
    const privacyStatus = stringValue(t.privacyStatus)
      ?? defaultString(creator, this.platform, "privacyStatus")
      ?? "private";

    const metadata = {
      snippet: {
        title: release.title,
        description: release.description ?? release.text ?? "",
        tags: release.tags ?? []
      },
      status: { privacyStatus }
    };

    const init = await fetchWithTimeout("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(info.size),
        "X-Upload-Content-Type": mime
      },
      body: JSON.stringify(metadata)
    });
    if (!init.ok) await readJsonResponse(init);
    const location = init.headers.get("location");
    if (!location) throw new Error("YouTube resumable upload did not return a Location header");

    const chunkSize = 8 * 1024 * 1024; // 8 MiB, a multiple of YouTube's 256 KiB chunk requirement.
    const handle = await open(asset.path, "r");
    let body: Record<string, any> | undefined;
    try {
      let offset = 0;
      while (offset < info.size) {
        const requested = Math.min(chunkSize, info.size - offset);
        const buffer = Buffer.allocUnsafe(requested);
        const { bytesRead } = await handle.read(buffer, 0, requested, offset);
        if (bytesRead <= 0) throw new HoldError(`YouTube upload source ended unexpectedly at byte ${offset}`);
        const lastByte = offset + bytesRead - 1;
        const response = await fetchWithTimeout(location, {
          method: "PUT",
          headers: {
            "Content-Type": mime,
            "Content-Length": String(bytesRead),
            "Content-Range": `bytes ${offset}-${lastByte}/${info.size}`
          },
          body: buffer.subarray(0, bytesRead)
        }, 120_000);

        if (response.status === 308) {
          const range = response.headers.get("range");
          const match = range?.match(/bytes=0-(\d+)/i);
          offset = match ? Number(match[1]) + 1 : lastByte + 1;
          continue;
        }

        body = await readJsonResponse(response);
        offset = info.size;
      }
    } finally {
      await handle.close();
    }
    if (!body) throw new HoldError("YouTube resumable upload ended without a final video resource");

    const id = String(body.id ?? "");
    return {
      platform: this.platform,
      status: "published",
      externalId: id || undefined,
      url: id ? `https://www.youtube.com/watch?v=${id}` : undefined,
      raw: body as any
    };
  }
  async inspect(creator: CreatorProfile, externalId: string): Promise<ChannelSnapshot> {
    const accessToken = credential(creator, this.platform, "accessToken");
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "status,processingDetails,snippet");
    url.searchParams.set("id", externalId);
    const body = await readJsonResponse(await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }));
    const item = Array.isArray(body.items) ? body.items[0] : undefined;
    if (!item) throw new HoldError(`YouTube readback returned no video for ${externalId}`);
    return {
      platform: this.platform,
      externalId,
      metrics: {
        privacy_status: typeof item.status?.privacyStatus === "string" ? item.status.privacyStatus : null,
        upload_status: typeof item.status?.uploadStatus === "string" ? item.status.uploadStatus : null,
        processing_status: typeof item.processingDetails?.processingStatus === "string"
          ? item.processingDetails.processingStatus
          : null,
        published_at: typeof item.snippet?.publishedAt === "string" ? item.snippet.publishedAt : null
      },
      raw: body as any
    };
  }
}
