import { readFile, stat } from "node:fs/promises";
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

    const bytes = await readFile(asset.path);
    const body = await readJsonResponse(await fetchWithTimeout(location, {
      method: "PUT",
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length)
      },
      body: bytes
    }));

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
