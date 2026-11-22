#!/usr/bin/env bash
# Lead-read gate (P-785 (2) step 1, founder 22 Nov: "nobody can break my main"; P-423). The Lead's read, kept on GitHub's
# side: the commit status "lead-read" on a PR's head. Before this, the read was kept only by the auto-labeller skipping
# the paths of lead-read-paths.txt and by a hook inside each agent copy, and a permission route is not a path: on 22 Nov
# #2897 added @PermissionKeys routes in platform/settings/offices/routes.ts, was labelled and queued, and the Lead's
# read came 14 minutes before the merge (design/open-contribution-gate-2026-11-22.md).
# A PR keeps the Lead's read when
#   (a) a changed path (either side of a rename) matches lead-read-paths.txt, the one list (.github/, .mergify.yml, the
#       guards, the schema, migrations, money, and the permission machinery itself: platform/identity/, core.ts, the firm
#       wall, the terms gate). When the list carries the line "# --- records-exempt" (#2428), the lines after it (money,
#       permissions) are not set off by a screenshot (*.png under screens/) or by an image or .txt under product/
#       outside product/tools/; every line before it holds for any file; or
#   (b) an added or removed line of an API source or data file (studio/api/src/**.{ts,tsx,mts,cts,js,mjs,cjs,json},
#       studio/samples/**.json; either name of a rename) declares access: @PermissionKeys(, @AnyStaff(, @StaffSignIn(,
#       @OwnOrAll(, or a permission key written in a string ("agent/<area>:<verb>", "system/…", a template such as
#       `agent/${area}:list`, or "agent/" + …); or it is any changed line of a walled module's routes, keys or guard
#       file, or a route line (@Get( @Post( @Put( @Patch( @Delete( @All() anywhere in a walled module (api/src/platform/,
#       front-office/, client-money/: every route there declares its access, platform/identity/keys.ts). Read from the
#       patch GitHub gives with the file list: the PR's code is never checked out or run. Such a file whose patch GitHub
#       does not give (too large) counts, and so does a PR of 3000 files or more (the list is cut there).
# Rule (b) is a tripwire, not a wall: a key encoded on purpose ("agent\/x", a join, a computed constant) passes it, as a
# status can be forged (header below); the Lead's read and the reviewer remain the boundary (break round 2 m1).
# Such a PR is read when a PR comment has a line, alone on it (a trailing full stop allowed), naming the FULL head SHA:
#   Lead read the diff: <the head's 40 hex characters>      (the in-copy hook's form, lead-read-guard.sh, P-637)
# ("Lead read: OK <40 hex>" counts the same; a short SHA does not: a commit can be ground
# to match a 7 or 9 character prefix, break M3). Counted only from a writer (OWNER, MEMBER, COLLABORATOR) and, when the
# repository variable LEAD_LOGINS (logins, separated by spaces or commas, any case) is set, only from those logins and
# never the PR's author: a PR opened by a LEAD_LOGINS account can then never be freed by its own comment, so it must be
# an account only the Lead uses (never today's shared one, which would hold every PR). An
# edited comment never counts (anyone with write access can edit another's comment, and GitHub keeps its first
# author's association); a quoted line, a line inside a code fence or an HTML comment is not the Lead's own. A new push
# needs a new read. Today every session comments as one account (design gap 3): the line proves it was written, not who
# wrote it, until LEAD_LOGINS names an account only the Lead uses.
#   judge   prints "OK <why>", "HOLD <why>" or "SKIP <why>"; exit 0, 1, 0 (2 when GitHub cannot be read: fails closed)
#   status  judge, then sets the status: success; failure when held (LEAD_READ_GATE=block) or unreadable; while
#           LEAD_READ_GATE=report (the default: a new blocking check starts report-only, P-717 (b)) a held PR is
#           "pending" with what would hold it, which no queue condition reads. Any other value counts as block.
#   event   status for the PR of GITHUB_EVENT_PATH (pull_request_target, issue_comment)
#   sweep   status for every open PR into main (by hand: workflow_dispatch)
# The queue condition that makes it bite and the switch to block are a later PR of their own, after 24 h or 10 clean
# runs. That PR must (1) use "check-success = lead-read" (a missing status must hold, break M6), and (2) not trust the
# status alone: a commit status can be posted by any job holding statuses: write, including a same-repository PR's own
# pull_request job, so main's queue-gate.sh runs "lead-read-gate.sh judge" itself before it labels (break M5).
# Kill switch then: the repository variable LEAD_READ_GATE=report.
# Env: GH_TOKEN, REPO (owner/name), PR (judge, status); LEAD_READ_GATE; LEAD_LOGINS; LEAD_READ_PATHS (the test's
# stand-in); API (default https://api.github.com). Test: check-lead-read-gate.sh.
set -uo pipefail
API="${API:-https://api.github.com}"; CTX="lead-read"
MODE=$(printf '%s' "${LEAD_READ_GATE:-report}" | tr 'A-Z' 'a-z'); case "$MODE" in report|block) ;; *) MODE=block;; esac   # an unknown value fails closed
HERE=$(cd "$(dirname "$0")" && pwd); LIST="${LEAD_READ_PATHS:-$HERE/lead-read-paths.txt}"
for v in GH_TOKEN REPO; do [ -n "${!v:-}" ] || { echo "lead-read-gate: $v is not set"; exit 2; }; done
H=$(mktemp); trap 'rm -f "$H" "$H.hard" "$H.soft"' EXIT; chmod 600 "$H"   # the token in a file, not on curl's command line (seen by ps)
printf 'Authorization: Bearer %s\nAccept: application/vnd.github+json\n' "$GH_TOKEN" > "$H"
api() { curl -sS --fail-with-body -H @"$H" "$@"; }
pages() { local p=1 all='[]' one sep='?'; case "$1" in *\?*) sep='&';; esac
  while [ "$p" -le 30 ]; do one=$(api "$API/$1${sep}per_page=100&page=$p") || return 1
    all=$(jq -s '.[0] + .[1]' <(echo "$all") <(echo "$one")) || return 1; [ "$(echo "$one" | jq length)" -lt 100 ] && break; p=$((p + 1))
  done; echo "$all"; }
SRC='/prototype/studio/(api/src/.*\.([cm]?[jt]sx?|json)|samples/.*\.json)$'
WALLED='/prototype/studio/api/src/(platform|front-office|client-money)/'; WHOLE='/[^/]*(routes|controller|keys|guard)[^/]*\.[cm]?[jt]sx?$'   # matched without regard to case
Q='["'"'"'`]'
ACCESS='@(PermissionKeys|AnyStaff|StaffSignIn|OwnOrAll)\s*\(|'"$Q"'(agent|system)/([a-z][a-z0-9-]*:[a-z$]|'"$Q"'|\$\{|[a-z][a-z0-9-]*:?(\$\{|'"$Q"'\s*\+))'
ROUTE='@(Get|Post|Put|Patch|Delete|All)\s*\('
tick() { awk 'NR <= 3' | sed 's/.*/`&`/' | paste -sd ' ' -; }

paths() {  # stdin: changed paths → those that keep the Lead's read by the list (a)
  local f
  awk '/^# --- records-exempt/ {exit} !/^#/ && NF' "$LIST" > "$H.hard"; awk 'f && !/^#/ && NF; /^# --- records-exempt/ {f = 1}' "$LIST" > "$H.soft"
  while IFS= read -r f; do [ -n "$f" ] || continue
    if grep -qiEf "$H.hard" <<< "$f"; then printf '%s\n' "$f"; continue; fi
    [ -s "$H.soft" ] && grep -qiEf "$H.soft" <<< "$f" || continue
    grep -qiE '(^|/)screens/([^/]+/)*[^/]+\.png$' <<< "$f" && continue
    if ! grep -qiE '/product/tools/' <<< "$f" && grep -qE '^ai-workers/problem-1-pathway-setup-and-form-filling/product/([^/]+/)*[^/]+\.(png|jpe?g|gif|webp|svg|txt)$' <<< "$f"; then continue; fi
    printf '%s\n' "$f"; done; }

judge() {  # PR → verdict (OK|HOLD|SKIP), why, head; returns 0, 1, 0; 2 with why when GitHub or the list cannot be read
  local pr files names hit lines cs author; verdict=""; head=""
  pr=$(api "$API/repos/$REPO/pulls/$PR") || { why="the PR cannot be read"; return 2; }
  head=$(jq -r '.head.sha // empty' <<< "$pr"); [[ "$head" =~ ^[0-9a-f]{40}$ ]] || { why="the PR's head cannot be read"; return 2; }
  [ "$(jq -r .base.ref <<< "$pr")" = main ] || { verdict=SKIP; why="its base is not main"; return 0; }
  # Mergify's own batch PR only: its bot opened it from this repository (a branch name alone is anyone's choice, break B1)
  if [ "$(jq -r --arg r "$REPO" '(.head.ref | startswith("mergify/")) and .user.login == "mergify[bot]" and .head.repo.full_name == $r' <<< "$pr")" = true ]; then
    verdict=OK; why="a merge-queue batch: each of its PRs is judged by itself"; return 0; fi
  author=$(jq -r '.user.login // ""' <<< "$pr")
  [ -r "$LIST" ] && grep -qv '^#' "$LIST" || { why="lead-read-paths.txt cannot be read"; return 2; }
  files=$(pages "repos/$REPO/pulls/$PR/files") && jq -e 'type == "array"' <<< "$files" >/dev/null || { why="its files cannot be read"; return 2; }
  if [ "$(jq length <<< "$files")" -ge 3000 ]; then hit="3000 files or more (GitHub lists no more)"; else
    names=$(jq -r '.[] | .filename, (.previous_filename // empty)' <<< "$files")
    hit=$(paths <<< "$names" | tick)
    # (b) the lines that declare access, from each API source or data file's patch (either name); a missing patch counts
    lines=$(jq -r --arg src "$SRC" --arg walled "$WALLED" --arg whole "$WHOLE" --arg access "$ACCESS" --arg route "$ROUTE" '.[]
      | [.filename, (.previous_filename // empty)] as $n
      | select(any($n[]; test($src))) | . as $f | (any($n[]; test($walled))) as $w | ($w and any($n[]; test($whole; "i"))) as $all
      | if ($f.patch // "") == "" then (if (($f.changes // 0) > 0 or $f.status == "added" or $f.status == "removed") then $f.filename + " (its patch is too large for GitHub to give)" else empty end)
        else first(
          # one hunk at a time: a hunk with a changed line counts when any of its lines, context included, declares access
          # (a decorator split over lines keeps @PermissionKeys( in the context of its changed argument, break round 2 M1)
          ($f.patch | split("\n") | reduce .[] as $l ([[]]; if ($l | startswith("@@")) then . + [[]] else .[-1] += [$l] end) | .[]
           | select(any(.[]; test("^[+-]")))
           | select($all or any(.[]; test($access)) or ($w and any(.[]; test($route)))))
          | $f.filename + " (a permission key, a guarded route or a walled routes, controller, keys or guard file)") // empty end' <<< "$files" | tick) \
      || { why="its patches cannot be read"; return 2; }
    hit=$(printf '%s %s' "$hit" "$lines" | sed 's/^ *//; s/ *$//')
  fi
  [ -n "$hit" ] || { verdict=OK; why="no path or line that keeps the Lead's read"; return 0; }
  cs=$(pages "repos/$REPO/issues/$PR/comments") || { why="its comments cannot be read"; return 2; }
  # Who counts (header); then code fences and HTML comments are dropped, and markdown marks around the words.
  if jq -r --arg who "${LEAD_LOGINS:-}" --arg author "$author" '($who | ascii_downcase | [splits("[\\s,]+")] | map(select(length > 0))) as $leads | ($author | ascii_downcase) as $author | .[]
      | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")
      | select(($leads | length) == 0 or ((.user.login // "" | ascii_downcase) as $l | ($leads | index($l)) != null and $l != $author))
      | select(.created_at != null and (.updated_at // .created_at) == .created_at)
      | (.body // "") | gsub("<!--[\\s\\S]*?(-->|$)"; "") | gsub("```[\\s\\S]*?(```|$)"; "") | gsub("~~~[\\s\\S]*?(~~~|$)"; "")' <<< "$cs" \
      | tr -d '*_`\r' | grep -v -e '^    ' -e "^$(printf '\t')" | grep -iE '^[[:space:]]*Lead read(: *OK| the diff:?)[[:space:]]+[0-9a-f]{40}[[:space:]]*\.?[[:space:]]*$' | grep -oiE '[0-9a-f]{40}' | tr 'A-F' 'a-f' | grep -x "$head" >/dev/null; then
    verdict=OK; why="the Lead read ${head:0:9} ($hit)"; return 0; fi
  # The line to write comes first: a status description keeps only 140 characters (review round 2, R2-2).
  verdict=HOLD; why="needs the line \"Lead read the diff: $head\" (P-423, alone on its line): $hit"; return 1; }

status() {  # judge, then the status on the head
  local r s; judge; r=$?
  case "$r" in
    0) [ "$verdict" = SKIP ] && { echo "#$PR: SKIP $why"; return 0; }; s=success;;
    1) if [ "$MODE" = block ]; then s=failure; else s=pending; why="report-only, would hold: $why"; fi;;
    *) echo "#$PR: $why"; [ -n "$head" ] || return 2; s=failure; why="$why, so the Lead's read cannot be checked (fails closed)";;
  esac
  api -X POST "$API/repos/$REPO/statuses/$head" -d "$(jq -n --arg s "$s" --arg d "${why:0:139}" --arg c "$CTX" '{state: $s, description: $d, context: $c}')" >/dev/null \
    && echo "#$PR ${head:0:9}: $CTX $s ($why)" || { echo "#$PR: could not set $CTX"; return 2; }
  [ "$r" = 2 ] && return 2; return 0; }

case "${1:-}" in
  judge) [ -n "${PR:-}" ] || { echo "lead-read-gate: PR is not set"; exit 2; }; judge; r=$?; [ "$r" = 2 ] && { echo "$why"; exit 2; }; echo "$verdict $why"; exit $r;;
  status) [ -n "${PR:-}" ] || { echo "lead-read-gate: PR is not set"; exit 2; }; status; exit $?;;
  event) ev="${GITHUB_EVENT_PATH:-}"; [ -r "$ev" ] || { echo "lead-read-gate: no event to read"; exit 2; }
    PR=$(jq -r '.pull_request.number // (if .issue.pull_request then .issue.number else empty end) // empty' "$ev")
    [[ "$PR" =~ ^[0-9]+$ ]] || { echo "this event names no pull request: nothing to judge"; exit 0; }
    status; exit $?;;
  sweep) all=$(pages "repos/$REPO/pulls?state=open&base=main") || { echo "the open PRs cannot be read"; exit 2; }
    bad=0; for PR in $(jq -r '.[].number' <<< "$all"); do status || bad=2; done; exit $bad;;
  *) echo "usage: lead-read-gate.sh judge|status|event|sweep"; exit 2;;
esac
