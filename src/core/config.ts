import { readFile } from "node:fs/promises";
import { CREATOR_TYPES, PLATFORMS, type CreatorProfile, type ReleaseManifest } from "../types.js";

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function loadCreator(path: string): Promise<CreatorProfile> {
  const profile = await loadJson<CreatorProfile>(path);
  if (!profile.id || !profile.displayName) throw new Error("Creator profile requires id and displayName");
  if (!CREATOR_TYPES.includes(profile.primaryType)) throw new Error(`Unknown creator type: ${profile.primaryType}`);
  for (const p of Object.keys(profile.platforms)) {
    if (!PLATFORMS.includes(p as (typeof PLATFORMS)[number])) throw new Error(`Unknown platform: ${p}`);
  }
  return profile;
}

export async function loadRelease(path: string): Promise<ReleaseManifest> {
  const release = await loadJson<ReleaseManifest>(path);
  if (!release.id || !release.title || !release.contentType) {
    throw new Error("Release requires id, title, and contentType");
  }
  return release;
}
