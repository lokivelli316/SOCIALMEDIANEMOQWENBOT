import { createHash } from "node:crypto";
import type { JsonValue, Platform, ReleaseManifest } from "../types.js";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = stable((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function operationKeyFor(
  creatorId: string,
  release: ReleaseManifest,
  platform: Platform
): string {
  const destination = release.targets?.[platform] ?? {};
  const releaseFingerprint = {
    id: release.id,
    contentType: release.contentType,
    title: release.title,
    text: release.text ?? null,
    description: release.description ?? null,
    url: release.url ?? null,
    tags: release.tags ?? [],
    assets: (release.assets ?? []).map(asset => ({
      id: asset.id,
      kind: asset.kind,
      path: asset.path ?? null,
      url: asset.url ?? null,
      mimeType: asset.mimeType ?? null,
      alt: asset.alt ?? null,
      platforms: asset.platforms ?? null
    })),
    destination
  };
  return hash([creatorId, platform, releaseFingerprint]);
}
