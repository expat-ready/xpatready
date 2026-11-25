#!/bin/bash
# Stop hook (P-189): before a session stops, (1) a builder or qa copy has not changed the tech lead's files (rules,
# skills, agents, settings, decisions, the backlog), (2) rules files pass check-docs: in any copy but the Lead's, only
# lines about files this branch changed against origin/main block (P-756); lines about the Lead's records alone (WORKFLOW
# LOCK, RULES LAG, RULES register, STATE size) are a warning, enforced by CI on records PRs, (3) explicit any in live code does
# not rise (skipped when studio packages are not installed), (4) in the Lead's copy, the last message does not ask the founder
# to click on GitHub, claude.ai or a console (founder-click-guard.sh, ENF-763). Uncommitted or unpushed work is a note, never a block:
# the pull request is the record (no state file to update on every reply).
input=$(cat); [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ] && exit 0
# The session's own copy comes from the hook input (in builder sessions $CLAUDE_PROJECT_DIR is the main copy).
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
ROOT=$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null) || ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT" || exit 0
PH=ai-workers/problem-1-pathway-setup-and-form-filling/product; APP=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio
reasons=""; notes=""
LANE=$(bash "$PH/tools/lane.sh" whoami 2>/dev/null)
# (1) The tech lead's files: a builder proposes changes in its PR; it never edits them.
base=""; touched=""
if [ "$LANE" != lead ]; then
  base=$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD 2>/dev/null)
  touched=$( { [ -n "$base" ] && git diff --name-only --no-renames "$base" HEAD; git status --porcelain --untracked-files=all | cut -c4- | tr -d '"' | awk '{ n = split($0, a, " -> "); for (i = 1; i <= n; i++) print a[i] }'; } 2>/dev/null | sort -u)
fi
if [ "$LANE" != lead ] && [ "$LANE" != unbound ]; then
  own=$( [ "$LANE" = qa ] && echo "$PH/qa/" )
  lead=$(printf '%s\n' "$touched" | grep -E "^(\.claude/(skills|agents|settings)|\.github/|CLAUDE\.md$|AGENTS\.md$|$PH/[^/]+\.md$|$PH/(decisions|tools)/)" | { [ -n "$own" ] && grep -v "^$own" || cat; } | head -8)
  [ -n "$lead" ] && reasons="- This $LANE copy changed the tech lead's files (rules, skills, settings, decisions, backlog). Undo them (git checkout origin/main -- <file>) and propose the change in your PR or to the tech lead:
$lead
"
fi
# (2) Rules files. P-756: outside the Lead's copy a check-docs line blocks only when it is about a file this branch
# changed against origin/main (or a deleted or renamed file it links to); a line about the Lead's records alone is a
# warning: the lane may not edit them (rule 1) and CI enforces them on records PRs. An E7 register line (#2599) about an
# enforcer file this branch deleted or renamed blocks; E7's "no enforcer file was checked" lines block. A line not recognised here, or no
# origin/main to compare with, still blocks (fail closed).
docs_files() {  # $1 a check-docs line -> the paths (extended regexes, from the root) it is about; none when unknown
  case "$1" in
    "WORKFLOW LOCK:"*) printf '%s\n' "^$PH/DECISIONS\.md$" "^$PH/BACKLOG[^/]*\.md$" "^$PH/qa/CAPABILITIES\.md$" "^$PH/tools/decision-impact\.sh$";;
    "RULES LAG:"*) printf '%s\n' "^$PH/RULES\.md$" "^$PH/DECISIONS\.md$";;
    "RULES REGISTER: "*"no enforcer file was checked"*) ;;   # E7 (#2599) could not run: no paths, so it blocks (fail closed)
    "RULES REGISTER: "*" is enforced by "*", but no such file"*) f=${1#* is enforced by }; f=${f%%, but no such file*}
      printf '%s\n' "^$PH/RULES\.md$"
      printf '^gone:(.*/)?%s$\n' "$(printf '%s' "$f" | sed 's/[.[\*^$()+?{|]/\\&/g')"   # E7: the branch deleted or renamed the enforcer
      ;;
    "RULES REGISTER:"*|"RULES TOO BIG"*) printf '%s\n' "^$PH/RULES\.md$";;
    "RULE MAP:"*) printf '%s\n' "^$PH/RULES\.md$" "^$PH/rules/";;
    "STATE TOO BIG"*) printf '%s\n' "^$PH/STATE\.md$";;
    "START READ:"*) printf '%s\n' "^$PH/LEAD-START\.md$" "^$PH/tools/start-read\.py$" "^$PH/[A-Z][A-Z-]*\.md$" "^\.claude/skills/lead(-watch)?/" "^(CLAUDE|AGENTS)\.md$";;   # OS-16: the page or a file it lists
    "CURRENT LEAD:"*) printf '%s\n' "^$PH/STATE\.md$" "^$PH/tools/current-lead\.sh$";;
    "TOO LONG ("*|"TOO BIG ("*) printf '^%s$\n' "$(printf '%s' "${1#*): }" | sed 's/[.[\*^$()+?{|]/\\&/g')";;
    "MISSING LINK in "*) f=${1#MISSING LINK in }; r=${f#*: }; f=${f%%: *}
      printf '^%s$\n' "$(printf '%s' "$f" | sed 's/[.[\*^$()+?{|]/\\&/g')"
      printf '^gone:(.*/)?%s$\n' "$(basename "$r" | sed 's/[.[\*^$()+?{|]/\\&/g')";;   # the branch deleted or renamed the target
  esac; }
scope=""; [ "$LANE" != lead ] && [ -n "$base" ] && scope=1   # P-756: compare with this branch's files
mineset=$(printf '%s\n' "$touched" | while IFS= read -r f; do [ -n "$f" ] && { echo "$f"; [ -e "$f" ] || echo "gone:$f"; }; done)
if ! docs=$(bash "$PH/tools/check-docs.sh" 2>"${TMPDIR:-/tmp}/stop-check-$$.err"); then
  mine=""; theirs=""
  while IFS= read -r l; do
    case "$l" in ""|WARN*|"docs OK"|"start read: "*) continue;; esac   # OS-16: the start-read total is information
    pats=$(docs_files "$l")
    if [ -z "$scope" ] || [ -z "$pats" ] || printf '%s\n' "$mineset" | grep -qE -f <(printf '%s\n' "$pats"); then mine="$mine$l
"; else theirs="$theirs$l
"; fi
  done <<< "$docs"
  [ -z "$mine$theirs" ] && mine="check-docs.sh failed with no problem line: $(head -c 600 "${TMPDIR:-/tmp}/stop-check-$$.err")"$'\n'   # a crash blocks (fail closed)
  [ -n "$mine" ] && reasons="$reasons- Rules files need attention (fix the links):
$mine"
  [ -n "$theirs" ] && { warn="warning: check-docs fails only on the tech lead's records, which this copy did not change (CI enforces them on records PRs; not blocking): $(printf '%s' "$theirs" | cut -c1-160 | paste -sd ';' - | sed 's/;/; /g')"; notes="$warn"; }
fi
rm -f "${TMPDIR:-/tmp}/stop-check-$$.err"
# (3) STANDARDS §7 "no any": the explicit-any count in live code may only fall.
if [ -f "$APP/node_modules/typescript/lib/typescript.js" ]; then
  NODE="$ROOT/.tools/node-v24.21.0/bin/node"; [ -x "$NODE" ] || NODE=$(command -v node)
  if [ -n "$NODE" ]; then anyc=$("$NODE" "$APP/tools/count-any.mjs" 2>&1) || reasons="$reasons- $anyc
"; fi
else
  echo "stop-check: no studio packages ($APP/node_modules/typescript missing) — skipping the any-count (run npm ci)" >&2
fi
# (4) ENF-763 (P-752/P-763): the Lead's turn does not end asking the founder to click on GitHub, claude.ai or a console.
[ "$LANE" = lead ] && { fc=$(printf '%s' "$input" | bash "$PH/tools/founder-click-guard.sh" 2>/dev/null | jq -r '.reason // empty' 2>/dev/null); [ -n "$fc" ] && reasons="$reasons$fc"$'\n'; }
# (5) ENF-771 (P-771): no turn, in any copy, ends blaming machines, runners or capacity without a measured number.
rc=$(printf '%s' "$input" | bash "$PH/tools/resource-claim-guard.sh" 2>/dev/null | jq -r '.reason // empty' 2>/dev/null); [ -n "$rc" ] && reasons="$reasons$rc"$'\n'
# Notes only: uncommitted app or product changes, unpushed commits.
git status --porcelain -- "$PH" "$APP" 2>/dev/null | grep -q . && notes="${notes:+$notes; }uncommitted changes in this copy: commit and push when the piece is done"
ahead=$(git rev-list --count @{upstream}..HEAD 2>/dev/null) && [ "$ahead" -gt 0 ] && notes="${notes:+$notes; }$ahead unpushed commit(s) on $(git branch --show-current 2>/dev/null)"
[ -z "$reasons" ] && { [ -n "$notes" ] && jq -n --arg m "note: $notes" '{systemMessage:$m}'; exit 0; }
[ -n "$notes" ] && reasons="$reasons- note: $notes (not blocking)
"
jq -n --arg r "$reasons" '{decision:"block",reason:$r}'
