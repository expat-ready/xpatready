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
# P-801 (founder 14:4x and 15:1x IST 22 Nov; ENF-798): domain values come from sources, never from a founder question.
# (a) A brief (--brief) that states a domain value (a rate, fee, day count, threshold, province rule, form or program name)
# needs a "Source:" line naming a requirement path, an official URL with a quoted line and a date, or a market-research
# note. (b) Any text with a "Question for the founder" needs a "Sources checked:" line. Tests: test-enf-798.sh.
plain=$(printf '%s\n' "$txt" | sed -E 's/US\$ ?[0-9][0-9.,]*//g')
dom=$(printf '%s\n' "$plain" | grep -vE '^[[:space:]*>-]*Sources?( checked)?[*]*:' | python3 -I -c '
import re, sys
P = [("form", r"\b(IMM|EMP|CIT|PRC)[ -]?\d{4}[A-Z]?\b", 0),
  ("program", r"\b(express entry|federal skilled (worker|trades)|canadian experience class|provincial nominee|PNP|OINP|start-?up visa|super visa|study permit|work permit|visitor visa|post-graduation work permit|PGWP|spous(al|e) sponsorship|family sponsorship|caregiver program|LMIA|temporary resident visa|permanent resident card)\b", re.I),
  ("province rule", r"\b(ontario|quebec|québec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|nunavut|northwest territories)\b", re.I),
  ("fee", r"(\bfees?\b[^\n]{0,40}\$ ?\d|\bCA?\$ ?\d|\bCAD ?\d|\d ?CAD\b)", re.I),
  ("rate", r"(?=.*\b(tax|GST|HST|PST|QST|rate|interest)\b).*\d+(\.\d+)? ?%", re.I),
  ("day count", r"(?=.*\b(processing|valid(ity)?|deadline|expir\w*|biometric\w*|stay|residen\w*|physically present|IRCC|ESDC|refund|notice period|retention)\b).*\b\d+ ?(calendar |business |working )?days?\b", re.I),
  ("threshold", r"(\b(CRS|CLB|NCLC|NOC|TEER|LICO|IELTS|CELPIP|TEF)\b.*\d|\bminimum (score|income|funds)\b)", 0)]
hits = []
for line in sys.stdin:
    for name, rx, fl in P:
        m = re.search(rx, line, fl)
        if m and name not in [h[0] for h in hits]:
            hits.append((name, m.group(0).strip()[:30]))
print("; ".join(f"{n} \"{v}\"" for n, v in hits))')
if [ "${1:-}" = --brief ] && [ -n "$dom" ]; then
  src=$(printf '%s\n' "$txt" | grep -m1 -E '^[[:space:]*>-]*Sources?[*]*:' | sed -E 's/^[[:space:]*>-]*Sources?[*]*:[[:space:]*]*//')
  if [ -z "$src" ]; then bad="$bad states a domain value ($dom) with no \"Source:\" line (a requirement path, an official URL with quote and date, or a market-research note; P-801);"
  elif ! printf '%s' "$src" | grep -qiE 'requirements-|drive-snapshot|domain/|market[- ]research' \
    && ! { printf '%s' "$src" | grep -qE 'https?://[^ ]+' && printf '%s' "$src" | grep -qE '["“”]' \
           && printf '%s' "$src" | grep -qE '[0-9]{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* [0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2}'; }; then
    bad="$bad a \"Source:\" line that is neither a requirement path, an official URL with a quoted line and a date, nor a market-research note (got: ${src:0:80}; P-801);"
  fi
fi
if printf '%s\n' "$txt" | grep -iE '^[[:space:]#*>0-9.-]*questions? for the founder' | grep -qviE 'founder[*]*:?[[:space:]*]*(none|no)\b' && ! printf '%s\n' "$txt" | grep -qE '^[[:space:]*>-]*Sources checked[*]*:[[:space:]*]*[^[:space:]*]'; then
  bad="$bad a \"Question for the founder\" with no \"Sources checked:\" line (requirements, official pages, market research checked first; P-801);"
fi
[ -z "$bad$wave" ] && exit 0
[ -n "$bad" ] && echo "MISSING:${bad%;}."
[ -n "$wave" ] && echo "$wave"
exit 1
