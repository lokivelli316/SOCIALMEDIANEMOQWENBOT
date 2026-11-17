import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { CreatorProfile, Platform } from "../types.js";

type CredentialMap = Partial<Record<Platform, Record<string, string>>>;
interface CredentialBindingsFile {
  version?: number;
  creators?: Record<string, CredentialMap>;
}

const registered = new WeakMap<CreatorProfile, Map<string, string>>();
const legacyAllowed = () => process.env.NEMOQWEN_ALLOW_LEGACY_CREDENTIAL_REFS === "1";

export function defaultCredentialBindingsPath(): string {
  return process.env.NEMOQWEN_CREDENTIAL_BINDINGS
    ?? fileURLToPath(new URL("../../.nemoqwen/credential-bindings.json", import.meta.url));
}

export async function registerCredentialBindings(profile: CreatorProfile): Promise<void> {
  if (legacyAllowed()) {
    registered.set(profile, new Map());
    return;
  }

  let parsed: CredentialBindingsFile;
  try {
    parsed = JSON.parse(await readFile(defaultCredentialBindingsPath(), "utf8")) as CredentialBindingsFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "Operator credential bindings are not configured. Create .nemoqwen/credential-bindings.json or set NEMOQWEN_CREDENTIAL_BINDINGS. NEMOQWEN_ALLOW_LEGACY_CREDENTIAL_REFS=1 is an explicit compatibility override."
      );
    }
    throw error;
  }

  if (!parsed || typeof parsed !== "object" || !parsed.creators || typeof parsed.creators !== "object") {
    throw new Error("Credential bindings must contain a creators object");
  }

  const creatorBindings = parsed.creators[profile.id];
  if (!creatorBindings || typeof creatorBindings !== "object") {
    throw new Error(`No operator credential bindings exist for creator ${profile.id}`);
  }

  const allowed = new Map<string, string>();
  for (const [platform, cfg] of Object.entries(profile.platforms) as [Platform, CreatorProfile["platforms"][Platform]][]) {
    if (!cfg) continue;
    const platformBindings = creatorBindings[platform];
    if (!platformBindings || typeof platformBindings !== "object") {
      if (Object.keys(cfg.credentials).length) {
        throw new Error(`No operator credential bindings exist for ${profile.id}/${platform}`);
      }
      continue;
    }
    for (const [key, envName] of Object.entries(cfg.credentials)) {
      const expected = platformBindings[key];
      if (expected !== envName) {
        throw new Error(`Credential reference is not operator-bound for ${profile.id}/${platform}/${key}`);
      }
      allowed.set(`${platform}:${key}`, envName);
    }
  }
  registered.set(profile, allowed);
}

export function assertCredentialBinding(
  profile: CreatorProfile,
  platform: Platform,
  key: string,
  envName: string
): void {
  if (legacyAllowed()) return;
  const allowed = registered.get(profile);
  if (!allowed || allowed.get(`${platform}:${key}`) !== envName) {
    throw new Error(`Credential reference is not operator-bound for ${profile.id}/${platform}/${key}`);
  }
}
