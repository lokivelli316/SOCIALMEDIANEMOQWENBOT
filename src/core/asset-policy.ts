import { createHash } from "node:crypto";
import { open, realpath, type FileHandle } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ReleaseManifest } from "../types.js";

const sourceRoots = new WeakMap<ReleaseManifest, string>();

export class AssetPolicyError extends Error {
  readonly name = "AssetPolicyError";
}

export interface TrustedAsset {
  handle: FileHandle;
  resolvedPath: string;
  root: string;
  relativePath: string;
  size: number;
  sha256: string;
}

export function registerReleaseSource(release: ReleaseManifest, manifestPath: string): void {
  sourceRoots.set(release, dirname(resolve(manifestPath)));
}

function configuredRoots(): string[] {
  const raw = process.env.NEMOQWEN_ASSET_ROOTS;
  if (!raw) return [];
  return raw.split(delimiter).map(value => value.trim()).filter(Boolean).map(value => resolve(value));
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function sha256File(handle: FileHandle, size: number): Promise<string> {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let offset = 0;
  while (offset < size) {
    const length = Math.min(buffer.length, size - offset);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    if (bytesRead <= 0) throw new AssetPolicyError(`Asset ended unexpectedly while hashing at byte ${offset}`);
    hash.update(buffer.subarray(0, bytesRead));
    offset += bytesRead;
  }
  return hash.digest("hex");
}

export async function openTrustedAsset(release: ReleaseManifest, path: string): Promise<TrustedAsset> {
  const sourceRoot = sourceRoots.get(release);
  const roots = [...(sourceRoot ? [sourceRoot] : []), ...configuredRoots()];
  if (!roots.length) {
    throw new AssetPolicyError(
      "Local asset path has no trusted root. Load the release from a manifest file or configure NEMOQWEN_ASSET_ROOTS."
    );
  }

  const canonicalRoots: string[] = [];
  for (const root of roots) {
    try {
      canonicalRoots.push(await realpath(root));
    } catch {
      // A configured root that does not exist grants no authority.
    }
  }
  if (!canonicalRoots.length) throw new AssetPolicyError("No configured trusted asset root currently exists");

  const base = sourceRoot ?? roots[0]!;
  const requested = isAbsolute(path) ? path : resolve(base, path);
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(requested);
  } catch {
    throw new AssetPolicyError("Local asset path does not resolve to an existing file inside a trusted root");
  }

  const root = canonicalRoots.find(candidateRoot => inside(candidateRoot, resolvedPath));
  if (!root) {
    throw new AssetPolicyError("Local asset path escapes the operator-approved trusted roots");
  }

  const handle = await open(resolvedPath, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new AssetPolicyError("Local asset must be a regular file");
    const sha256 = await sha256File(handle, info.size);
    return {
      handle,
      resolvedPath,
      root,
      relativePath: relative(root, resolvedPath).split(sep).join("/"),
      size: info.size,
      sha256
    };
  } catch (error) {
    await handle.close();
    throw error;
  }
}
