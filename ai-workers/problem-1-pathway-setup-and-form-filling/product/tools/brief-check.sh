#!/usr/bin/env bash
# Every brief and every PR body (P-611, row G-4 (3); P-526, P-606): a "Done when" that names how it is proved (a test,
# a check, an exit code), and a "Duplicate check:" line. With --brief (a lane start, G-4 (7), P-608) also one line
# naming the model and the effort, e.g. "Model: Opus 5.5, effort: medium". Reads the text on stdin; exit 1 with what is
# missing. Used by lane-preflight.sh --hook (briefs) and .github/workflows/pr-rules.yml (PR bodies). Test: check-g4-rules.sh.
set -u
txt=$(tr -d '\r'); bad=""
done_when=$(printf '%s\n' "$txt" | grep -i -A3 'done when' | head -4)
if [ -z "$done_when" ]; then bad="$bad no \"Done when\";"
elif ! printf '%s\n' "$done_when" | grep -qiE 'test|check|exit|pass|fail|\.(sh|ts|mjs|py)|run'; then bad="$bad \"Done when\" names no test, check or exit code;"; fi
printf '%s\n' "$txt" | grep -qE '^[[:space:]*>-]*Duplicate check:[[:space:]]*[^[:space:]]' || bad="$bad no \"Duplicate check:\" line;"
if [ "${1:-}" = --brief ]; then
  printf '%s\n' "$txt" | grep -iE '(opus|fable|sonnet|haiku)' | grep -qiE 'effort[ :=*]*(low|medium|high|xhigh|max)|(low|medium|high|xhigh|max)[ -]effort' \
    || bad="$bad no model and effort line (one line naming both, e.g. \"Model: Opus 5.5, effort: medium\", P-608);"
fi
[ -z "$bad" ] && exit 0
echo "MISSING:${bad%;}."; exit 1
