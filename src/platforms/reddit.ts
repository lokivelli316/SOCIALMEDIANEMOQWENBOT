import type {
  ChannelSnapshot,
  CreatorProfile,
  PublishPlan,
  PublishResult,
  ReleaseManifest
} from "../types.js";
import type { PlatformAdapter } from "./adapter.js";
import { credential, defaultString, fetchWithTimeout, readJsonResponse, stringValue, target } from "./common.js";

function userAgent(creator: CreatorProfile, releaseTarget?: Record<string, any>): string {
  return stringValue(releaseTarget?.userAgent)
    ?? defaultString(creator, "reddit", "userAgent")
    ?? `SOCIALMEDIANEMOQWENBOT/0.1 creator/${creator.id}`;
}

export class RedditAdapter implements PlatformAdapter {
  readonly platform = "reddit" as const;

  plan(creator: CreatorProfile, release: ReleaseManifest): PublishPlan {
    const t = target(release, this.platform);
    const kind = stringValue(t.kind) ?? "self";
    const subreddit = stringValue(t.subreddit);
    const parentId = stringValue(t.parentId);
    const summary = kind === "comment"
      ? `Comment on Reddit object ${parentId ?? "UNSET"} using release "${release.title}"`
      : `Submit Reddit ${kind} post "${release.title}" to r/${subreddit ?? "UNSET"}`;
    const warnings: string[] = [];
    if (kind === "comment" && !parentId) warnings.push("Reddit comment requires targets.reddit.parentId");
    if (kind !== "comment" && !subreddit) warnings.push("Reddit post requires targets.reddit.subreddit");
    return {
      platform: this.platform,
      creatorId: creator.id,
      releaseId: release.id,
      summary,
      requiresApproval: creator.platforms.reddit?.approval === "required",
      warnings
    };
  }

  async publish(creator: CreatorProfile, release: ReleaseManifest): Promise<PublishResult> {
    const accessToken = credential(creator, this.platform, "accessToken");
    const t = target(release, this.platform);
    const kind = stringValue(t.kind) ?? "self";
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": userAgent(creator, t),
      "Content-Type": "application/x-www-form-urlencoded"
    };

    if (kind === "comment") {
      const parentId = stringValue(t.parentId);
      if (!parentId) throw new Error("Reddit comment requires targets.reddit.parentId");
      const form = new URLSearchParams({
        api_type: "json",
        raw_json: "1",
        thing_id: parentId,
        text: stringValue(t.text) ?? release.text ?? release.description ?? release.title
      });
      const body = await readJsonResponse(await fetchWithTimeout("https://oauth.reddit.com/api/comment", {
        method: "POST",
        headers,
        body: form
      }));
      const errors = body.json?.errors;
      if (Array.isArray(errors) && errors.length) throw new Error(`Reddit comment rejected: ${JSON.stringify(errors)}`);
      const thing = body.json?.data?.things?.[0]?.data ?? {};
      const externalId = typeof thing.name === "string" ? thing.name : "";
      if (!externalId) {
        return {
          platform: this.platform,
          status: "submitted",
          detail: "Reddit accepted the comment request without returning data.name; remote outcome is unverified. Do not blindly retry.",
          raw: body as any
        };
      }
      return {
        platform: this.platform,
        status: "published",
        externalId,
        url: typeof thing.permalink === "string" ? `https://www.reddit.com${thing.permalink}` : undefined,
        raw: body as any
      };
    }

    if (kind !== "self" && kind !== "link") {
      throw new Error("Reddit adapter supports kind=self, kind=link, or kind=comment");
    }

    const subreddit = stringValue(t.subreddit);
    if (!subreddit) throw new Error("Reddit post requires targets.reddit.subreddit");

    const form = new URLSearchParams({
      api_type: "json",
      raw_json: "1",
      sr: subreddit,
      kind,
      title: release.title,
      sendreplies: "true"
    });

    if (kind === "self") {
      form.set("text", stringValue(t.text) ?? release.text ?? release.description ?? "");
    } else {
      const url = stringValue(t.url) ?? release.url;
      if (!url) throw new Error("Reddit link post requires targets.reddit.url or release.url");
      form.set("url", url);
      form.set("resubmit", t.resubmit === true ? "true" : "false");
    }

    const body = await readJsonResponse(await fetchWithTimeout("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers,
      body: form
    }));

    const errors = body.json?.errors;
    if (Array.isArray(errors) && errors.length) throw new Error(`Reddit submit rejected: ${JSON.stringify(errors)}`);
    const data = body.json?.data ?? {};
    const externalId = typeof data.name === "string" ? data.name : "";
    if (!externalId) {
      return {
        platform: this.platform,
        status: "submitted",
        detail: "Reddit accepted the submission without returning data.name; remote outcome is unverified. Do not blindly retry.",
        raw: body as any
      };
    }
    return {
      platform: this.platform,
      status: "published",
      externalId,
      url: typeof data.url === "string" ? data.url : undefined,
      raw: body as any
    };
  }

  async inspect(creator: CreatorProfile, externalId: string): Promise<ChannelSnapshot> {
    const accessToken = credential(creator, this.platform, "accessToken");
    const url = new URL("https://oauth.reddit.com/api/info");
    url.searchParams.set("id", externalId);
    url.searchParams.set("raw_json", "1");
    const body = await readJsonResponse(await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": userAgent(creator)
      }
    }));
    const data = body.data?.children?.[0]?.data ?? {};
    const metrics = {
      score: typeof data.score === "number" ? data.score : null,
      upvote_ratio: typeof data.upvote_ratio === "number" ? data.upvote_ratio : null,
      num_comments: typeof data.num_comments === "number" ? data.num_comments : null,
      ups: typeof data.ups === "number" ? data.ups : null
    };
    return {
      platform: this.platform,
      externalId,
      metrics,
      raw: body as any
    };
  }
}
