import type { Platform } from "../types.js";
import type { PlatformAdapter } from "./adapter.js";
import { FacebookAdapter } from "./facebook.js";
import { RedditAdapter } from "./reddit.js";
import { TikTokAdapter } from "./tiktok.js";
import { XAdapter } from "./x.js";
import { YouTubeAdapter } from "./youtube.js";

const adapters: Readonly<Record<Platform, PlatformAdapter>> = Object.freeze({
  facebook: new FacebookAdapter(),
  tiktok: new TikTokAdapter(),
  youtube: new YouTubeAdapter(),
  reddit: new RedditAdapter(),
  x: new XAdapter()
});

export type AdapterResolver = (platform: Platform) => PlatformAdapter;

/**
 * Internal core resolver. Not part of the package public API.
 * Production mutations still require the runtime publish context guard in each adapter.
 */
export const internalAdapter: AdapterResolver = (platform) => adapters[platform];
