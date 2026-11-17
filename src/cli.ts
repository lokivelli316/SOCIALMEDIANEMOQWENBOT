import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadCreator, loadRelease } from "./core/config.js";
import { parsePublishFlags, publishExitCode } from "./core/cli-contract.js";
import { loadLocalEnv } from "./core/env.js";
import { NemoQwenOrchestrator } from "./core/orchestrator.js";
import { ReceiptStore } from "./core/receipts.js";
import { CREATOR_TYPES, PLATFORMS, type Platform } from "./types.js";

function usage(): never {
  console.error([
    "Usage:",
    "  npm run cli -- creator-types",
    "  npm run cli -- plan <creator.json> <release.json> [platform]",
    "  npm run cli -- publish <creator.json> <release.json> <platform> [--approve] [--retry] [--dry-run]",
    "  npm run cli -- inspect <creator.json> <platform> <external-id>",
    "  npm run cli -- receipts-verify",
    "  npm run cli -- --help"
  ].join("\n"));
  process.exit(2);
}

function parsePlatform(value: string | undefined): Platform {
  if (!value || !PLATFORMS.includes(value as Platform)) throw new Error(`Unknown platform: ${value ?? "(missing)"}`);
  return value as Platform;
}

async function main(): Promise<void> {
  await loadLocalEnv();
  const [, , command, ...args] = process.argv;

  if (command === "--help" || command === "-h" || command === "help") usage();

  if (command === "creator-types") {
    if (args.length) usage();
    const creatorTypesPath = fileURLToPath(new URL("../config/creator-types.json", import.meta.url));
    const archetypes = JSON.parse(await readFile(creatorTypesPath, "utf8")) as Record<string, unknown>;
    console.log(JSON.stringify({ types: CREATOR_TYPES, archetypes }, null, 2));
  } else if (command === "plan") {
    const [creatorPath, releasePath, platformName, ...extra] = args;
    if (!creatorPath || !releasePath || extra.length) usage();
    const creator = await loadCreator(creatorPath);
    const release = await loadRelease(releasePath);
    const platform = platformName ? parsePlatform(platformName) : undefined;
    const plans = new NemoQwenOrchestrator().plan(creator, release, platform);
    console.log(JSON.stringify(plans, null, 2));
  } else if (command === "publish") {
    const [creatorPath, releasePath, platformName, ...flags] = args;
    if (!creatorPath || !releasePath || !platformName) usage();
    const parsedFlags = parsePublishFlags(flags);
    const creator = await loadCreator(creatorPath);
    const release = await loadRelease(releasePath);
    const platform = parsePlatform(platformName);
    const orchestrator = new NemoQwenOrchestrator();

    if (parsedFlags.dryRun) {
      const plans = orchestrator.plan(creator, release, platform);
      console.log(JSON.stringify({ dryRun: true, plans }, null, 2));
      return;
    }

    const result = await orchestrator.publish(
      creator,
      release,
      platform,
      parsedFlags.approve,
      parsedFlags.retry
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = publishExitCode(result.status);
  } else if (command === "inspect") {
    const [creatorPath, platformName, externalId, ...extra] = args;
    if (!creatorPath || !platformName || !externalId || extra.length) usage();
    const creator = await loadCreator(creatorPath);
    const platform = parsePlatform(platformName);
    const snapshot = await new NemoQwenOrchestrator().inspect(creator, platform, externalId);
    console.log(JSON.stringify(snapshot, null, 2));
  } else if (command === "receipts-verify") {
    if (args.length) usage();
    const verification = await new ReceiptStore().verifyChain();
    console.log(JSON.stringify(verification, null, 2));
    if (!verification.valid) process.exitCode = 1;
  } else {
    usage();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
