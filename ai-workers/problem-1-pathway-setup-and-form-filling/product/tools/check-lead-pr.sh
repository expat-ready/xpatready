#!/usr/bin/env bash
# lead-pr.sh's label and requeue steps (ENF-783a, P-783 (1)), run on a stand-in GitHub: curl and gh answered from files,
# every POST written to a log. label: refused on a draft, with no Approve, with an Approve on an older head, with an
# Approve by an outsider or a bot, with a red check, or over the review-round limit (P-293); labels with the exact head's
# Approve by a reviewer. requeue: refused without review: approved, while queued, or with no write-access "Batch failures
# covered:" line; posts a bare "@mergifyio requeue" otherwise. US$0, no network.
#   bash product/tools/check-lead-pr.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/leadpr.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/fx"
cat > "$T/bin/gh" <<'G'
#!/usr/bin/env bash
[ "$1 $2" = "auth token" ] && echo fake-token
G
cat > "$T/bin/curl" <<'C'
#!/usr/bin/env bash
m=GET; d=""; u=""
while [ $# -gt 0 ]; do case "$1" in -X) m=$2; shift;; -d) d=$2; shift;; -H) shift;; http*) u=$1;; esac; shift; done
case "$m $u" in
  "GET "*/pulls/7) cat "$FX/pull.json";;
  "GET "*/issues/7/comments*page=1) [ -n "${FAIL_COMMENTS:-}" ] && { echo '{"message":"Server Error"}'; exit 0; }; cat "$FX/comments.json";;
  "GET "*/issues/7/comments*) echo '[]';;
  "GET "*/check-runs*) cat "$FX/checks.json";;
  "POST "*/issues/7/labels) echo "LABEL $d" >> "$FX/log"; echo '[]';;
  "POST "*/issues/7/comments) echo "COMMENT $(echo "$d" | jq -r .body)" >> "$FX/log"; echo '{}';;
  *) echo "unexpected $m $u" >> "$FX/log"; echo '{}';;
esac
C
chmod +x "$T/bin/gh" "$T/bin/curl"
export FX="$T/fx" PATH="$T/bin:$PATH"
HEAD=1111111111111111111111111111111111111111; OLD=2222222222222222222222222222222222222222
pull() { jq -n --arg h "$HEAD" --argjson draft "${1:-false}" --arg labels "${2:-}" \
  '{state: "open", draft: $draft, head: {sha: $h, ref: "claude/x"}, labels: ($labels | split(",") | map(select(. != "")) | map({name: .}))}' > "$FX/pull.json"; }
cm() { jq -n --arg b "$1" --arg a "${2:-MEMBER}" --arg l "${3:-builder}" --arg t "${4:-User}" '{body: $b, author_association: $a, user: {login: $l, type: $t}}'; }
comments() { jq -s . > "$FX/comments.json"; }
checks() { echo "{\"check_runs\": [{\"name\": \"ci\", \"conclusion\": \"${1:-success}\"}]}" > "$FX/checks.json"; }
run() { : > "$FX/log"; out=$(bash "$TOOLS/lead-pr.sh" "$@" 2>&1); rc=$?; }
posted() { grep -qF "$1" "$FX/log"; }
nothing() { [ ! -s "$FX/log" ]; }

# label
pull; checks; cm "Reviewer: Approve $HEAD" | comments; run label 7
ok "label: the exact head's Approve by a reviewer, green checks → labelled" "$([ $rc = 0 ] && posted 'LABEL {"labels":["review: approved"]}' && grep -q 'Approve by builder' <<<"$out" && echo 1)" "$rc $out"
pull true; run label 7
ok "label: a draft is refused" "$([ $rc = 1 ] && nothing && grep -q 'is a draft' <<<"$out" && echo 1)" "$rc $out"
pull; cm "Progress: built." | comments; run label 7
ok "label: no Approve → refused" "$([ $rc = 1 ] && nothing && grep -q "no \"Reviewer: Approve $HEAD\"" <<<"$out" && echo 1)" "$rc $out"
cm "Reviewer: Approve $OLD" | comments; run label 7
ok "label: an Approve naming an older head → refused" "$([ $rc = 1 ] && nothing && echo 1)" "$rc $out"
cm "Reviewer: Approve ${HEAD:0:9}" | comments; run label 7
ok "label: a short SHA is not the exact head → refused" "$([ $rc = 1 ] && nothing && echo 1)" "$rc $out"
cm "Reviewer: Approve $HEAD" NONE stranger | comments; run label 7
ok "label: an Approve by someone without write access → refused" "$([ $rc = 1 ] && nothing && echo 1)" "$rc $out"
cm "Reviewer: Approve $HEAD" NONE "github-actions[bot]" Bot | comments; run label 7
ok "label: an Approve by a bot → refused" "$([ $rc = 1 ] && nothing && echo 1)" "$rc $out"
cm "Reviewer: Approve $HEAD" | comments; checks failure; run label 7
ok "label: a red check on the head → refused" "$([ $rc = 1 ] && nothing && grep -q 'red checks' <<<"$out" && echo 1)" "$rc $out"
checks; { cm "Reviewer: Changes"; cm "Reviewer: Changes"; cm "Reviewer: Approve $HEAD"; } | comments; run label 7
ok "label: a third review round without the Lead's line → refused (P-293)" "$([ $rc = 1 ] && nothing && grep -q 'REFUSED: 3 reviewer rounds' <<<"$out" && echo 1)" "$rc $out"
{ cm "Reviewer: Changes"; cm "Reviewer: Changes"; cm "Lead allows round 3: one-line fix" OWNER lead; cm "Reviewer: Approve $HEAD"; } | comments; run label 7
ok "label: a third round with \"Lead allows round 3:\" → labelled" "$([ $rc = 0 ] && posted LABEL && echo 1)" "$rc $out"
{ cm "Reviewer: Approve $HEAD"; for i in $(seq 1 60); do cm "$(head -c 3000 /dev/zero | tr '\0' x)"; done; } | comments; run label 7
ok "label: comments over 128 KiB (a busy PR) still read (#2749 review M2)" "$([ $rc = 0 ] && posted LABEL && [ "$(wc -c < "$FX/comments.json")" -gt 140000 ] && echo 1)" "$rc $out"
FAIL_COMMENTS=1 run label 7
ok "label: comments unreadable → refused (fails closed)" "$([ $rc = 1 ] && nothing && grep -q 'comments unreadable' <<<"$out" && echo 1)" "$rc $out"

# requeue
pull false "review: approved"; cm "**Batch failures covered:** 900: \`shard (3)\`, flaky runner" | comments; run requeue 7
ok "requeue: approved, not queued, covered → a bare @mergifyio requeue" "$([ $rc = 0 ] && [ "$(cat "$FX/log")" = "COMMENT @mergifyio requeue" ] && echo 1)" "$rc $out $(cat "$FX/log")"
pull false ""; run requeue 7
ok "requeue: no review: approved → refused" "$([ $rc = 1 ] && nothing && echo 1)" "$rc $out"
pull false "review: approved,queued"; run requeue 7
ok "requeue: while queued (a running batch) → refused" "$([ $rc = 1 ] && nothing && grep -q 'is queued' <<<"$out" && echo 1)" "$rc $out"
pull false "review: approved"; cm "Reviewer: Approve $HEAD" | comments; run requeue 7
ok "requeue: no \"Batch failures covered:\" line → refused" "$([ $rc = 1 ] && nothing && grep -q 'Batch failures covered' <<<"$out" && echo 1)" "$rc $out"
cm "Batch failures covered: 900: shard (3)" NONE stranger | comments; run requeue 7
ok "requeue: a covered line by an outsider does not count" "$([ $rc = 1 ] && nothing && echo 1)" "$rc $out"

run bogus 7
ok "an unknown step prints the usage" "$([ $rc = 1 ] && grep -q 'reopen|approve-records|label|requeue' <<<"$out" && echo 1)" "$rc $out"
finish
