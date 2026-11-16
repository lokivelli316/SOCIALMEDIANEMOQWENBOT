import type { CreatorProfile, JsonValue, Platform, ReleaseManifest } from "../types.js";

export class HoldError extends Error {
  readonly name = "HoldError";
}

export function platformProfile(creator: CreatorProfile, platform: Platform) {
  const cfg = creator.platforms[platform];
  if (!cfg?.enabled) throw new HoldError(`${platform} is not enabled for creator ${creator.id}`);
  return cfg;
}

export function credential(creator: CreatorProfile, platform: Platform, key: string): string {
  const cfg = platformProfile(creator, platform);
  const envName = cfg.credentials[key];
  if (!envName) throw new HoldError(`${creator.id}/${platform} has no credential mapping for ${key}`);
  const value = process.env[envName];
  if (!value) throw new HoldError(`Missing environment variable ${envName} for ${creator.id}/${platform}`);
  return value;
}

export function target(release: ReleaseManifest, platform: Platform): Record<string, JsonValue> {
  return release.targets?.[platform] ?? {};
}

export function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function boolValue(value: JsonValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function defaultString(
  creator: CreatorProfile,
  platform: Platform,
  key: string
): string | undefined {
  return stringValue(creator.platforms[platform]?.defaults?.[key]);
}

export async function readJsonResponse(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  let body: Record<string, any>;
  try {
    body = text ? JSON.parse(text) as Record<string, any> : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const detail = typeof body.error === "object" ? JSON.stringify(body.error) : text;
    throw new Error(`HTTP ${response.status}: ${detail || response.statusText}`);
  }
  return body;
}

export function selectedAssets(release: ReleaseManifest, platform: Platform) {
  return (release.assets ?? []).filter(a => !a.platforms || a.platforms.includes(platform));
}
