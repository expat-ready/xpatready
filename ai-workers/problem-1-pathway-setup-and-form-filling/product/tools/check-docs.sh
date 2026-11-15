#!/bin/bash
# Keeps agent instructions small and links working (P-188, P-189): skills and agents under 100 lines and 10 KB (P-203: over it, merge duplicates only, never cut a unique rule; overflow moves to WAY-OF-WORKING.md with a pointer), root
# CLAUDE.md/AGENTS.md under 60 lines (long instruction files lower agents' success: design/research-agent-teams-2026-10-31.md);
# records have no size limit (git history is the archive); backticked product paths must exist next to the citing file,
# in the product or problem folder, or at the root. Prints problems; exit 1 if any. Used by the Stop hook and the tech lead.
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"; PH="$ROOT/ai-workers/problem-1-pathway-setup-and-form-filling/product"
out=$(mktemp "${TMPDIR:-/tmp}/check-docs.XXXXXXXX"); trap 'rm -f "$out"' EXIT
check() { local max=$1 kb=$2; shift 2; for f in "$@"; do [ -f "$f" ] || continue; n=$(wc -l < "$f"); b=$(wc -c < "$f")
  [ "$n" -gt "$max" ] && echo "TOO LONG ($n lines > $max): ${f#$ROOT/}"
  [ "$kb" -gt 0 ] && [ "$b" -gt $((kb * 1024)) ] && echo "TOO BIG ($((b / 1024)) KB > $kb KB): ${f#$ROOT/}"; done; }
{
  check 100 10 "$ROOT"/.claude/skills/*/SKILL.md "$ROOT"/.claude/agents/*.md
  check 60 0 "$ROOT/CLAUDE.md" "$ROOT/AGENTS.md"
  # STATE.md (or else the newest origin/lead/* branch's) names the current Lead on exactly one line, so every lane can
  # find whom to report to (founder, 6 Nov ~03:00 IST: "a hard rule and it never messes up"; tools/current-lead.sh reads it; test: check-current-lead.sh).
  S="$PH/STATE.md"
  if [ -f "$S" ]; then
    n=$(grep -c '^current_lead: ' "$S")
    # The tech lead keeps STATE on its lead/* branch (P-336), so main's STATE.md may carry no line: then the line must be
    # on an origin/lead/* branch, read by current-lead.sh (no fetch here; a copy without those refs: git fetch origin
    # 'refs/heads/lead/*:refs/remotes/origin/lead/*').
    if [ "$n" -eq 0 ]; then
      w=$(bash "$PH/tools/current-lead.sh" --no-fetch --where 2>&1); v=$(bash "$PH/tools/current-lead.sh" --no-fetch 2>/dev/null)
      case "$w" in
        refs/remotes/origin/lead/*) echo "$v" | grep -qE '^[A-Za-z]+_[A-Za-z0-9_-]{8,} .*Lead [0-9]+' || echo "CURRENT LEAD: the current_lead line on ${w#refs/remotes/} needs a session id, then a title naming \"Lead N\"";;
        *) echo "CURRENT LEAD: STATE.md has 0 current_lead lines and current-lead.sh read none from an origin/lead/* branch (it read: $w), needs exactly one (current_lead: <session id> <title>)";;
      esac
    fi
    [ "$n" -gt 1 ] && echo "CURRENT LEAD: STATE.md has $n current_lead lines, needs exactly one (current_lead: <session id> <title>)"
    [ "$n" -eq 1 ] && ! grep -qE '^current_lead: [A-Za-z]+_[A-Za-z0-9_-]{8,} .*Lead [0-9]+' "$S" && echo "CURRENT LEAD: STATE.md's current_lead line needs a session id, then a title naming \"Lead N\""
    # One page (6 Nov: it reached 34 KB and every Lead re-read it; test: check-state-page.sh).
    b=$(wc -c < "$S"); [ "$b" -gt 12288 ] && echo "STATE TOO BIG ($((b / 1024)) KB > 12 KB): move the earlier page to product/history/STATE-<date>-<time>-<lead>.md and keep one page"
  fi
  # P-440 (9 Nov, founder): RULES.md is a new Lead's start read; it may lag DECISIONS by at most 3 rows, so a new Lead
  # never again reads ~85 rows (~75k tokens) at start. Test: check-rules-lag.sh.
  R="$PH/RULES.md"; D="$PH/DECISIONS.md"
  if [ -f "$R" ] && [ -f "$D" ]; then
    a=$(sed -nE '1s/.*as of \*\*P-([0-9]+)\*\*.*/\1/p' "$R"); t=$(grep -oE '^\| P-[0-9]+ ' "$D" | grep -oE '[0-9]+' | sort -n | tail -1)
    if [ -z "$a" ]; then echo "RULES LAG: RULES.md's first line needs 'as of **P-NNN**'"
    elif [ -n "$t" ] && [ $((t - a)) -gt 3 ]; then echo "RULES LAG: RULES.md is as of P-$a but DECISIONS reaches P-$t ($((t - a)) rows behind, at most 3): fold the newer rows into RULES.md, keep the old page in product/history/ (P-440)"; fi
  fi
  # P-611, P-615 (row G-3): RULES.md is a rule register, one row per rule `| ID | Rule | Enforced by | As of |` under that
  # header; a row with no enforcer field (a hook, CI step, script, or "prose") or a page over 25 KB fails, so the start
  # read stays small and every rule says what enforces it. Long text goes to product/rules/*.md. Test: check-rule-register.sh.
  if [ -f "$R" ]; then
    b=$(wc -c < "$R"); [ "$b" -gt 25600 ] && echo "RULES TOO BIG ($((b / 1024)) KB > 25 KB): move long text word for word to product/rules/<topic>.md and keep one line per rule (P-611)"
    grep -qE '^\| ID \| Rule \| Enforced by \| As of \|' "$R" || echo "RULES REGISTER: RULES.md has no '| ID | Rule | Enforced by | As of |' table (P-611)"
    # A header spelled differently would leave its rows unchecked.
    grep -nE '^\| *ID *\|' "$R" | grep -vE '^[0-9]+:\| ID \| Rule \| Enforced by \| As of \|$' | sed 's/^\([0-9]*\):.*/RULES REGISTER: line \1 is a register header not spelled exactly "| ID | Rule | Enforced by | As of |"/'
    awk -F'|' '/^\| ID \| Rule \| Enforced by \| As of \|/ { t = 1; next } t && /^\|-/ { next }
      t && /^\|/ { for (i = 2; i <= 5; i++) { c[i] = $i; gsub(/^[ \t]+|[ \t]+$/, "", c[i]) }
        if (NF != 6) { print "RULES REGISTER: line " NR " needs exactly 4 cells (ID | Rule | Enforced by | As of): " substr($0, 1, 60); next }
        if (c[2] !~ /^[A-Z]+-[0-9A-Za-z.]+$/) print "RULES REGISTER: line " NR " has no rule ID (like P-611, P-611b or IDX-1): " substr($0, 1, 60)
        else if (seen[c[2]]++) print "RULES REGISTER: rule ID " c[2] " appears twice (line " NR ")"
        if (c[3] == "") print "RULES REGISTER: " c[2] " has no rule text"
        if (c[4] !~ /^((hook|CI|script): [^ ]|prose( |$))/) print "RULES REGISTER: " c[2] " has no enforced-by (hook: <name>, CI: <name>, script: <name> or prose), found \"" c[4] "\""
        if (c[5] == "") print "RULES REGISTER: " c[2] " has no as-of"; next }
      { t = 0 }' "$R"
  fi
  for f in "$PH"/*.md "$PH"/domain/*.md "$PH"/rules/*.md "$ROOT"/.claude/skills/*/SKILL.md "$ROOT"/.claude/agents/*.md; do
    grep -o '`[A-Za-z0-9_./-]*\.md`' "$f" | tr -d '`' | sort -u | while read -r ref; do
      # Retired files (P-188, P-189) live in git history; old decision rows and records may still name them.
      case "$ref" in WORKFLOW.md|LANES.md|CHARTER.md|LEAD.md|RETRO.md|WAVE-1.md|SCREENS.md|REQUESTS.md|PLAN.md|WAY-OF-WORKING-draft.md|TEAM.md) continue;; esac
      case "$ref" in */NN*|*NN-*|*"<"*|concept.md|challenge.md|build-notes.md|review.md|break-report.md|lead-check.md|plan.md|journey-test.md|concept-draft.md) continue;; esac
      [ -f "$PH/$ref" ] || [ -f "$ROOT/$ref" ] || [ -f "$(dirname "$f")/$ref" ] || [ -f "$PH/domain/$ref" ] || [ -f "$PH/../$ref" ] || echo "MISSING LINK in ${f#$ROOT/}: $ref"
    done
  done
} | sort -u > "$out"
# Times are read, not guessed (6 Nov): a warning, never a failure, when STATE's "updated: YYYY-MM-DD HH:MM IST" is more
# than 30 minutes from the time it was committed (now, while STATE.md has uncommitted changes). Test: check-state-page.sh.
if [ -f "$PH/STATE.md" ]; then
  u=$(sed -nE 's/^updated: ([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}) IST.*/\1/p' "$PH/STATE.md" | head -1)
  c=$(cd "$PH" && git diff --quiet HEAD -- STATE.md 2>/dev/null && git log -1 --format=%ct -- STATE.md 2>/dev/null); [ -n "$c" ] || c=$(date +%s)
  [ -n "$u" ] && python3 -I -c 'import sys, datetime as d
ist = d.timezone(d.timedelta(hours=5, minutes=30))
u = d.datetime.strptime(sys.argv[1], "%Y-%m-%d %H:%M").replace(tzinfo=ist); c = d.datetime.fromtimestamp(int(sys.argv[2]), ist)
m = abs((c - u).total_seconds()) / 60
if m > 30: print("WARN  STATE.md says updated %s IST, but it was committed %s IST (%d min apart): read the time with TZ=Asia/Kolkata date, never guess" % (sys.argv[1], c.strftime("%Y-%m-%d %H:%M"), m))' "$u" "$c"
fi
cat "$out"; [ -s "$out" ] && exit 1; echo "docs OK"; exit 0
