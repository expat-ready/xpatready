#!/usr/bin/env bash
# A435 (founder 27 Nov; LR-157): routine PRs queue by themselves on the reviewer's Approve, a Lead-read PR through one
# narrow command. Part 1 runs lead-label.sh with GitHub answered by a stand-in curl (the PR, its comments, the label
# POST/DELETE written to a log): it labels only an open, ready, main-based, same-repository PR whose last reviewer line
# about the head is "Reviewer: Approve <full head SHA>", and refuses (exit 1, nothing changed) a stale head, a short SHA,
# a later Changes line, a forged or unknown commenter, a draft, a closed PR, a fork, a batch, a bad argument, unreadable
# comments, a head that moves while labelling, and a copy of the script that is not origin/main's.
# It also needs the Lead's read line on the head ("Lead read the diff: <full head>", lead-read-gate.sh's form).
# The auto-queue's own cases are kept by check-auto-queue-cases.sh (kept apart: the mutation rows of this test then do
# not re-run check-queue-gate.sh each time; review r1 m3). US$0, no network.
#   bash product/tools/check-lead-label.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/leadlabel.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/fx"
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
m=GET; d=""; u=""
while [ $# -gt 0 ]; do case "$1" in -X) m=$2; shift;; -d) d=$2; shift;; -H) shift;; http*) u=$1;; esac; shift; done
p=${u#https://api.test/repos/o/r/}; pg=$(printf '%s' "$u" | sed -n 's/.*[?&]page=\([0-9]*\).*/\1/p')
case "$m $p" in
  "GET pulls/"*) [ -f "$FX/pr.json" ] || { echo '{"message":"Not Found"}'; exit 22; }
    if [ -f "$FX/labelled" ] && [ -f "$FX/pr-after.json" ]; then cat "$FX/pr-after.json"; else cat "$FX/pr.json"; fi;;
  "GET issues/"*/comments*) [ -n "${FAIL_COMMENTS:-}" ] && { echo '{"message":"Server Error"}'; exit 22; }
    if [ -n "${ALLPAGES:-}" ]; then cat "$FX/comments.json"   # every page full: the 3000-comment cap
    elif [ "${pg:-1}" = 1 ]; then if [ -f "$FX/read.json" ]; then jq -s add "$FX/comments.json" "$FX/read.json"; else cat "$FX/comments.json"; fi   # the Lead's read line, added to page 1
    elif [ -f "$FX/comments-p$pg.json" ]; then cat "$FX/comments-p$pg.json"; else echo '[]'; fi;;
  "GET actions/variables/REVIEWERS") [ -f "$FX/reviewers" ] && jq -n --arg v "$(cat "$FX/reviewers")" '{name: "REVIEWERS", value: $v}' || { echo '{"message":"Not Found"}'; exit 22; };;
  "GET actions/variables/LEAD_LOGINS") [ -f "$FX/leadlogins" ] && jq -n --arg v "$(cat "$FX/leadlogins")" '{name: "LEAD_LOGINS", value: $v}' || { echo '{"message":"Not Found"}'; exit 22; };;
  "POST issues/"*/labels) echo "LABEL $(echo "$d" | jq -r '.labels[0]')" >> "$FX/log"; : > "$FX/labelled"; echo '[]';;
  "DELETE issues/"*/labels/*) echo "UNLABEL" >> "$FX/log"; echo '[]';;
  *) echo "unexpected $m $p" >> "$FX/log"; exit 22;;
esac
EOF
chmod +x "$T/bin/curl"
L="$TOOLS/lead-label.sh"
if [ ! -f "$L" ]; then ok "lead-label.sh exists (A435)" 0 "no $L"; finish; fi
HEAD1=a1b2c3d4e5a1b2c3d4e5a1b2c3d4e5a1b2c3d4e5; OLD=b2c3d4e5f6b2c3d4e5f6b2c3d4e5f6b2c3d4e5f6; HEAD2=c3d4e5f6a7c3d4e5f6a7c3d4e5f6a7c3d4e5f6a7   # a SHA has a digit and a letter (queue-gate.sh)
prj() {  # prj <head> [state] [draft] [base] [head ref] [head repo] [labels csv] → pr.json
  jq -n --arg h "$1" --arg s "${2:-open}" --argjson d "${3:-false}" --arg b "${4:-main}" --arg r "${5:-claude/x}" --arg rp "${6:-o/r}" --arg l "${7:-}" \
    '{number: 7, user: {login: "builder"}, state: $s, draft: $d, base: {ref: $b}, head: {sha: $h, ref: $r, repo: {full_name: $rp}}, labels: ($l | split(",") | map(select(length > 0)) | map({name: .}))}' > "$T/fx/pr.json"; }
cmt() {  # cmt <login> <association> <body> [<login> <association> <body>]... → comments.json, in order
  local a='[]'; while [ $# -ge 3 ]; do a=$(jq -c --arg l "$1" --arg s "$2" --arg b "$3" '. + [{user: {login: $l}, author_association: $s, body: $b, created_at: "2026-11-27T08:00:00Z", updated_at: "2026-11-27T08:00:00Z"}]' <<< "$a"); shift 3; done
  echo "$a" > "$T/fx/comments.json"; }
run() {  # run [args...] → $out $log $r (REVIEWERS from $REV when set; the variable's file otherwise)
  : > "$T/fx/log"; rm -f "$T/fx/labelled"
  if [ -n "${REV+x}" ]; then out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x LEAD_LABEL_REPO=o/r LEAD_LABEL_API=https://api.test LEAD_LABEL_MAIN_CHECK=0 LEAD_LABEL_REVIEWERS="$REV" FAIL_COMMENTS="${FAIL_COMMENTS:-}" bash "$L" "$@" 2>&1); r=$?
  else out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x LEAD_LABEL_REPO=o/r LEAD_LABEL_API=https://api.test LEAD_LABEL_MAIN_CHECK=0 FAIL_COMMENTS="${FAIL_COMMENTS:-}" bash "$L" "$@" 2>&1); r=$?; fi
  log=$(cat "$T/fx/log"); }
rd() {  # rd <login> <association> <body> → read.json, the comment appended to page 1 (no argument: none)
  if [ $# = 0 ]; then rm -f "$T/fx/read.json"; else jq -n --arg l "$1" --arg a "$2" --arg b "$3" --arg u "${UPD:-2026-11-27T09:00:00Z}" '[{user: {login: $l}, author_association: $a, body: $b, created_at: "2026-11-27T09:00:00Z", updated_at: $u}]' > "$T/fx/read.json"; fi; }
labelled() { [ $r = 0 ] && [ "$log" = "LABEL review: approved" ] && echo 1; }
refused() { [ $r = 1 ] && [ -z "$log" ] && grep -q '^lead-label: refused: ' <<< "$out" && echo 1; }

# --- lead-label.sh
rd o OWNER "Lead read the diff: $HEAD1"   # every case below has the Lead's read of HEAD1 unless it says otherwise
prj $HEAD1; cmt o OWNER "Reviewer: Approve $HEAD1"; REV="" run 7
ok "the owner's \"Reviewer: Approve <full head>\": labelled, exit 0" "$(labelled)" "exit $r: $out / $log"
cmt o OWNER "**Reviewer: Approve** \`$HEAD1\` (Opus, diff-only)"; REV="" run 7
ok "markdown around the Approve line is read as the line" "$(labelled)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $OLD"; REV="" run 7
ok "stale head: an Approve naming an older commit is refused, nothing labelled" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $HEAD1" o OWNER "Reviewer: Approve $OLD"; REV="" run 7
ok "an Approve on an older commit after one on the head does not undo it (the last line about the head decides)" "$(labelled)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve ${HEAD1:0:9}"; REV="" run 7
ok "a short SHA is not the head: refused (the full 40 characters, as queue-gate.sh)" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $HEAD1" o OWNER "Reviewer: Changes needed $HEAD1: M1"; REV="" run 7
ok "a later \"Reviewer: Changes\" on the same head wins: refused" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $HEAD1" o OWNER "Reviewer: Changes requested, see M2"; REV="" run 7
ok "a later verdict naming no SHA wins: refused" "$(refused)" "exit $r: $out / $log"
cmt someone NONE "Reviewer: Approve $HEAD1"; REV="" run 7
ok "forged: an Approve by an account without write access is refused" "$(refused)" "exit $r: $out / $log"
cmt helper COLLABORATOR "Reviewer: Approve $HEAD1"; REV="" run 7
ok "forged: a collaborator not in REVIEWERS is refused" "$(refused)" "exit $r: $out / $log"
REV="other helper" run 7
ok "a known reviewer (REVIEWERS) with write access: labelled" "$(labelled)" "exit $r: $out / $log"
cmt helper NONE "Reviewer: Approve $HEAD1"; REV=helper run 7
ok "forged: a known reviewer's login without write access is refused" "$(refused)" "exit $r: $out / $log"
cmt helper MEMBER "Reviewer: Approve $HEAD1"; echo "helper" > "$T/fx/reviewers"; unset REV; LEAD_LABEL_REVIEWERS=leak; unset LEAD_LABEL_REVIEWERS; run 7
ok "REVIEWERS unset: the repository variable is read (a known reviewer labels)" "$(labelled)" "exit $r: $out / $log"
rm -f "$T/fx/reviewers"; run 7
ok "REVIEWERS unset and the variable unreadable: the owner alone counts (refused)" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "> Reviewer: Approve $HEAD1"; REV="" run 7
ok "a quoted Approve line (> ...) is not the reviewer's own: refused" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $HEAD1"
prj $HEAD1 closed; REV="" run 7; ok "a closed PR is refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1 open true; REV="" run 7; ok "a draft is refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1 open false release; REV="" run 7; ok "a PR not based on main is refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1 open false main mergify/merge-queue/1; REV="" run 7; ok "a merge-queue batch is refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1 open false main claude/x someone/r; REV="" run 7; ok "a fork's head is refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1 open false main claude/x o/r "review: approved,queued"; REV="" run 7
ok "already labelled: exit 0, nothing posted" "$([ $r = 0 ] && [ -z "$log" ] && echo 1)" "exit $r: $out / $log"
prj $HEAD1; rm -f "$T/fx/pr.json"; REV="" run 7; ok "the PR cannot be read: refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1; FAIL_COMMENTS=1 REV="" run 7; ok "the comments cannot be read: refused (fails closed)" "$(refused)" "exit $r: $out / $log"
# review r1 M1: the Lead's read of this head, recorded, before the label
cmt o OWNER "Reviewer: Approve $HEAD1"
rd; REV="" run 7; ok "no \"Lead read the diff\" line: refused (the read first, then the label)" "$(refused)" "exit $r: $out / $log"
rd o OWNER "Lead read the diff: $OLD"; REV="" run 7; ok "a read of an older head: refused" "$(refused)" "exit $r: $out / $log"
rd o OWNER "Lead read the diff: ${HEAD1:0:12}"; REV="" run 7; ok "a read naming a short SHA: refused" "$(refused)" "exit $r: $out / $log"
rd someone NONE "Lead read the diff: $HEAD1"; REV="" run 7; ok "a read line by an account without write access: refused" "$(refused)" "exit $r: $out / $log"
rd o OWNER "    Lead read the diff: $HEAD1"; REV="" run 7; ok "a read line inside a code block (4 spaces): refused" "$(refused)" "exit $r: $out / $log"
rd o OWNER "I will post Lead read the diff: $HEAD1 later"; REV="" run 7; ok "a read named inside a sentence: refused (alone on its line)" "$(refused)" "exit $r: $out / $log"
rd o OWNER "Lead read: OK $HEAD1."; REV="" run 7; ok "\"Lead read: OK <head>.\" counts as the read (lead-read-gate.sh's form)" "$(labelled)" "exit $r: $out / $log"
# break r2 M1: read exactly as lead-read-gate.sh reads it
F3='```'
rd o OWNER "$F3
Lead read the diff: $HEAD1
$F3"; REV="" run 7; ok "a read line inside a \`\`\` fence: refused (the gate drops fences)" "$(refused)" "exit $r: $out / $log"
rd o OWNER "~~~
Lead read the diff: $HEAD1
~~~"; REV="" run 7; ok "a read line inside a ~~~ fence: refused" "$(refused)" "exit $r: $out / $log"
rd o OWNER "<!--
Lead read the diff: $HEAD1
-->"; REV="" run 7; ok "a read line inside an HTML comment: refused" "$(refused)" "exit $r: $out / $log"
rd o OWNER "$F3
Lead read the diff: $HEAD1"; REV="" run 7; ok "a read line after an unclosed fence: refused" "$(refused)" "exit $r: $out / $log"
UPD=2026-11-27T10:00:00Z rd o OWNER "Lead read the diff: $HEAD1"; REV="" run 7; ok "an edited comment's read line: refused (anyone with write access can edit a comment)" "$(refused)" "exit $r: $out / $log"
echo "lead1" > "$T/fx/leadlogins"; rd helper COLLABORATOR "Lead read the diff: $HEAD1"; REV="" run 7
ok "LEAD_LOGINS set: a writer not in it does not count" "$(refused)" "exit $r: $out / $log"
rd LEAD1 MEMBER "Lead read the diff: $HEAD1"; REV="" run 7; ok "LEAD_LOGINS set: a listed login counts (any case)" "$(labelled)" "exit $r: $out / $log"
echo "builder" > "$T/fx/leadlogins"; rd builder MEMBER "Lead read the diff: $HEAD1"; REV="" run 7
ok "LEAD_LOGINS set: the PR's own author never frees it" "$(refused)" "exit $r: $out / $log"
rm -f "$T/fx/leadlogins"
rd o OWNER "Lead read the diff: $HEAD1"
jq -n --arg h "$HEAD1" '[range(100) | {user: {login: "o"}, author_association: "OWNER", body: ("Reviewer: Approve " + $h + "\nLead read the diff: " + $h), created_at: "2026-11-27T08:00:00Z"}]' > "$T/fx/comments.json"
ALLPAGES=1 REV="" run 7; ok "more than 3000 comments: refused (fails closed)" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $HEAD1"
# break r1: every page counts, a malformed page fails closed, the locale and the session's env cannot widen it
p100=$(jq -n --arg h "$HEAD1" '[range(100) | {user: {login: "o"}, author_association: "OWNER", body: "note"}] | .[0].body = ("Reviewer: Approve " + $h)')
echo "$p100" > "$T/fx/comments.json"; cmt o OWNER "Reviewer: Changes needed $HEAD1"; mv "$T/fx/comments.json" "$T/fx/comments-p2.json"; echo "$p100" > "$T/fx/comments.json"
REV="" run 7; ok "a Changes line on page 2 wins over an Approve on page 1: refused" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $HEAD1"; REV="" run 7; ok "... and page 2 alone is not the last page read: with page 1 a full 100, page 2 holding an Approve labels" "$(labelled)" "exit $r: $out / $log"
rm -f "$T/fx/comments-p2.json"
jq -c --arg h "$HEAD1" '[{user: {login: "o"}, author_association: "OWNER", body: ("Reviewer: Approve " + $h)}, 5, {user: {login: "o"}, author_association: "OWNER", body: "Reviewer: Changes needed"}]' -n > "$T/fx/comments.json"
REV="" run 7; ok "a page with a value that is not a comment: refused (a jq error never drops a later verdict)" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Changes needed"; mv "$T/fx/comments.json" "$T/fx/c2"; cmt o OWNER "Reviewer: Approve $HEAD1
Lead read the diff: $HEAD1"; cat "$T/fx/c2" >> "$T/fx/comments.json"; rm -f "$T/fx/c2"   # [Approve + read] then [Changes]
rd; REV="" run 7; rd o OWNER "Lead read the diff: $HEAD1"; ok "a page of two JSON documents: refused" "$(refused)" "exit $r: $out / $log"
cmt helper MEMBER "Reviewer: Approve $HEAD1"; mkdir -p "$T/cwd" && : > "$T/cwd/helper"
out=$(cd "$T/cwd" && PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x LEAD_LABEL_REPO=o/r LEAD_LABEL_API=https://api.test LEAD_LABEL_MAIN_CHECK=0 LEAD_LABEL_REVIEWERS='*' bash "$L" 7 2>&1); r=$?; log=$(cat "$T/fx/log")
ok "REVIEWERS '*' is not globbed into the folder's file names: refused" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $HEAD1"; : > "$T/fx/log"
out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x LEAD_LABEL_REPO=o/r LEAD_LABEL_API=https://api.test LEAD_LABEL_MAIN_CHECK=0 LEAD_LABEL_REVIEWERS="" LC_ALL=en_US.UTF-8 bash "$L" "$(printf '\xd9\xa7')" 2>&1); r=$?; log=$(cat "$T/fx/log")
ok "a non-ASCII digit (Arabic-Indic seven) under a UTF-8 locale: refused with the usage" "$(refused)" "exit $r: $out / $log"
: > "$T/fx/log"; out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x API=https://elsewhere.test REPO=x/y REVIEWERS=someone LEAD_LABEL_REPO=o/r LEAD_LABEL_API=https://api.test LEAD_LABEL_MAIN_CHECK=0 LEAD_LABEL_REVIEWERS="" bash "$L" 7 2>&1); r=$?; log=$(cat "$T/fx/log")
ok "the session's own API, REPO and REVIEWERS are not read (only LEAD_LABEL_*)" "$(labelled)" "exit $r: $out / $log"
for a in "" "7x" "07" "7 8" "--force"; do
  # shellcheck disable=SC2086
  REV="" run $a; ok "argument '${a}': refused with the usage, nothing posted" "$(refused)" "exit $r: $out / $log"
done
jq --arg h "$HEAD2" '.head.sha = $h' "$T/fx/pr.json" > "$T/fx/pr-after.json"; REV="" run 7; rm -f "$T/fx/pr-after.json"
ok "the head moves while labelling: the label comes off again, exit 1" "$([ $r = 1 ] && [ "$log" = "LABEL review: approved
UNLABEL" ] && grep -q "head moved" <<< "$out" && echo 1)" "exit $r: $out / $log"

# The accident guard: a copy whose lead-label.sh is not origin/main's refuses before any API call.
O="$T/origin.git"; C="$T/copy"; git init -q --bare -b main "$O"; git clone -q "$O" "$C" 2>/dev/null
git -C "$C" config user.email t@t; git -C "$C" config user.name t; git -C "$C" config commit.gpgsign false
mkdir -p "$C/tools" && cp "$L" "$C/tools/lead-label.sh" && git -C "$C" add -A && git -C "$C" commit -qm main && git -C "$C" push -q origin HEAD:main 2>/dev/null
mc() { : > "$T/fx/log"; out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x LEAD_LABEL_REPO=o/r LEAD_LABEL_API=https://api.test LEAD_LABEL_REVIEWERS="" bash "$C/tools/lead-label.sh" 7 2>&1); r=$?; log=$(cat "$T/fx/log"); }
mc; ok "the copy's script is origin/main's: the check passes and the PR is labelled" "$(labelled)" "exit $r: $out / $log"
echo "# changed" >> "$C/tools/lead-label.sh"; mc
ok "the copy's script differs from origin/main's: refused before any API call" "$([ $r = 1 ] && [ -z "$log" ] && grep -q "not origin/main's" <<< "$out" && echo 1)" "exit $r: $out / $log"
git -C "$C" commit -qam "changed copy"; git -C "$C" update-ref refs/remotes/origin/main HEAD; git -C "$C" config --unset-all remote.origin.fetch; mc
ok "a stale local origin/main that matches the changed copy does not pass: main as just fetched decides (break r1 m4)" "$([ $r = 1 ] && [ -z "$log" ] && echo 1)" "exit $r: $out / $log"
git -C "$C" remote set-url origin "$T/nowhere.git"; mc
ok "main cannot be fetched: refused before any API call" "$([ $r = 1 ] && [ -z "$log" ] && grep -q "cannot fetch" <<< "$out" && echo 1)" "exit $r: $out / $log"
# review r1 M2: a copy reached through a symlinked path (macOS /tmp) still finds itself on main
git -C "$C" remote set-url origin "$O"; git -C "$C" reset -q --hard origin/main 2>/dev/null; git -C "$C" fetch -q origin main && git -C "$C" reset -q --hard FETCH_HEAD
ln -s "$C" "$T/link"; : > "$T/fx/log"; out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x LEAD_LABEL_REPO=o/r LEAD_LABEL_API=https://api.test LEAD_LABEL_REVIEWERS="" bash "$T/link/tools/lead-label.sh" 7 2>&1); r=$?; log=$(cat "$T/fx/log")
ok "run through a symlinked path, main's copy is still recognised and labels" "$(labelled)" "exit $r: $out / $log"

finish
