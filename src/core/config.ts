import { readFile, stat } from "node:fs/promises";
import { CREATOR_TYPES, PLATFORMS, type CreatorProfile, type Platform, type ReleaseManifest } from "../types.js";

async function loadJson<T>(path: string): Promise<T> {
  const maxBytesRaw = Number(process.env.NEMOQWEN_MAX_MANIFEST_BYTES ?? "1048576");
  const maxBytes = Number.isFinite(maxBytesRaw) && maxBytesRaw > 0 ? Math.floor(maxBytesRaw) : 1_048_576;
  const info = await stat(path);
  if (info.size > maxBytes) {
    throw new Error(`JSON input ${path} is ${info.size} bytes; limit is ${maxBytes}`);
  }
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function loadCreator(path: string): Promise<CreatorProfile> {
  const profile = await loadJson<CreatorProfile>(path);
  if (!record(profile)) throw new Error("Creator profile must be an object");
  if (typeof profile.id !== "string" || !profile.id.trim() ||
      typeof profile.displayName !== "string" || !profile.displayName.trim()) {
    throw new Error("Creator profile requires id and displayName");
  }
  if (!CREATOR_TYPES.includes(profile.primaryType)) throw new Error(`Unknown creator type: ${profile.primaryType}`);
  if (profile.secondaryTypes !== undefined) {
    if (!Array.isArray(profile.secondaryTypes)) throw new Error("Creator secondaryTypes must be an array");
    for (const type of profile.secondaryTypes) {
      if (!CREATOR_TYPES.includes(type)) throw new Error(`Unknown secondary creator type: ${String(type)}`);
    }
  }
  if (!record(profile.platforms)) throw new Error("Creator profile requires platforms object");
  for (const p of Object.keys(profile.platforms)) {
    if (!PLATFORMS.includes(p as Platform)) throw new Error(`Unknown platform: ${p}`);
    const cfg = profile.platforms[p as Platform];
    if (!record(cfg)) throw new Error(`Creator ${profile.id}: platforms.${p} must be an object`);
    if (typeof cfg.enabled !== "boolean") {
      throw new Error(`Creator ${profile.id}: platforms.${p}.enabled must be a boolean`);
    }
    if (cfg.approval !== "required" && cfg.approval !== "draft" && cfg.approval !== "auto") {
      throw new Error(`Creator ${profile.id}: platforms.${p}.approval must be required, draft, or auto`);
    }
    if (!record(cfg.credentials)) {
      throw new Error(`Creator ${profile.id}: platforms.${p}.credentials must be an object`);
    }
    for (const [key, envName] of Object.entries(cfg.credentials)) {
      if (typeof envName !== "string" || !envName.trim()) {
        throw new Error(`Creator ${profile.id}: platforms.${p}.credentials.${key} must name an environment variable`);
      }
    }
  }
  return profile;
}

export async function loadRelease(path: string): Promise<ReleaseManifest> {
  const release = await loadJson<ReleaseManifest>(path);
  if (!record(release) || typeof release.id !== "string" || !release.id.trim() ||
      typeof release.title !== "string" || !release.title.trim() ||
      typeof release.contentType !== "string" || !release.contentType.trim()) {
    throw new Error("Release requires id, title, and contentType");
  }
  if (release.tags !== undefined) {
    if (!Array.isArray(release.tags) || release.tags.some(tag => typeof tag !== "string")) {
      throw new Error("Release tags must be an array of strings");
    }
  }
  if (release.assets !== undefined) {
    if (!Array.isArray(release.assets)) throw new Error("Release assets must be an array");
    for (const [index, asset] of release.assets.entries()) {
      if (!record(asset)) throw new Error(`Release assets[${index}] must be an object`);
      if (typeof asset.id !== "string" || !asset.id.trim()) {
        throw new Error(`Release assets[${index}].id must be a non-empty string`);
      }
      if (!["video", "image", "audio", "document", "other"].includes(String(asset.kind))) {
        throw new Error(`Release assets[${index}].kind is invalid`);
      }
      for (const key of ["path", "url", "mimeType", "alt"] as const) {
        if (asset[key] !== undefined && typeof asset[key] !== "string") {
          throw new Error(`Release assets[${index}].${key} must be a string`);
        }
      }
      if (asset.platforms !== undefined) {
        if (!Array.isArray(asset.platforms)) throw new Error(`Release assets[${index}].platforms must be an array`);
        for (const p of asset.platforms) {
          if (!PLATFORMS.includes(p as Platform)) {
            throw new Error(`Release assets[${index}] has unknown platform: ${String(p)}`);
          }
        }
      }
    }
  }
  if (release.targets !== undefined) {
    if (!record(release.targets)) throw new Error("Release targets must be an object");
    for (const p of Object.keys(release.targets)) {
      if (!PLATFORMS.includes(p as Platform)) {
        throw new Error(`Unknown release target platform: ${p}`);
      }
      if (!record(release.targets[p as Platform])) {
        throw new Error(`Release targets.${p} must be an object`);
      }
    }
  }
  return release;
}
