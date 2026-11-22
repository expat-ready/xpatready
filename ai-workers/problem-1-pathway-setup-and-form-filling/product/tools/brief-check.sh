#!/usr/bin/env bash
# Every brief and every PR body (P-611, row G-4 (3); P-526, P-606): a "Done when" that names how it is proved (a test,
# a check, an exit code), and a "Duplicate check:" line. With --brief (a lane start, G-4 (7), P-608) also one line
# naming the model and the effort, e.g. "Model: Opus 5.5, effort: medium"; a start brief that names no backlog row
# ("Row X-1", "/next screens B124") needs only that line. A start brief that names a row or an R1 item also needs a line
# "Item: R1.x" (several: "Item: R1.4, R1.8") or "Item: none (tooling|qa|records|lead)" (only when its own row has that
# BACKLOG area, or it names no row), and each item must be in a wave open
# for lane starts (waves.py allow; B204, P-745), else "OUTSIDE WAVE: ...". Reads the text on stdin; exit 1 with what is
# missing. Used by lane-preflight.sh --hook (briefs) and .github/workflows/pr-rules.yml (PR bodies). Tests: check-g4-rules.sh; the Item line and waves: check-lane-preflight.sh.
set -u
txt=$(tr -d '\r'); bad=""
# ENF-803 (P-803): a start brief's "Duplicate check:" names the origin/main sha and the exact IST time it was read, and a
# cited qa note is not older than the newest merge on the row's files (brief-fresh.py; test-enf-803.sh).
[ "${1:-}" = --brief ] && { fr=$(printf '%s\n' "$txt" | python3 -I "$(dirname "$0")/brief-fresh.py" 2>&1) || bad="$bad $(printf '%s' "${fr:-brief-fresh.py could not run}" | paste -sd ';' -);"; }
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
wave=""
if [ "${1:-}" = --brief ] && { [ "$row" = 1 ] || printf '%s\n' "$txt" | grep -qE '(^|[^A-Za-z0-9.])R1\.[0-9]'; }; then
  # B204 (P-745, founder 20 Nov: "enforceable and ... followed mandatory by the agents through the hooks"): what the lane is for.
  item=$(printf '%s\n' "$txt" | grep -m1 -E '^[[:space:]*>0-9.-]*Item[*]*:' | sed -E 's/^[[:space:]*>0-9.-]*Item[*]*:[[:space:]*]*//; s/[[:space:]*.]*$//')
  if [ -z "$item" ]; then bad="$bad no \"Item:\" line (\"Item: R1.x\", or \"Item: none (tooling)\", \"(qa)\", \"(records)\" or \"(lead)\"; B204, P-745);"
  elif printf '%s' "$item" | grep -qiE '^none \((tooling|qa|records|lead)\)$'; then
    # "none" only for a brief whose own row is tooling, qa, records or Lead in BACKLOG, or that names no row (waves.py none-ok)
    why=$(printf '%s\n' "$txt" | python3 -I "$(dirname "$0")/waves.py" none-ok 2>&1) || bad="$bad \"Item: $item\": ${why:-waves.py could not run};"
  elif printf '%s' "$item" | grep -qE '^R1\.[0-9]+([[:space:]]*,[[:space:]]*R1\.[0-9]+)*$'; then
    # fail closed: a waves.py that cannot run refuses the start, with its own words
    wave=$(python3 -I "$(dirname "$0")/waves.py" allow $(printf '%s' "$item" | tr ',' ' ') 2>&1) && wave="" || wave=${wave:-"OUTSIDE WAVE: waves.py could not run, so the item was not checked."}
  else bad="$bad an \"Item:\" line that is neither R1 items (\"Item: R1.4, R1.8\") nor \"none (tooling|qa|records)\" (got: $item);"; fi
fi
# P-801 (founder 14:4x and 15:1x IST 22 Nov; ENF-798): a brief stating a domain value needs a "Source:" line, and any
# "Question for the founder" a "Sources checked:" line (source-check.py). Fails closed: a check that cannot run refuses.
src=$(printf '%s\n' "$txt" | python3 -I "$(dirname "$0")/source-check.py" ${1:-} 2>&1); rc=$?
if [ "$rc" = 1 ] && [ -n "$src" ]; then bad="$bad $src"
elif [ "$rc" != 0 ]; then bad="$bad the P-801 source check could not run (exit $rc: ${src:0:80});"; fi
[ -z "$bad$wave" ] && exit 0
[ -n "$bad" ] && echo "MISSING:${bad%;}."
[ -n "$wave" ] && echo "$wave"
exit 1
