import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = ".agents/skills";
const entries = await readdir(root, { withFileTypes: true });
const manifest = JSON.parse(await readFile("skills/manifest.json", "utf8"));
const manifestNames = new Set((manifest.skills ?? []).map(skill => skill.name));
const diskNames = new Set(entries.filter(entry => entry.isDirectory()).map(entry => entry.name));
const names = new Set();
const failures = [];
let checked = 0;

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const file = join(root, entry.name, "SKILL.md");
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    if (entry.name !== "README.md") failures.push(`${entry.name}: missing SKILL.md`);
    continue;
  }

  checked += 1;
  if (!text.startsWith("---\n")) {
    failures.push(`${entry.name}: missing YAML frontmatter opener`);
    continue;
  }
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) {
    failures.push(`${entry.name}: missing YAML frontmatter closer`);
    continue;
  }

  const frontmatter = text.slice(4, end);
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m);
  if (!nameMatch) failures.push(`${entry.name}: frontmatter missing name`);
  if (!descriptionMatch) failures.push(`${entry.name}: frontmatter missing description`);

  const name = nameMatch?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (name) {
    if (names.has(name)) failures.push(`${entry.name}: duplicate skill name ${name}`);
    names.add(name);
    if (name !== entry.name) failures.push(`${entry.name}: directory/name mismatch (${name})`);
  }

  if (text.length < 250) failures.push(`${entry.name}: skill body is suspiciously short`);
}

if (!checked) failures.push("no skills found");
for (const name of diskNames) if (!manifestNames.has(name)) failures.push(`${name}: skill directory missing from skills/manifest.json`);
for (const name of manifestNames) if (!diskNames.has(name)) failures.push(`${name}: manifest entry has no skill directory`);

if (failures.length) {
  console.error("Skill validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Skill validation PASS: ${checked} skill(s), ${names.size} unique name(s)`);
