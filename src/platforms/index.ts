import type { Platform } from "../types.js";
import type { PlatformAdapter } from "./adapter.js";
import { FacebookAdapter } from "./facebook.js";
import { RedditAdapter } from "./reddit.js";
import { TikTokAdapter } from "./tiktok.js";
import { XAdapter } from "./x.js";
import { YouTubeAdapter } from "./youtube.js";

export const adapters: Record<Platform, PlatformAdapter> = {
  facebook: new FacebookAdapter(),
  tiktok: new TikTokAdapter(),
  youtube: new YouTubeAdapter(),
  reddit: new RedditAdapter(),
  x: new XAdapter()
};
