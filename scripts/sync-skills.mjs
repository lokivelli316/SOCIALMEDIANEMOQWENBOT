import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const source = ".agents/skills";
const mirrors = [".claude/skills", ".github/skills"];
const entries = (await readdir(source, { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .filter(name => name !== "README.md");

for (const mirror of mirrors) {
  await mkdir(mirror, { recursive: true });
  for (const name of entries) {
    const destination = join(mirror, name);
    await rm(destination, { recursive: true, force: true });
    await cp(join(source, name), destination, { recursive: true });
  }
  console.log(`Synced ${entries.length} skill(s) -> ${mirror}`);
}
