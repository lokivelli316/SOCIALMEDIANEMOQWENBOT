import { readFile } from "node:fs/promises";
import { loadCreator, loadRelease } from "./core/config.js";
import { loadLocalEnv } from "./core/env.js";
import { NemoQwenOrchestrator } from "./core/orchestrator.js";
import { CREATOR_TYPES, PLATFORMS, type Platform } from "./types.js";

function usage(): never {
  console.error([
    "Usage:",
    "  npm run cli -- creator-types",
    "  npm run cli -- plan <creator.json> <release.json> [platform]",
    "  npm run cli -- publish <creator.json> <release.json> <platform> [--approve] [--retry]",
    "  npm run cli -- inspect <creator.json> <platform> <external-id>"
  ].join("\n"));
  process.exit(2);
}

function parsePlatform(value: string | undefined): Platform {
  if (!value || !PLATFORMS.includes(value as Platform)) throw new Error(`Unknown platform: ${value ?? "(missing)"}`);
  return value as Platform;
}

await loadLocalEnv();
const [, , command, ...args] = process.argv;

if (command === "creator-types") {
  const archetypes = JSON.parse(await readFile("config/creator-types.json", "utf8")) as Record<string, unknown>;
  console.log(JSON.stringify({ types: CREATOR_TYPES, archetypes }, null, 2));
} else if (command === "plan") {
  const [creatorPath, releasePath, platformName] = args;
  if (!creatorPath || !releasePath) usage();
  const creator = await loadCreator(creatorPath);
  const release = await loadRelease(releasePath);
  const platform = platformName ? parsePlatform(platformName) : undefined;
  const plans = new NemoQwenOrchestrator().plan(creator, release, platform);
  console.log(JSON.stringify(plans, null, 2));
} else if (command === "publish") {
  const [creatorPath, releasePath, platformName, ...flags] = args;
  if (!creatorPath || !releasePath || !platformName) usage();
  const creator = await loadCreator(creatorPath);
  const release = await loadRelease(releasePath);
  const platform = parsePlatform(platformName);
  const result = await new NemoQwenOrchestrator().publish(
    creator,
    release,
    platform,
    flags.includes("--approve"),
    flags.includes("--retry")
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "published") process.exitCode = 1;
} else if (command === "inspect") {
  const [creatorPath, platformName, externalId] = args;
  if (!creatorPath || !platformName || !externalId) usage();
  const creator = await loadCreator(creatorPath);
  const platform = parsePlatform(platformName);
  const snapshot = await new NemoQwenOrchestrator().inspect(creator, platform, externalId);
  console.log(JSON.stringify(snapshot, null, 2));
} else {
  usage();
}
