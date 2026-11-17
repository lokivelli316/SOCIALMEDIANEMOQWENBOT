import type { ChannelSnapshot, CreatorProfile, PublishPlan, PublishResult, ReleaseManifest } from "../types.js";
import type { PlatformAdapter } from "./adapter.js";
import { HoldError, credential, defaultString, fetchWithTimeout, readJsonResponse, selectedAssets, stringValue, target } from "./common.js";

export class FacebookAdapter implements PlatformAdapter {
  readonly platform = "facebook" as const;

  plan(creator: CreatorProfile, release: ReleaseManifest): PublishPlan {
    const t = target(release, this.platform);
    const pageId = stringValue(t.pageId) ?? defaultString(creator, this.platform, "pageId") ?? "UNSET";
    const videoUrl = stringValue(t.videoUrl) ?? selectedAssets(release, this.platform).find(a => a.kind === "video")?.url;
    return {
      platform: this.platform,
      creatorId: creator.id,
      releaseId: release.id,
      summary: `Publish ${videoUrl ? "video" : "feed"} post "${release.title}" to Facebook Page ${pageId}`,
      requiresApproval: creator.platforms.facebook?.approval === "required",
      warnings: pageId === "UNSET" ? ["Facebook requires a Page ID"] : []
    };
  }

  async publish(creator: CreatorProfile, release: ReleaseManifest): Promise<PublishResult> {
    const accessToken = credential(creator, this.platform, "accessToken");
    const t = target(release, this.platform);
    const pageId = stringValue(t.pageId) ?? defaultString(creator, this.platform, "pageId");
    if (!pageId) throw new Error("Facebook requires targets.facebook.pageId or platform default pageId");

    const videoUrl = stringValue(t.videoUrl) ?? selectedAssets(release, this.platform).find(a => a.kind === "video")?.url;
    const form = new URLSearchParams();
    let endpoint: string;

    if (videoUrl) {
      endpoint = `https://graph.facebook.com/v27.0/${encodeURIComponent(pageId)}/videos`;
      form.set("file_url", videoUrl);
      form.set("title", release.title);
      form.set("description", release.text ?? release.description ?? "");
      form.set("published", "true");
    } else {
      endpoint = `https://graph.facebook.com/v27.0/${encodeURIComponent(pageId)}/feed`;
      form.set("message", release.text ?? release.description ?? release.title);
      const link = stringValue(t.link) ?? release.url;
      if (link) form.set("link", link);
    }

    const body = await readJsonResponse(await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form
    }));

    if (body.error) throw new Error(`Facebook API rejected publication: ${JSON.stringify(body.error)}`);
    const id = String(body.id ?? body.video_id ?? "");
    if (!id) throw new HoldError("Facebook accepted a submission without an object ID; verify before retrying");
    return {
      platform: this.platform,
      status: "submitted",
      externalId: id,
      detail: videoUrl
        ? "Facebook accepted the video upload; transcoding and public visibility require readback."
        : "Facebook accepted the feed request; public visibility has not been verified by readback.",
      raw: body as any
    };
  }
  async inspect(creator: CreatorProfile, externalId: string): Promise<ChannelSnapshot> {
    const accessToken = credential(creator, this.platform, "accessToken");
    const url = new URL(`https://graph.facebook.com/v27.0/${encodeURIComponent(externalId)}`);
    url.searchParams.set("fields", "id,is_published,permalink_url,created_time");
    const body = await readJsonResponse(await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }));
    if (body.error) throw new HoldError(`Facebook readback failed: ${JSON.stringify(body.error)}`);
    return {
      platform: this.platform,
      externalId,
      metrics: {
        is_published: typeof body.is_published === "boolean" ? body.is_published : null,
        permalink_url: typeof body.permalink_url === "string" ? body.permalink_url : null,
        created_time: typeof body.created_time === "string" ? body.created_time : null
      },
      raw: body as any
    };
  }
}
