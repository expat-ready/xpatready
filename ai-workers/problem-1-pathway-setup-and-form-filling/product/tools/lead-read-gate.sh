#!/usr/bin/env bash
# Lead-read gate (P-785 (2) step 1, founder 22 Nov: "nobody can break my main"; P-423). The Lead's read, kept on GitHub's
# side: the commit status "lead-read" on a PR's head. Before this, the read was kept only by the auto-labeller skipping
# the paths of lead-read-paths.txt and by a hook inside each agent copy, and a permission route is not a path: on 22 Nov
# #2897 added @PermissionKeys routes in platform/settings/offices/routes.ts, was labelled and queued, and the Lead's
# read came 14 minutes before the merge (design/open-contribution-gate-2026-11-22.md).
# A PR keeps the Lead's read when
#   (a) a changed path (either side of a rename) matches lead-read-paths.txt, the one list (.github/, .mergify.yml, the
#       guards, the schema, migrations, money). When the list carries the line "# --- records-exempt" (#2428), the
#       lines after it (money, permissions) are not set off by a screenshot (*.png under screens/) or by an image or
#       .txt under product/ outside product/tools/; every line before it holds for any file; or
#   (b) an added or removed line of an API source file (studio/api/src/**.ts) declares access: @PermissionKeys(,
#       @AnyStaff(, @StaffSignIn(, @OwnOrAll(, or a quoted permission key ("agent/<area>:<verb>", "system/…"); or a
#       route line (@Get( @Post( @Put( @Patch( @Delete( @All() of a walled module (api/src/platform/, front-office/,
#       client-money/: every route there declares its access, platform/identity/keys.ts). Read from the patch GitHub
#       gives with the file list: the PR's code is never checked out or run. An API source file whose patch GitHub
#       does not give (too large) counts, and so does a PR of 3000 files or more (the list is cut there).
# Such a PR is read when a PR comment by someone with write access (OWNER, MEMBER, COLLABORATOR) has a line
#   Lead read: OK <7 to 40 hex characters of the head SHA>
# ("Lead read the diff: <sha>", the line the Lead writes today, counts the same). A new push needs a new read.
#   judge   prints "OK <why>", "HOLD <why>" or "SKIP <why>"; exit 0, 1, 0 (2 when GitHub cannot be read: fails closed)
#   status  judge, then sets the status: success; failure when held (LEAD_READ_GATE=block) or unreadable; while
#           LEAD_READ_GATE=report (the default: a new blocking check starts report-only, P-717 (b)) a held PR is
#           "pending" with what would hold it, which no queue condition reads.
#   event   status for the PR of GITHUB_EVENT_PATH (pull_request_target, issue_comment)
#   sweep   status for every open PR into main (by hand: workflow_dispatch)
# The queue line that makes it bite (-check-failure = lead-read in .mergify.yml) and the switch to block are a later PR
# of their own, after 24 h or 10 clean runs. Kill switch then: the repository variable LEAD_READ_GATE=report.
# Env: GH_TOKEN, REPO (owner/name), PR (judge, status); LEAD_READ_GATE; LEAD_READ_PATHS (the test's stand-in);
# API (default https://api.github.com). Test: check-lead-read-gate.sh.
set -uo pipefail
API="${API:-https://api.github.com}"; CTX="lead-read"; MODE="${LEAD_READ_GATE:-report}"
HERE=$(cd "$(dirname "$0")" && pwd); LIST="${LEAD_READ_PATHS:-$HERE/lead-read-paths.txt}"
for v in GH_TOKEN REPO; do [ -n "${!v:-}" ] || { echo "lead-read-gate: $v is not set"; exit 2; }; done
H=$(mktemp); trap 'rm -f "$H" "$H.hard" "$H.soft"' EXIT; chmod 600 "$H"   # the token in a file, not on curl's command line (seen by ps)
printf 'Authorization: Bearer %s\nAccept: application/vnd.github+json\n' "$GH_TOKEN" > "$H"
api() { curl -sS --fail-with-body -H @"$H" "$@"; }
pages() { local p=1 all='[]' one sep='?'; case "$1" in *\?*) sep='&';; esac
  while [ "$p" -le 30 ]; do one=$(api "$API/$1${sep}per_page=100&page=$p") || return 1
    all=$(jq -s '.[0] + .[1]' <(echo "$all") <(echo "$one")) || return 1; [ "$(echo "$one" | jq length)" -lt 100 ] && break; p=$((p + 1))
  done; echo "$all"; }
SRC='/prototype/studio/api/src/.*\.ts$'; WALLED='/prototype/studio/api/src/(platform|front-office|client-money)/'
ACCESS='@(PermissionKeys|AnyStaff|StaffSignIn|OwnOrAll)\s*\(|["'"'"'`](agent|system)/[a-z][a-z0-9-]*:[a-z]'
ROUTE='@(Get|Post|Put|Patch|Delete|All)\s*\('
tick() { head -3 | sed 's/.*/`&`/' | paste -sd ' ' -; }

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
  local pr files names hit lines cs; verdict=""; head=""
  pr=$(api "$API/repos/$REPO/pulls/$PR") || { why="the PR cannot be read"; return 2; }
  head=$(jq -r '.head.sha // empty' <<< "$pr"); [[ "$head" =~ ^[0-9a-f]{40}$ ]] || { why="the PR's head cannot be read"; return 2; }
  [ "$(jq -r .base.ref <<< "$pr")" = main ] || { verdict=SKIP; why="its base is not main"; return 0; }
  case "$(jq -r .head.ref <<< "$pr")" in mergify/*) verdict=OK; why="a merge-queue batch: each of its PRs is judged by itself"; return 0;; esac
  [ -r "$LIST" ] && grep -qv '^#' "$LIST" || { why="lead-read-paths.txt cannot be read"; return 2; }
  files=$(pages "repos/$REPO/pulls/$PR/files") && jq -e 'type == "array"' <<< "$files" >/dev/null || { why="its files cannot be read"; return 2; }
  if [ "$(jq length <<< "$files")" -ge 3000 ]; then hit="3000 files or more (GitHub lists no more)"; else
    names=$(jq -r '.[] | .filename, (.previous_filename // empty)' <<< "$files")
    hit=$(paths <<< "$names" | tick)
    # (b) the lines that declare access, from each API source file's patch; a missing patch counts
    lines=$(jq -r --arg src "$SRC" --arg walled "$WALLED" --arg access "$ACCESS" --arg route "$ROUTE" '.[]
      | select(.filename | test($src)) | . as $f
      | if ($f.patch // "") == "" then (if (($f.changes // 0) > 0 or $f.status == "added" or $f.status == "removed") then $f.filename + " (its patch is too large for GitHub to give)" else empty end)
        else first(($f.patch | split("\n")[] | select(test("^[+-]") and (test("^(\\+\\+\\+|---) ") | not))
               | select(test($access) or (($f.filename | test($walled)) and test($route)))) | $f.filename + " (a permission key or a guarded route)") // empty end' <<< "$files" | tick) \
      || { why="its patches cannot be read"; return 2; }
    hit=$(printf '%s %s' "$hit" "$lines" | sed 's/^ *//; s/ *$//')
  fi
  [ -n "$hit" ] || { verdict=OK; why="no path or line that keeps the Lead's read"; return 0; }
  cs=$(pages "repos/$REPO/issues/$PR/comments") || { why="its comments cannot be read"; return 2; }
  # A quoted line ("> Lead read: OK …") is not the Lead's own; markdown marks around the words are dropped.
  if jq -r '.[] | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR") | .body // ""' <<< "$cs" \
      | tr -d '*_`\r' | grep -oiE '^[[:space:]]*Lead read(: *OK| the diff:?)[[:space:]]+[0-9a-f]{7,40}\b' | grep -oiE '[0-9a-f]{7,40}$' | tr 'A-F' 'a-f' \
      | while read -r s; do case "$head" in "$s"*) echo yes;; esac; done | grep -q yes; then
    verdict=OK; why="the Lead read ${head:0:9} ($hit)"; return 0; fi
  verdict=HOLD; why="waits for the Lead's read (P-423): $hit. A comment line by the Lead: Lead read: OK ${head:0:9}"; return 1; }

status() {  # judge, then the status on the head
  local r s; judge; r=$?
  case "$r" in
    0) [ "$verdict" = SKIP ] && { echo "#$PR: SKIP $why"; return 0; }; s=success;;
    1) if [ "$MODE" = block ]; then s=failure; else s=pending; why="report-only (P-717 (b)), would hold: ${why#waits for }"; fi;;
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
