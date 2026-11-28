#!/usr/bin/env bash
# Every brief and every PR body (P-611, row G-4 (3); P-526, P-606): a "Done when" that names how it is proved (a test,
# a check, an exit code), and a "Duplicate check:" line. With --brief (a lane start, G-4 (7), P-608) also one line
# naming the model and the effort, e.g. "Model: Opus 5.5, effort: medium" (P-788: only that, or a "P-788 exception:" line); a start brief that names no backlog row
# ("Row X-1", "/next screens B124") needs only that line. A start brief that names a row or an R1 item also needs a line
# "Item: R1.x" (several: "Item: R1.4, R1.8") or "Item: none (tooling|qa|records|lead)" (only when its own row has that
# BACKLOG area, or it names no row), and each item must be in a wave open
# for lane starts (waves.py allow; B204, P-745), else "OUTSIDE WAVE: ...". Reads the text on stdin; exit 1 with what is
# missing. With --brief also a "Do it yourself" section naming the lane's own tools (LR-177). Used by lane-preflight.sh --hook (briefs) and .github/workflows/pr-rules.yml (PR bodies). Tests: check-g4-rules.sh, check-review-converges.sh (LR-121), check-focus-list.sh, check-touch-overlap.sh; the Item line and waves: check-lane-preflight.sh.
set -u
# LR-121 (founder A425; Loops article: "specific completion criteria and explicit turn caps"): a start brief that carries a
# "Done when" also carries a stop rule, e.g. "stop after 3 tries", "at most two rounds", "a two-round cap". PR bodies are
# not asked for it. --self-test proves the rule on fixed texts (check-review-converges.sh runs it; US$0, no network).
N='([0-9]+|one|two|three|four|five|six|seven|eight|nine|ten)'
C="[*_]*$N[*_]*"; U='( failed)? (tries|try|attempts|rounds|runs|turns|failures)'
stop_rule() { grep -qiE "stop (after|at) (at most )?$C$U|(at most|max|up to) $C$U|$C[ -](turn|try|round|attempt)[ -]cap|(turn|try|round|attempt) cap (of )?$C"; }
if [ "${1:-}" = --self-test ]; then
  f=0; t() { if printf '%s\n' "$2" | stop_rule; then got=1; else got=0; fi; [ "$got" = "$1" ] && echo "PASS  $3" || { echo "FAIL  $3"; f=1; }; }
  t 1 "Done when: check.sh exits 0. Stop after 3 tries and ask the Lead." "a numbered stop after N tries"
  t 1 "Done when the test passes; stop after two failed tries" "a stop rule in words"
  t 1 "A review ends in at most two rounds with a verdict." "at most N rounds"
  t 1 "The two-round cap and diff-only re-review stay." "a round cap"
  t 0 "Done when: check.sh exits 0. Context limit ~400k tokens." "a brief with no stop rule is refused"
  t 0 "Stop when it feels done; try again later." "stop with no number is refused"
  t 0 "stop after many tries" "stop after with no count is refused"
  t 1 "Stop at **3** tries; max 3 failures." "stop at, bold count, max N failures"
  t 1 "Up to 2 attempts, then ask." "up to N attempts"
  t 0 "There is no round cap here." "a cap with no count is refused"
  out=$(printf 'Done when: x.sh exits 0.\nContext limit 400k.\n' | bash "$0" --stop-only); r=$?
  [ "$r" = 1 ] && printf '%s' "$out" | grep -q 'stop rule' && echo "PASS  --stop-only refuses, naming the stop rule" || { echo "FAIL  --stop-only refusal (exit $r: $out)"; f=1; }
  out=$(printf 'Done when: x.sh exits 0; stop after 3 tries.\n' | bash "$0" --stop-only); r=$?
  [ "$r" = 0 ] && echo "PASS  --stop-only passes a brief with one" || { echo "FAIL  --stop-only pass (exit $r: $out)"; f=1; }
  out=$(printf 'Standby: wait for the Lead.\n' | bash "$0" --stop-only); r=$?
  [ "$r" = 0 ] && echo "PASS  a brief with no Done when needs no stop rule" || { echo "FAIL  no Done when (exit $r: $out)"; f=1; }
  exit $f
fi
txt=$(tr -d '\r'); bad=""
stop_bad() { printf '%s\n' "$txt" | grep -qi 'done when' && ! printf '%s\n' "$txt" | stop_rule \
  && echo " a \"Done when\" with no stop rule in the brief (e.g. \"stop after 3 tries\", \"at most two rounds\"; LR-121);"; }
# --stop-only: only the LR-121 rule (for the self-test; no git, no network)
[ "${1:-}" = --stop-only ] && { b=$(stop_bad); [ -z "$b" ] && exit 0; echo "MISSING:${b%;}."; exit 1; }
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
  bad="$bad$(stop_bad)"
  # LR-177 (c) (founder A455, 15:5x IST: agents wait instead of doing steps themselves): every lane brief has a "Do it
  # yourself" section (its heading or bold line, then lines up to a blank line or heading) naming the tools the lane uses
  # for its own steps (gh, git, the GitHub tools or API, claude.ai, the built-in browser, the CLI, Playwright, ...).
  diy=$(printf '%s\n' "$txt" | awk '!f && tolower($0) ~ /^[[:space:]#*>-]*do it yourself/ {f = 1; print; next}
    f && /^#/ {exit} f && /^[[:space:]]*$/ {if (n) exit; next} f {print; n = 1}')   # blank lines right after the heading are skipped
  if [ -z "$diy" ]; then bad="$bad no \"Do it yourself\" section naming the tools the lane uses for its own steps (LR-177, founder A455);"
  elif ! printf '%s\n' "$diy" | grep -qiE '(^|[^a-z])(gh|git|github|mcp|api|claude\.ai|claude -p|browser|cli|curl|bash|playwright|mergify)([^a-z]|$)'; then
    bad="$bad a \"Do it yourself\" section that names no tool (e.g. gh, git, the GitHub API, claude.ai, the built-in browser; LR-177);"; fi
  printf '%s\n' "$txt" | grep -iE '(opus|fable|sonnet|haiku)' | grep -qiE 'effort[ :=*]*(low|medium|high|xhigh|max)|(low|medium|high|xhigh|max)[ -]effort' \
    || bad="$bad no model and effort line (one line naming both, e.g. \"Model: Opus 5.5, effort: medium\", P-608);"
  # One model rule (P-788): the line names Opus at medium, unless the brief names why with "P-788 exception:".
  ml=$(printf '%s\n' "$txt" | grep -iE '(opus|fable|sonnet|haiku)' | grep -iE 'effort[ :=*]*(low|medium|high|xhigh|max)|(low|medium|high|xhigh|max)[ -]effort' | head -1)
  if [ -n "$ml" ] && ! printf '%s\n' "$txt" | grep -q 'P-788 exception:'; then
    printf '%s' "$ml" | grep -qiE '(fable|sonnet|haiku)|effort[ :=*]*(low|high|xhigh|max)|(low|high|xhigh|max)[ -]effort' \
      && bad="$bad the model line asks for something other than Opus 5.5 medium (got: $(printf '%s' "$ml" | cut -c1-80)); one rule (P-788), or add \"P-788 exception: <why>\";"
  fi
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
