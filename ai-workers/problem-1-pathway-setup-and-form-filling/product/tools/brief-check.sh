#!/usr/bin/env bash
# Every brief and every PR body (P-611, row G-4 (3); P-526, P-606): a "Done when" that names how it is proved (a test,
# a check, an exit code), and a "Duplicate check:" line. With --brief (a lane start, G-4 (7), P-608) also one line
# naming the model and the effort, e.g. "Model: Opus 5.5, effort: medium"; a start brief that names no backlog row
# ("Row X-1", "/next screens B124") needs only that line. Reads the text on stdin; exit 1 with what is
# missing. Used by lane-preflight.sh --hook (briefs) and .github/workflows/pr-rules.yml (PR bodies). Test: check-g4-rules.sh.
set -u
txt=$(tr -d '\r'); bad=""
# Only the Done when's own text counts: its line, then lines up to a blank line, a heading or the Duplicate check line.
done_when=$(printf '%s\n' "$txt" | awk 'f && (/Duplicate check:/ || /^#/) {exit} f && /^[[:space:]]*$/ {if (n) exit; next}
  !f && tolower($0) ~ /done when/ {f = 1; l = $0; sub(/.*[Dd][Oo][Nn][Ee] [Ww][Hh][Ee][Nn]/, "", l); print l; if (l ~ /[^[:space:]:*#]/) n = 1; next}
  f {print; n = 1}')
row=1; [ "${1:-}" = --brief ] && ! printf '%s\n' "$txt" | grep -qE '(^|[^A-Za-z])([Rr]ow|/next [a-z]+) [A-Z][A-Za-z]*-?[0-9]' && row=0
if [ "$row" = 0 ]; then :   # a start that names no backlog row (a standby, the desk, /qa, /next): model and effort only
elif ! printf '%s\n' "$txt" | grep -qi 'done when'; then bad="$bad no \"Done when\";"
elif ! printf '%s\n' "$done_when" | grep -qiE 'test|check|exit|pass|fail|\.(sh|ts|mjs|py)|run'; then bad="$bad \"Done when\" names no test, check or exit code;"; fi
[ "$row" = 0 ] || printf '%s\n' "$txt" | grep -qE '^[[:space:]*>-]*Duplicate check:[[:space:]]*[^[:space:]]' || bad="$bad no \"Duplicate check:\" line;"
if [ "${1:-}" = --brief ]; then
  printf '%s\n' "$txt" | grep -iE '(opus|fable|sonnet|haiku)' | grep -qiE 'effort[ :=*]*(low|medium|high|xhigh|max)|(low|medium|high|xhigh|max)[ -]effort' \
    || bad="$bad no model and effort line (one line naming both, e.g. \"Model: Opus 5.5, effort: medium\", P-608);"
fi
[ -z "$bad" ] && exit 0
echo "MISSING:${bad%;}."; exit 1
