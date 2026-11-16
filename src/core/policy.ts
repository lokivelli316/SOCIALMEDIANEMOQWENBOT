import type { CreatorProfile, Platform } from "../types.js";

export interface AuthorityDecision {
  allowed: boolean;
  reason: string;
}

export function publishAuthority(
  creator: CreatorProfile,
  platform: Platform,
  explicitApproval: boolean
): AuthorityDecision {
  const cfg = creator.platforms[platform];
  if (!cfg?.enabled) return { allowed: false, reason: `${platform} is disabled for ${creator.id}` };
  if (cfg.approval === "draft") return { allowed: false, reason: `${platform} is draft-only for ${creator.id}` };
  if (cfg.approval === "required" && !explicitApproval) {
    return { allowed: false, reason: `${platform} requires explicit approval` };
  }
  return { allowed: true, reason: cfg.approval === "auto" ? "auto authority granted" : "explicit approval granted" };
}
