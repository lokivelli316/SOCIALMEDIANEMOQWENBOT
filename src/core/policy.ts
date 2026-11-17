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

  // Runtime input can come from JSON, a plugin, or a future UI even when TypeScript says otherwise.
  // Unknown modes must NEVER inherit publish authority.
  switch (cfg.approval) {
    case "draft":
      return { allowed: false, reason: `${platform} is draft-only for ${creator.id}` };
    case "required":
      return explicitApproval
        ? { allowed: true, reason: "explicit approval granted" }
        : { allowed: false, reason: `${platform} requires explicit approval` };
    case "auto":
      return { allowed: true, reason: "auto authority granted" };
    default:
      return { allowed: false, reason: `${platform} has an unknown approval mode; publication denied` };
  }
}
