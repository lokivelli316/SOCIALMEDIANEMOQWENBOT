#!/usr/bin/env bash
# Opt-in keyless NVIDIA SkillEvaluator quality check for the repo-native skill pack.
# Does not invoke an LLM, does not install skills, and does not publish.
set -euo pipefail

command -v skillevaluator >/dev/null 2>&1 || {
  echo "HOLD: skillevaluator not installed; see docs/MYTHOS_SKILL_EVALUATOR.md" >&2
  exit 2
}

root=".agents/skills"
output="${1:-reports/mythos-skill-audit}"
if [[ ! -d "$root" ]]; then
  echo "HOLD: missing canonical skill directory $root" >&2
  exit 2
fi
mkdir -p "$output"
expected="$(node -e 'const m=JSON.parse(require("fs").readFileSync("skills/manifest.json","utf8")); process.stdout.write(String((m.skills||[]).length))')"
count=0
failed=0
for file in "$root"/*/SKILL.md; do
  [[ -f "$file" ]] || continue
  skill_dir="${file%/SKILL.md}"
  skill_name="${skill_dir##*/}"
  count=$((count + 1))
  echo "Evaluating $skill_name (keyless static quality)..."
  if ! skillevaluator quality-check "$skill_dir" -r cli -r json -o "$output/$skill_name"; then
    echo "HOLD: $skill_name needs review; report retained" >&2
    failed=$((failed + 1))
  fi
done
if [[ "$count" -ne "$expected" ]]; then
  echo "HOLD: skills/manifest.json expects $expected canonical skill directories; found $count" >&2
  exit 2
fi
if [[ "$failed" -ne 0 ]]; then
  echo "HOLD: $failed/$count skill quality checks below threshold or failed; inspect reports" >&2
  exit 1
fi
echo "PASS (limited to keyless SkillEvaluator quality-check): $count/$count skills"
