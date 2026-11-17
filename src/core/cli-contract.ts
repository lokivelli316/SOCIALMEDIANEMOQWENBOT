import type { PublishResult } from "../types.js";

export interface PublishFlags {
  approve: boolean;
  retry: boolean;
  dryRun: boolean;
}

const ALLOWED_PUBLISH_FLAGS = new Set(["--approve", "--retry", "--dry-run"]);

export function parsePublishFlags(flags: string[]): PublishFlags {
  const unknown = flags.filter(flag => !ALLOWED_PUBLISH_FLAGS.has(flag));
  if (unknown.length) throw new Error(`Unknown publish flag(s): ${unknown.join(", ")}`);
  return {
    approve: flags.includes("--approve"),
    retry: flags.includes("--retry"),
    dryRun: flags.includes("--dry-run")
  };
}

export function publishExitCode(status: PublishResult["status"]): number {
  switch (status) {
    case "published":
    case "submitted":
      return 0;
    case "hold":
    case "verifying":
    case "planned":
      return 2;
    case "failed":
      return 3;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
