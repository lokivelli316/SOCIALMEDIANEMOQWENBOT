import type { CreatorProfile, PublishPlan, PublishResult, ReleaseManifest } from "../types.js";
import type { PlatformAdapter } from "./adapter.js";
import { credential, defaultString, readJsonResponse, stringValue, target } from "./common.js";

export class RedditAdapter implements PlatformAdapter {
  readonly platform = "reddit" as const;

  plan(creator: CreatorProfile, release: ReleaseManifest): PublishPlan {
    const t = target(release, this.platform);
    const subreddit = stringValue(t.subreddit) ?? "UNSET";
    const kind = stringValue(t.kind) ?? "self";
    return {
      platform: this.platform,
      creatorId: creator.id,
      releaseId: release.id,
      summary: `Submit Reddit ${kind} post "${release.title}" to r/${subreddit}`,
      requiresApproval: creator.platforms.reddit?.approval === "required",
      warnings: subreddit === "UNSET" ? ["Reddit target requires targets.reddit.subreddit"] : []
    };
  }

  async publish(creator: CreatorProfile, release: ReleaseManifest): Promise<PublishResult> {
    const accessToken = credential(creator, this.platform, "accessToken");
    const t = target(release, this.platform);
    const subreddit = stringValue(t.subreddit);
    if (!subreddit) throw new Error("Reddit target requires subreddit");

    const kind = stringValue(t.kind) ?? "self";
    if (kind !== "self" && kind !== "link") throw new Error("Reddit adapter currently supports kind=self or kind=link");

    const form = new URLSearchParams({
      api_type: "json",
      raw_json: "1",
      sr: subreddit,
      kind,
      title: release.title,
      sendreplies: "true"
    });
    if (kind === "self") {
      form.set("text", release.text ?? release.description ?? "");
    } else {
      const url = stringValue(t.url) ?? release.url;
      if (!url) throw new Error("Reddit link post requires targets.reddit.url or release.url");
      form.set("url", url);
      form.set("resubmit", "true");
    }

    const userAgent = stringValue(t.userAgent)
      ?? defaultString(creator, this.platform, "userAgent")
      ?? `SOCIALMEDIANEMOQWENBOT/0.1 creator/${creator.id}`;

    const body = await readJsonResponse(await fetch("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": userAgent,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form
    }));

    const errors = body.json?.errors;
    if (Array.isArray(errors) && errors.length) throw new Error(`Reddit submit rejected: ${JSON.stringify(errors)}`);
    const data = body.json?.data ?? {};
    return {
      platform: this.platform,
      status: "published",
      externalId: typeof data.name === "string" ? data.name : undefined,
      url: typeof data.url === "string" ? data.url : undefined,
      raw: body as any
    };
  }
}
