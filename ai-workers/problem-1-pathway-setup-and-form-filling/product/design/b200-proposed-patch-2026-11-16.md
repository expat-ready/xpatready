# B200 proposed patch (16 Nov): the queue gate labels after the Lead's read; records PRs need no read

**B200, proposed patch for the tech lead.** This evidence copy may not commit it: the stop hook says builder copies never edit `product/tools/` or `.github/` (P-189), and B200's owner is "Lead". The patch is 2 commits on main `bf4fbbf66`. It touches `queue-gate.sh`, `check-queue-gate.sh`, `check-guards.sh` and `.github/workflows/queue-gate.yml`.

**What it does:**
* **Lead-read paths.** A PR touching a path in `lead-read-paths.txt` is labelled once an OWNER or MEMBER comment has a line that *starts with* `Lead read the diff: <9–40 hex of the current head>`. This comes on top of the reviewer's Approve on that head and a green ci.
* **What does not count as a read:**
  * a read of an older head (a new push needs a new read);
  * 8 characters or fewer;
  * a collaborator's line;
  * a mid-line quote (the gate's own refusal quotes the line mid-line).
* **Records-only PRs** need no Lead's read: the `records` label and only Markdown under `product/`, never `product/tools/`. The Approve and a green ci are still required.
* **`queue-gate.yml`** also starts a run on a comment containing "Lead read the diff".
* **Matches `lead-read-guard.sh` (#1865).** That guard accepts 7 or more characters anywhere in a comment. This gate is stricter: 9 or more, at the start of a line.

**Checks, in a scratch worktree with the patch applied:**
* `check-queue-gate.sh` 64/64 (11 new cases).
* Against main's `queue-gate.sh`, it is 59/64: the 5 new allow-and-label cases fail.
* `check-label-sweep.sh` 14/14.
* `check-guards.sh --mutate`: all 21 guard-15 mutations turn their test red, including 6 new ones (readhead, readwho, readline, records, rectools, readevent).
  * A first readevent line used `||`, which the list splits on. It is fixed in the second commit and checked alone: 63/64 with the guard off, 64/64 back on.
* The only red is `check-isolated-ttl.sh`: this container has no demo database. It is the same on main.

**Why the bot never labelled today (queue-gate run logs, 03:57–05:02 UTC):**
* Lanes label right after the Approve or `ready`, often before ci is green, so the gate's run reports "already labelled" (#1918, #1921, #1928, #1931).
* Approves posted while the PR was a draft are refused ("the PR is a draft"). The gate labels them only at the next ci-finished event.
* Lead-read PRs are refused by design (#1910, a prisma path). This patch fixes that case.

**Known limit:** every lane posts from the owner's account, so the gate cannot tell the Lead's line from a lane's. The `Reviewer:` line has the same limit today.

**To apply (in the Lead's copy, on a branch from main `bf4fbbf66` or later):** copy the block below into `b200.patch` and run:
```
git am b200.patch
```
Then run `bash product/tools/check-queue-gate.sh` (expect 64/64) and `bash product/tools/check-guards.sh --mutate`.

````diff
From 25eb801963bcf41b9d3a53f0a0963fe88de8e027 Mon Sep 17 00:00:00 2001
From: Claude <noreply@anthropic.com>
Date: Mon, 16 Nov 2026 05:08:04 +0000
Subject: [PATCH 1/2] =?UTF-8?q?tooling:=20B200=20=E2=80=94=20the=20queue?=
 =?UTF-8?q?=20gate=20labels=20a=20Lead-read=20PR=20after=20"Lead=20read=20?=
 =?UTF-8?q?the=20diff:=20<head>";=20records-only=20PRs=20need=20no=20read?=
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit

queue-gate.sh label: a PR touching a lead-read-paths.txt path is labelled once an OWNER or MEMBER comment line
starts "Lead read the diff: <9-40 hex of the current head>" (a newer push needs a new read; a mid-line quote or a
collaborator's line does not count). A PR with the records label whose every path is Markdown under product/ (never
product/tools/) needs no read. queue-gate.yml also runs on a "Lead read the diff" comment. check-queue-gate.sh:
11 new cases (64); check-guards.sh: 6 new guard-15 mutations.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018BSQJopRBi3cobhinCA66g
---
 .github/workflows/queue-gate.yml              |  5 ++-
 .../product/tools/check-guards.sh             |  8 ++++-
 .../product/tools/check-queue-gate.sh         | 34 ++++++++++++++++++-
 .../product/tools/queue-gate.sh               | 27 +++++++++++----
 4 files changed, 65 insertions(+), 9 deletions(-)

diff --git a/.github/workflows/queue-gate.yml b/.github/workflows/queue-gate.yml
index 19ccbe239..16381abb5 100644
--- a/.github/workflows/queue-gate.yml
+++ b/.github/workflows/queue-gate.yml
@@ -3,6 +3,8 @@
 # 1. Auto-label: `review: approved` goes on by itself once the owner's account (or a login in the repository variable
 #    REVIEWERS) comments "Reviewer: Approve <head SHA>", ci is green on that head, and no path keeps the Lead's read
 #    (.github/, .mergify.yml, migrations, money: P-423, product/tools/lead-read-paths.txt). No waiting for a lane to wake.
+#    B200 (P-637): such a PR also labels once an OWNER or MEMBER comment line "Lead read the diff: <head SHA>" names the
+#    current head, so that comment starts a run too; a records-only PR (Markdown under product/) needs no read.
 # 2. queue-fresh: a commit status Mergify's product queue needs for app code (.mergify.yml). "failure" when main merged a
 #    PR touching the same app files, or a second migration, after the PR's green ci started; a labelled PR's ci run is
 #    then re-run (a re-run tests today's main, D6; never a cancel, P-371).
@@ -29,7 +31,8 @@ jobs:
   gate:
     # A comment only when it is a reviewer's Approve on a PR; a label only when it is `review: approved`; ci runs of PRs.
     if: >-
-      (github.event_name == 'issue_comment' && github.event.issue.pull_request && contains(github.event.comment.body, 'Approve') &&
+      (github.event_name == 'issue_comment' && github.event.issue.pull_request &&
+       (contains(github.event.comment.body, 'Approve') || contains(github.event.comment.body, 'Lead read the diff')) &&
        contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association)) ||
       (github.event_name == 'workflow_run' && github.event.workflow_run.event == 'pull_request') ||
       (github.event_name == 'pull_request_target' && github.event.label.name == 'review: approved') ||
diff --git a/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-guards.sh b/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-guards.sh
index 510f2425c..e4ad4c360 100755
--- a/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-guards.sh
+++ b/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-guards.sh
@@ -65,7 +65,13 @@ MUT='1|product/tools/check-docs.sh|/CURRENT LEAD: STATE.md has/d|check-current-l
 15 time|product/tools/queue-gate.sh|s/\[\[ "\$ts" > "\$run_started" \]\] .. continue/continue/|check-queue-gate.sh
 15 shared|product/tools/queue-gate.sh|s/^    if \[ -n "\$both" \]; then/    if false; then/|check-queue-gate.sh
 15 verdict|product/tools/queue-gate.sh|s/^    \[ "\$keep" = 1 \] .. last=\$l; done/    last=$l; done/|check-queue-gate.sh
-15 comment|../../.github/workflows/queue-gate.yml|/comment.author_association/d|check-queue-gate.sh'
+15 comment|../../.github/workflows/queue-gate.yml|/comment.author_association/d|check-queue-gate.sh
+15 readhead|product/tools/queue-gate.sh|s/case "\$head" in "\$x"\*) bad=""/case x in x) bad=""/|check-queue-gate.sh
+15 readwho|product/tools/queue-gate.sh|s/select(.author_association == "OWNER" or .author_association == "MEMBER")/select(true)/|check-queue-gate.sh
+15 readline|product/tools/queue-gate.sh|s/\^\[\[:space:\]\]\*lead read the diff/lead read the diff/|check-queue-gate.sh
+15 records|product/tools/queue-gate.sh|s/has records \&\& //|check-queue-gate.sh
+15 rectools|product/tools/queue-gate.sh|s/ \&\& ! grep -qiE .\/product\/tools\/. <<< "\$files"; then/; then/|check-queue-gate.sh
+15 readevent|../../.github/workflows/queue-gate.yml|s/ || contains(github.event.comment.body, .Lead read the diff.)//|check-queue-gate.sh'
 pyparse() { python3 -I -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "${@: -1}"; }   # "$sh -n FILE" for a .py
 echo "--- each test without its guard (must FAIL)"
 while IFS='|' read -r g f edit t; do
diff --git a/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-queue-gate.sh b/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-queue-gate.sh
index afc698a3b..a9a6dff75 100644
--- a/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-queue-gate.sh
+++ b/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-queue-gate.sh
@@ -79,6 +79,33 @@ for f in ".github/workflows/x.yml" ".mergify.yml" "ai-workers/x/product/tools/qu
   files 7 "$S/api/src/form.ts" "$f"; run label 7
   ok "label refused: $f keeps the Lead's read (P-423)" "$(! grep -q '^LABEL' <<< "$log" && grep -q "Lead's read" <<< "$out" && echo 1)" "$out / $log"
 done
+# --- B200 (P-637): a Lead-read path labels after the Lead's read of the head; a records-only PR needs no read
+rd() {  # rd <association> <read line>: the Approve, then the read
+  jq -n --arg h $HEAD1 --arg a "$1" --arg b "$2" '[{user: {login: "o"}, author_association: "OWNER", body: ("Reviewer: Approve " + $h)},
+    {user: {login: "o"}, author_association: $a, body: $b}]' > "$T/fx/comments-7.json"; }
+files 7 "$S/api/src/form.ts" "$S/prisma/migrations/3_c/migration.sql"
+rd OWNER "Tech lead (Lead 64): read the migration.
+Lead read the diff: ${HEAD1:0:12}"; run label 7
+ok "label (B200): a migration PR with the owner's \"Lead read the diff: <head>\" is labelled, and the comment says so" "$([ $r = 0 ] && grep -qx 'LABEL 7' <<< "$log" && grep -q 'Lead read' <<< "$out" && echo 1)" "exit $r: $out / $log"
+rd MEMBER "**Lead read the diff:** \`$HEAD1\`"; run label 7
+ok "label (B200): a member's read naming the full head, in markdown, counts" "$(grep -qx 'LABEL 7' <<< "$log" && echo 1)" "$out / $log"
+rd OWNER "Lead read the diff: ${OLD:0:12}"; run label 7
+ok "label refused (B200): the read names an older head (a newer push needs a new read)" "$(! grep -q '^LABEL' <<< "$log" && grep -q 'no "Lead read the diff: 111111111"' <<< "$out" && echo 1)" "$out / $log"
+rd OWNER "Lead read the diff: ${HEAD1:0:8}"; run label 7
+ok "label refused (B200): a read naming only 8 characters of the head (9 or more)" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
+rd COLLABORATOR "Lead read the diff: $HEAD1"; run label 7
+ok "label refused (B200): a collaborator's read (owner or member only)" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
+rd OWNER "The Lead comments \"Lead read the diff: $HEAD1\" after reading."; run label 7
+ok "label refused (B200): the line quoted mid-line (as the gate's own refusal does) is not a read" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
+rd OWNER "Lead read the diff: ${OLD:0:12}"; files 7 "ai-workers/x/product/design/money-plan.md" "ai-workers/x/product/qa/fees.md"; prj 7 $HEAD1 false "records"; run label 7
+ok "label (B200): a records-only PR (records label, Markdown under product/) needs no Lead's read" "$(grep -qx 'LABEL 7' <<< "$log" && grep -q 'records only' <<< "$out" && echo 1)" "$out / $log"
+prj 7 $HEAD1; run label 7
+ok "label refused (B200): the same Markdown without the records label keeps the Lead's read" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
+prj 7 $HEAD1 false "records"; files 7 "ai-workers/x/product/design/money-plan.md" "ai-workers/x/product/tools/README.md"; run label 7
+ok "label refused (B200): records label but a file under product/tools/ keeps the Lead's read" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
+files 7 "ai-workers/x/product/design/money-plan.md" "ai-workers/x/product/design/fees.html"; run label 7
+ok "label refused (B200): records label but a non-Markdown file keeps the Lead's read" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
+prj 7 $HEAD1
 files 7 "$S/api/src/form.ts"
 cmt 7 o OWNER "> Reviewer: Approve $HEAD1"; run label 7
 ok "label refused: a quoted Approve line (> ...) is not the reviewer's own" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
@@ -143,6 +170,11 @@ printf '%s' "{\"issue\": {\"number\": 9, \"pull_request\": {}}, \"comment\": {\"
 ev() { : > "$T/fx/log"; out=$(cd "$T/git" && PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x REPO=o/r API=https://api.test MAIN_REF=main GITHUB_EVENT_NAME=$1 GITHUB_EVENT_PATH="$T/fx/ev.json" bash "$G" event 2>&1); r=$?; log=$(cat "$T/fx/log"); }
 ev issue_comment
 ok "event issue_comment: an Approve comment labels the PR and sets queue-fresh once (no second verdict)" "$([ $r = 0 ] && grep -qx 'LABEL 9' <<< "$log" && [ "$(grep -c '^STATUS' <<< "$log")" = 1 ] && echo 1)" "exit $r: $out / $log"
+files 10 "$S/api/src/form.ts" "$S/prisma/schema/cases.prisma"; prj 10 $HEAD1; cirun $HEAD1 completed success 2026-11-15T13:00:00Z
+jq -n --arg h $HEAD1 '[{user: {login: "o"}, author_association: "OWNER", body: ("Reviewer: Approve " + $h)}, {user: {login: "o"}, author_association: "OWNER", body: ("Lead read the diff: " + $h)}]' > "$T/fx/comments-10.json"
+printf '%s' "{\"issue\": {\"number\": 10, \"pull_request\": {}}, \"comment\": {\"body\": \"Lead read the diff: $HEAD1\"}}" > "$T/fx/ev.json"; ev issue_comment
+ok "event issue_comment (B200): the Lead's read comment starts the label" "$([ $r = 0 ] && grep -qx 'LABEL 10' <<< "$log" && echo 1)" "exit $r: $out / $log"
+cirun $HEAD1 completed success 2026-11-15T10:00:00Z
 printf '{"workflow_run": {"pull_requests": [{"number": 9}]}}' > "$T/fx/ev.json"; ev workflow_run
 ok "event workflow_run: the PR of a finished ci is labelled and judged" "$([ $r = 0 ] && grep -qx 'LABEL 9' <<< "$log" && grep -q '^STATUS' <<< "$log" && echo 1)" "exit $r: $out / $log"
 printf '{"workflow_run": {"pull_requests": [{"number": 404}]}}' > "$T/fx/ev.json"; ev workflow_run
@@ -162,5 +194,5 @@ ok "fresh: the ci run cannot be read: pending, no re-run" "$(grep -qx "STATUS $H
 # --- the wiring
 R=$(git -C "$TOOLS" rev-parse --show-toplevel); M="$R/.mergify.yml"; W="$R/.github/workflows/queue-gate.yml"
 ok ".mergify.yml: the product queue needs queue-fresh for a PR touching prototype/" "$(awk '/- name: product/,/- name: records/' "$M" | grep -q 'check-success = queue-fresh' && awk '/- name: product/,/- name: records/' "$M" | grep -qF -- '-files ~= /prototype/' && echo 1)" "no queue-fresh condition in the product queue"
-ok "queue-gate.yml runs main's copy of queue-gate.sh on comments, ci runs, labels and pushes to main" "$([ -f "$W" ] && grep -q 'ref: main' "$W" && grep -q 'queue-gate.sh event' "$W" && grep -q 'issue_comment' "$W" && grep -q 'workflow_run' "$W" && ! grep -qE 'refs/pull|head\.sha' "$W" && grep -q '"OWNER","MEMBER","COLLABORATOR"' "$W" && grep -q 'types: \[labeled, unlabeled\]' "$W" && echo 1)" "$W (an outsider's comment must start no write-token run, review m2)"
+ok "queue-gate.yml runs main's copy of queue-gate.sh on comments, ci runs, labels and pushes to main" "$([ -f "$W" ] && grep -q 'ref: main' "$W" && grep -q 'queue-gate.sh event' "$W" && grep -q 'issue_comment' "$W" && grep -q 'workflow_run' "$W" && ! grep -qE 'refs/pull|head\.sha' "$W" && grep -q '"OWNER","MEMBER","COLLABORATOR"' "$W" && grep -q 'types: \[labeled, unlabeled\]' "$W" && grep -q "contains(github.event.comment.body, 'Lead read the diff')" "$W" && echo 1)" "$W (an outsider's comment must start no write-token run, review m2)"
 finish
diff --git a/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/queue-gate.sh b/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/queue-gate.sh
index 8aaf13e49..a8b1a50fd 100755
--- a/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/queue-gate.sh
+++ b/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/queue-gate.sh
@@ -5,7 +5,11 @@
 #            by the repository owner's account or a login in REVIEWERS (space-separated; the repository variable, so no
 #            name sits in a file), author association OWNER, MEMBER or COLLABORATOR, and it is the last "Reviewer:"
 #            line naming that head (a later "Changes needed" on it wins); (b) the check "ci" on that head is green; (c) no changed path
-#            matches lead-read-paths.txt (.github/, .mergify.yml, migrations, money: those keep the Lead's read, P-423).
+#            matches lead-read-paths.txt (.github/, .mergify.yml, migrations, money: those keep the Lead's read, P-423),
+#            unless (B200, P-637) a comment line "Lead read the diff: <9 to 40 hex characters of the head SHA>" by an
+#            OWNER or MEMBER account names the current head (a newer push needs a new read), or the PR is records only:
+#            the label "records" (records-label.yml) and every changed path a Markdown file under product/, never
+#            product/tools/ (those need no Lead's read; the Approve and a green ci still do).
 #            No more waiting for a sleeping lane to wake and label. A refusal is commented only when the Approve comment
 #            itself started the run. label-sweep.sh keeps a github-actions[bot] label only when `eligible` passes.
 #   fresh  — the commit status "queue-fresh" that Mergify's product queue needs for a PR touching prototype/
@@ -34,6 +38,7 @@ pages() { local p=1 all='[]' one sep='?'; case "$1" in *\?*) sep='&';; esac
     all=$(jq -s '.[0] + .[1]' <(echo "$all") <(echo "$one")); [ "$(echo "$one" | jq length)" -lt 100 ] && break; p=$((p + 1))
   done; echo "$all"; }
 OWNER="${REPO%%/*}"
+NOTE='^ai-workers/[^/]+/product/([^/]+/)*[^/]+\.md$'   # B200: a records-only PR's paths
 CODE='/prototype/'; DOCS='\.(md|txt|png|jpe?g|gif|webp|svg|pdf)$'; MIG='/prisma/migrations/'
 
 load() {  # PR → pr, head, files, labels
@@ -71,7 +76,16 @@ judge() {  # eligibility for the label; reason in $why
   grep -qiE "^[[:space:]]*reviewer:[[:space:]]*approve[sd]?[[:space:]]+$head\b" <<< "$last" \
     || { why="the last \"Reviewer:\" verdict about $head from the owner's account or a known reviewer is not an Approve naming it"; return 1; }
   bad=$(grep -iEf <(grep -v '^#' "$HERE/lead-read-paths.txt" | grep .) <<< "$files" | head -3 | sed 's/.*/`&`/' | paste -sd ' ' -)
-  [ -z "$bad" ] || { why="it touches a path that keeps the Lead's read (P-423): $bad"; return 1; }
+  read_by=""
+  if [ -n "$bad" ] && has records && [ -z "$(grep -vE "$NOTE" <<< "$files"; true)" ] && ! grep -qiE '/product/tools/' <<< "$files"; then
+    bad=""; read_by=" (records only: no Lead's read needed)"; fi
+  if [ -n "$bad" ]; then   # B200: the Lead's read of this head, by an OWNER or MEMBER account (a COLLABORATOR's is not)
+    local rd; rd=$(echo "$cs" | jq -r '.[] | select(.author_association == "OWNER" or .author_association == "MEMBER") | .body' | tr -d '*_`' \
+      | grep -oiE '^[[:space:]]*lead read the diff:?[[:space:]]+[0-9a-f]{9,40}\b' | grep -oiE '[0-9a-f]{9,40}$' | tr A-F a-f; true)
+    # Only a line that starts with it, and only the SHA right after it (the gate's own refusal quotes the line mid-line).
+    for x in $rd; do case "$head" in "$x"*) bad=""; read_by=" (the Lead read the diff of ${head:0:9}, P-423)"; break;; esac; done
+  fi
+  [ -z "$bad" ] || { why="it touches a path that keeps the Lead's read (P-423): $bad, and no \"Lead read the diff: ${head:0:9}\" names this head"; return 1; }
   ci; [ "$ci_state" = success ] || { why="ci on ${head:0:9} is $ci_state"; return 1; }
   return 0; }
 
@@ -109,22 +123,23 @@ label() {
   has "$LABEL" && { echo "#$PR: already labelled"; return 0; }
   if ! judge; then
     echo "#$PR: not labelled: $why"
-    [ "${TRIGGER:-}" = approve ] && api -X POST "$API/repos/$REPO/issues/$PR/comments" -d "$(jq -n --arg b "**Queue gate (B194):** \`$LABEL\` not put on by itself: $why. A person labels it after the Lead's read where P-423 asks for one.
+    [ "${TRIGGER:-}" = approve ] && api -X POST "$API/repos/$REPO/issues/$PR/comments" -d "$(jq -n --arg b "**Queue gate (B194):** \`$LABEL\` not put on by itself: $why. Where P-423 asks for the Lead's read, the Lead comments a line \"Lead read the diff: <head SHA>\" after reading, and the gate labels it (B200).
 
 ---
 _Generated by [Claude Code](https://claude.ai/code)_" '{body: $b}')" >/dev/null
     return 0; fi
   LABELLING=1 fresh || return 2; did_fresh=1   # review M2: queue-fresh is decided before the label goes on
   api -X POST "$API/repos/$REPO/issues/$PR/labels" -d "$(jq -n --arg l "$LABEL" '{labels: [$l]}')" >/dev/null || { echo "#$PR: could not label"; return 2; }
-  labels="$labels"$'\n'"$LABEL"; echo "#$PR: labelled ($head has the reviewer's Approve and a green ci; no Lead-read path)"
-  api -X POST "$API/repos/$REPO/issues/$PR/comments" -d "$(jq -n --arg b "**Queue gate (B194):** \`$LABEL\` put on: \"Reviewer: Approve ${head:0:9}\" names the head, ci is green on it, and no path keeps the Lead's read (P-423)." '{body: $b}')" >/dev/null || true; }
+  local how=", and no path keeps the Lead's read (P-423)"; [ -z "${read_by:-}" ] || how=$read_by
+  labels="$labels"$'\n'"$LABEL"; echo "#$PR: labelled ($head has the reviewer's Approve and a green ci${read_by:-; no Lead-read path})"
+  api -X POST "$API/repos/$REPO/issues/$PR/comments" -d "$(jq -n --arg b "**Queue gate (B194):** \`$LABEL\` put on: \"Reviewer: Approve ${head:0:9}\" names the head, ci is green on it$how." '{body: $b}')" >/dev/null || true; }
 
 both() {  # label, then fresh unless label already decided it; any error → 2 (review m6)
   local rc=0; did_fresh=0; label || rc=$?; [ "$did_fresh" = 1 ] || fresh || rc=$?; return $rc; }
 event() {
   local e="${GITHUB_EVENT_PATH:-/dev/null}" n rc=0
   case "${GITHUB_EVENT_NAME:-}" in
-    issue_comment) jq -e '.issue.pull_request != null and (.comment.body | test("reviewer:\\s*approve"; "i"))' "$e" >/dev/null || { echo "not an Approve comment on a PR"; return 0; }
+    issue_comment) jq -e '.issue.pull_request != null and (.comment.body | test("reviewer:\\s*approve|lead read the diff"; "i"))' "$e" >/dev/null || { echo "not an Approve or a Lead's read on a PR"; return 0; }
       PR=$(jq -r .issue.number "$e"); TRIGGER=approve both || rc=$?;;
     workflow_run) for n in $(jq -r '.workflow_run.pull_requests[].number' "$e"); do PR=$n; both || rc=$?; done;;   # a fork PR has none: no queue-fresh (fails closed)
     pull_request_target) PR=$(jq -r .pull_request.number "$e"); fresh || rc=$?;;
-- 
2.43.0


From bb181a7bcc7aa524be547136a3035d538648825e Mon Sep 17 00:00:00 2001
From: Claude <noreply@anthropic.com>
Date: Mon, 16 Nov 2026 05:17:06 +0000
Subject: [PATCH 2/2] =?UTF-8?q?tooling:=20B200=20=E2=80=94=20guard=2015=20?=
 =?UTF-8?q?readevent=20mutation=20without=20a=20pipe=20(the=20list=20split?=
 =?UTF-8?q?s=20on=20|)?=
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018BSQJopRBi3cobhinCA66g
---
 .../product/tools/check-guards.sh                               | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

diff --git a/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-guards.sh b/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-guards.sh
index e4ad4c360..9283e8e89 100755
--- a/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-guards.sh
+++ b/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-guards.sh
@@ -71,7 +71,7 @@ MUT='1|product/tools/check-docs.sh|/CURRENT LEAD: STATE.md has/d|check-current-l
 15 readline|product/tools/queue-gate.sh|s/\^\[\[:space:\]\]\*lead read the diff/lead read the diff/|check-queue-gate.sh
 15 records|product/tools/queue-gate.sh|s/has records \&\& //|check-queue-gate.sh
 15 rectools|product/tools/queue-gate.sh|s/ \&\& ! grep -qiE .\/product\/tools\/. <<< "\$files"; then/; then/|check-queue-gate.sh
-15 readevent|../../.github/workflows/queue-gate.yml|s/ || contains(github.event.comment.body, .Lead read the diff.)//|check-queue-gate.sh'
+15 readevent|../../.github/workflows/queue-gate.yml|s/contains(github.event.comment.body, .Lead read the diff.)/false/|check-queue-gate.sh'
 pyparse() { python3 -I -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "${@: -1}"; }   # "$sh -n FILE" for a .py
 echo "--- each test without its guard (must FAIL)"
 while IFS='|' read -r g f edit t; do
-- 
2.43.0

````
