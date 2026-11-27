#!/usr/bin/env bash
# Test of model-rule-check.py (P-788: Opus 5.5 medium everywhere): this repository passes; each planted mismatch in a
# throwaway copy fails and is named. No network, US$0.   bash product/tools/check-model-rule.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; C="$TOOLS/model-rule-check.py"
T=$(mktemp -d "${TMPDIR:-/tmp}/model-rule.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
out=$(python3 -I "$C" 2>&1); ok "this repository agrees on Opus 5.5 medium" "$([ $? = 0 ] && echo 1)" "$out"
fresh() { rm -rf "$T/r"; mkdir -p "$T/r/$PRODREL"; cp -R "$ROOTD/.claude" "$T/r/"; cp "$ROOTD/CLAUDE.md" "$ROOTD/AGENTS.md" "$T/r/"; cp "$ROOTD/$PRODREL/WAY-OF-WORKING.md" "$T/r/$PRODREL/"; }
run() { out=$(ROOT="$T/r" python3 -I "$C" 2>&1); r=$?; }
fresh; run; ok "an unchanged copy passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fresh; sed -i.b 's/^effort: medium$/effort: high/' "$T/r/.claude/agents/screen-reviewer.md"; run
ok "planted: reviewer agent at effort high fails, named" "$([ $r = 1 ] && echo "$out" | grep -q 'screen-reviewer.md has effort "high"' && echo 1)" "exit $r: $out"
fresh; sed -i.b 's/^model: opus$/model: sonnet/' "$T/r/.claude/agents/screen-breaker.md"; run
ok "planted: breaker agent on Sonnet fails, named" "$([ $r = 1 ] && echo "$out" | grep -q 'screen-breaker.md has model "sonnet"' && echo 1)" "exit $r: $out"
fresh; jq '.model = "fable"' "$ROOTD/.claude/settings.json" > "$T/r/.claude/settings.json"; run
ok "planted: settings.json model fable fails" "$([ $r = 1 ] && echo "$out" | grep -q '"model" is .fable.' && echo 1)" "exit $r: $out"
fresh; jq 'del(.effortLevel)' "$ROOTD/.claude/settings.json" > "$T/r/.claude/settings.json"; run
ok "planted: settings.json without effortLevel fails" "$([ $r = 1 ] && echo "$out" | grep -q '"effortLevel" is None' && echo 1)" "exit $r: $out"
fresh; jq '.env = {"CLAUDE_CODE_SUBAGENT_MODEL": "haiku"}' "$ROOTD/.claude/settings.json" > "$T/r/.claude/settings.json"; run
ok "planted: an env entry sending subagents to Haiku fails" "$([ $r = 1 ] && echo "$out" | grep -q 'CLAUDE_CODE_SUBAGENT_MODEL=haiku' && echo 1)" "exit $r: $out"
fresh; printf '* Launch the counting helper on Sonnet at low effort.\n' >> "$T/r/.claude/skills/qa/SKILL.md"; run
ok "planted: a skill line asking for Sonnet fails, with file and line" "$([ $r = 1 ] && echo "$out" | grep -qE 'skills/qa/SKILL.md:[0-9]+ names "Sonnet"' && echo 1)" "exit $r: $out"
fresh; printf '* Reviewers run at effort high.\n' >> "$T/r/$PRODREL/WAY-OF-WORKING.md"; run
ok "planted: WAY-OF-WORKING asking for effort high fails" "$([ $r = 1 ] && echo "$out" | grep -q 'WAY-OF-WORKING.md:[0-9]* names "effort high"' && echo 1)" "exit $r: $out"
fresh; printf '* P-788 exception: the desk ran on Fable at high once, named to the founder.\n' >> "$T/r/.claude/skills/qa/SKILL.md"; run
ok "a line citing P-788 (a named exception) passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fresh; awk 'NR==1{print; print "model: haiku"; next} {print}' "$ROOTD/.claude/skills/next/SKILL.md" > "$T/r/.claude/skills/next/SKILL.md"; run
ok "planted: a skill front matter model haiku fails" "$([ $r = 1 ] && echo "$out" | grep -q 'front matter model: haiku' && echo 1)" "exit $r: $out"
finish
