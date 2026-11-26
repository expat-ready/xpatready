#!/usr/bin/env bash
# P-785 (2) step 1: the Lead-read gate (lead-read-gate.sh). GitHub is answered by a stand-in curl (the PR, its files
# with their patches, its comments from files; POSTed statuses written to a log). The gap of 22 Nov is the first
# fixture: #2897's own added line, a @PermissionKeys route in platform/settings/offices/routes.ts, must be held until
# the Lead's read names the head. Then: every kept path, the read line's forms and who may write it, what is not held,
# report-only against block, failing closed, and the workflow's shape. US$0, no network.
#   bash product/tools/check-lead-read-gate.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/lrg.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/fx"
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
m=GET; d=""; u=""
while [ $# -gt 0 ]; do case "$1" in -X) m=$2; shift;; -d) d=$2; shift;; -H) shift;; http*) u=$1;; esac; shift; done
p=${u#https://api.test/repos/o/r/}; pg=$(printf '%s' "$u" | sed -n 's/.*[?&]page=\([0-9]*\).*/\1/p')
serve() { [ -f "$FX/$1" ] && cat "$FX/$1" || { echo '{"message":"Not Found"}'; exit 22; }; }
case "$m $p" in
  "GET pulls/"*/files*) n=${p#pulls/}; n=${n%%/*}; if [ -f "$FX/files-$n-p${pg:-1}.json" ]; then cat "$FX/files-$n-p${pg:-1}.json"; elif [ "${pg:-1}" = 1 ]; then serve "files-$n.json"; else echo '[]'; fi;;
  "GET pulls?"*) [ "${pg:-1}" = 1 ] && serve pulls.json || echo '[]';;
  "GET pulls/"*) serve "pr-${p#pulls/}.json";;
  "GET issues/"*/comments*) n=${p#issues/}; n=${n%%/*}; if [ -f "$FX/comments-$n-p${pg:-1}.json" ]; then cat "$FX/comments-$n-p${pg:-1}.json"; elif [ "${pg:-1}" = 1 ]; then serve "comments-$n.json"; else echo '[]'; fi;;
  "POST statuses/"*) echo "STATUS ${p#statuses/} $(echo "$d" | jq -r '.context + " " + .state + " " + .description')" >> "$FX/log"; echo '{}';;
  *) echo "unexpected $m $p" >> "$FX/log"; exit 22;;
esac
EOF
chmod +x "$T/bin/curl"
G="$TOOLS/lead-read-gate.sh"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
if [ ! -f "$G" ]; then ok "lead-read-gate.sh exists (P-785 (2) step 1)" 0 "no $G: a labelled PR with a permission route queues without the Lead's read"; finish; fi
S=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio; PR3=ai-workers/problem-1-pathway-setup-and-form-filling/product
HEAD1=1111111aaaaaaa1111111aaaaaaa1111111aaaaa; OLD=2222222bbbbbbb2222222bbbbbbb2222222bbbbb
prj() {  # prj <n> [head ref] [base] [author] [head repo] → pulls/<n>
  jq -n --argjson n "$1" --arg h "$HEAD1" --arg r "${2:-claude/x}" --arg b "${3:-main}" --arg u "${4:-builder}" --arg hr "${5:-o/r}" \
    '{number: $n, state: "open", user: {login: $u}, base: {ref: $b}, head: {sha: $h, ref: $r, repo: {full_name: $hr}}}' > "$T/fx/pr-$1.json"; }
FILES='[]'
f() {  # f <path> [patch] [status] [previous path]: one changed file; no patch argument = GitHub gave none
  FILES=$(jq -c --arg f "$1" --arg p "${2-}" --arg s "${3:-modified}" --arg o "${4:-}" --argjson has "$([ $# -ge 2 ] && echo true || echo false)" \
    '. + [{filename: $f, status: $s, changes: 3} + (if $has then {patch: $p} else {} end) + (if $o != "" then {previous_filename: $o} else {} end)]' <<< "$FILES"); }
put() { echo "$FILES" > "$T/fx/files-7.json"; FILES='[]'; }
CS='[]'
cmt() {  # cmt <association> <body> [login] [edited]
  CS=$(jq -c --arg a "$1" --arg b "$2" --arg l "${3:-lead}" --arg e "${4:-}" '. + [{user: {login: $l}, author_association: $a, body: $b,
    created_at: "2026-11-22T01:00:00Z", updated_at: (if $e == "" then "2026-11-22T01:00:00Z" else "2026-11-22T02:00:00Z" end)}]' <<< "$CS"); echo "$CS" > "$T/fx/comments-7.json"; }
nocmt() { CS='[]'; echo '[]' > "$T/fx/comments-7.json"; }
run() {  # run <mode> → $out $log $r
  : > "$T/fx/log"; out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x REPO=o/r API=https://api.test PR=7 LEAD_READ_GATE="${GATE:-}" LEAD_READ_PATHS="${LRP:-}" LEAD_LOGINS="${LEADS:-}" \
    GITHUB_EVENT_PATH="${EV:-}" bash "$G" "$1" 2>&1); r=$?; log=$(cat "$T/fx/log"); }
held() { [ "$r" = 1 ] && grep -q '^HOLD ' <<< "$out" && echo 1; }
free() { [ "$r" = 0 ] && grep -q '^OK ' <<< "$out" && echo 1; }
HUNK='@@ -20,6 +20,8 @@ export class OfficesRoutes {'
prj 7; nocmt

# --- the gap of 22 Nov: #2897's own line
f "$S/api/src/platform/settings/offices/routes.ts" "$HUNK
   constructor(private readonly s: OfficesService) {}
+  @Get(\"provinces\") @PermissionKeys(\"agent/settings:edit\")
+  provinces() { return this.s.provinces(); }"; f "$S/web/src/modules/platform/settings/offices-page.tsx" "+export const x = 1;"; put
run judge
ok "the gap of 22 Nov: a PR adding a @PermissionKeys route (as #2897) is held with no Lead read" "$(held)" "exit $r: $out"
ok "... and the reason names the file and the line to write, with the full SHA" "$(grep -q 'offices/routes.ts' <<< "$out" && grep -q "Lead read the diff: $HEAD1" <<< "$out" && echo 1)" "$out"
cmt MEMBER "Reviewer: Approve $HEAD1"; run judge
ok "a reviewer's Approve is not the Lead's read" "$(held)" "exit $r: $out"
cmt MEMBER "Lead read: OK $HEAD1

Existing keys, used as for the rest of Settings."; run judge
ok "Lead read: OK <head> by someone with write access frees it" "$(free)" "exit $r: $out"
nocmt; cmt OWNER "Lead read the diff: $HEAD1"; run judge
ok "the line the Lead writes today (Lead read the diff: <full sha>) counts the same" "$(free)" "exit $r: $out"
nocmt; cmt MEMBER "**Lead read: OK** \`$HEAD1\`."; run judge
ok "markdown marks around the line do not hide it" "$(free)" "exit $r: $out"
nocmt; cmt MEMBER "Lead read: OK $OLD"; run judge
ok "a read of an older head does not count (a push needs a new read)" "$(held)" "exit $r: $out"
nocmt; cmt NONE "Lead read: OK $HEAD1"; run judge
ok "a read line from outside the repository's writers does not count" "$(held)" "exit $r: $out"
nocmt; cmt CONTRIBUTOR "Lead read: OK $HEAD1"; run judge
ok "... nor from a past contributor without write access" "$(held)" "exit $r: $out"
nocmt; cmt MEMBER "> Lead read: OK $HEAD1"; run judge
ok "a quoted read line is not the Lead's own" "$(held)" "exit $r: $out"
nocmt; cmt MEMBER "Lead read: not yet, $HEAD1 needs a fix"; run judge
ok "a line that is not the read (no OK) does not count" "$(held)" "exit $r: $out"
nocmt

# --- (b) the lines that declare access
line() { f "$1" "$HUNK
 context
$2"; put; run judge; }
line "$S/api/src/platform/staff/routes.ts" "-  @Put(\":id\") @PermissionKeys(\"agent/staff:manage\")"
ok "a removed @PermissionKeys line is held (a route losing its key)" "$(held)" "exit $r: $out"
line "$S/api/src/front-office/sales/routes.ts" "+  @AnyStaff(\"their own profile\")"
ok "@AnyStaff( is held" "$(held)" "exit $r: $out"
line "$S/api/src/platform/identity-door/routes.ts" "+  @StaffSignIn(\"the door\")"
ok "@StaffSignIn( is held" "$(held)" "exit $r: $out"
line "$S/api/src/front-office/leads/routes.ts" "+  @OwnOrAll(\"agent/prospect\")"
ok "@OwnOrAll( is held" "$(held)" "exit $r: $out"
line "$S/api/src/team.ts" "+const MANAGE = \"agent/staff:manage\";"
ok "a quoted permission key in an unfenced API file is held" "$(held)" "exit $r: $out"
line "$S/api/src/platform/audit/keys.ts" "+export const AUDIT_READ = 'agent/audit:view.all';"
ok "... in single quotes too" "$(held)" "exit $r: $out"
line "$S/api/src/platform/ops/routes.ts" "+  @PermissionKeys(\`system/firm:suspend\`)"
ok "a system/ key is held" "$(held)" "exit $r: $out"
line "$S/api/src/front-office/booking/routes.ts" "+  @Post(\"slots\")"
ok "a route line of a walled module is held (its access may sit on the next line)" "$(held)" "exit $r: $out"
line "$S/api/src/client-money/routes.ts" "-  @Delete(\":id\")"
ok "... and a removed one, in client-money" "$(held)" "exit $r: $out"
f "$S/api/src/platform/big/service.ts"; put; run judge
ok "an API source file whose patch GitHub does not give is held (fails closed)" "$([ -n "$(held)" ] && grep -q 'too large' <<< "$out" && echo 1)" "exit $r: $out"
# not held
line "$S/api/src/forms.ts" "+  @Get(\"x\")"
ok "a route line outside the walled modules is not held" "$(free)" "exit $r: $out"
line "$S/api/src/platform/settings/offices/service.ts" " // routes use @PermissionKeys(\"agent/settings:edit\")
+  const zone = office.zone ?? firm.zone;"
ok "a context line naming a key holds its hunk (the hunk rule: a split decorator, break round 2 M1)" "$(held)" "exit $r: $out"
line "$S/web/src/modules/platform/settings/offices-page.tsx" "+// the route is @PermissionKeys(\"agent/settings:edit\")"
ok "a web file is not an API source file: not held by a key it shows" "$(free)" "exit $r: $out"
line "$S/api/src/platform/settings/NOTES.md" "+@PermissionKeys(\"agent/settings:edit\")"
ok "a .md under api/src is not a source file" "$(free)" "exit $r: $out"
line "$S/api/src/forms-x/send/messages.ts" "+const url = \"agent/inbox\";
+const t = \"12:30\";"
ok "a string that is not a key (no area:verb) is not held" "$(free)" "exit $r: $out"

# --- (a) the kept paths, from main's own list
for p in ".github/workflows/ci.yml" ".mergify.yml" "$PR3/tools/queue-gate.sh" "$S/prisma/migrations/20261122_x/migration.sql" "$S/prisma/schema/platform.prisma" \
         "$S/api/src/client-money/ledger.ts" "$S/web/src/modules/platform/billing/page.tsx" ".claude/settings.json" "AGENTS.md"; do
  f "$p" "+x"; put; run judge
  ok "kept path: $p is held" "$(held)" "exit $r: $out"
done
f "$S/api/src/moved.ts" "" renamed "$S/prisma/migrations/20261101_y/migration.sql"; put; run judge
ok "a file renamed out of a kept path is held by its old name" "$(held)" "exit $r: $out"
f "$S/web/src/modules/platform/settings/office-panel.tsx" "+x"; f "$S/tests/check_pf18s_offices_browser.ts" "+x"; put; run judge
ok "a PR of web and test files only is not held" "$(free)" "exit $r: $out"
# #2428's marker: with it, the lines after it are not set off by a screenshot or an image or .txt under product/
printf '^\\.github/\n# --- records-exempt: below\npayment\npermission\n' > "$T/lrp.txt"
f "$PR3/screens/R1.58/payment-shot.png" ""; f "$PR3/qa/reports/x/payment-run.txt" "+x"; put; LRP="$T/lrp.txt" run judge
ok "with the records-exempt marker (#2428), a payment screenshot and a .txt under product/ are not held" "$(free)" "exit $r: $out"
f "$PR3/tools/payment-shot.png" ""; put; LRP="$T/lrp.txt" run judge
ok "... an image under product/tools/ still is" "$(held)" "exit $r: $out"
f "$S/api/src/payment-rules.ts" "+x"; put; LRP="$T/lrp.txt" run judge
ok "... and so is code on a line after the marker" "$(held)" "exit $r: $out"
f ".github/screens/payment.png" ""; put; LRP="$T/lrp.txt" run judge
ok "... and anything on a line before the marker" "$(held)" "exit $r: $out"
f "$S/web/src/x.tsx" "+x"; put; LRP="$T/none.txt" run judge
ok "the list cannot be read: exit 2, nothing passes (fails closed)" "$([ "$r" = 2 ] && echo 1)" "exit $r: $out"
jq -n '[range(0; 3000) | {filename: "a/\(.).txt", status: "added", changes: 1, patch: "+x"}]' > "$T/fx/files-7.json"
# (the stand-in serves the whole list as page 1)
run judge
ok "a PR of 3000 files or more is held (GitHub lists no more)" "$( { [ "$r" = 1 ] && grep -q '3000 files' <<< "$out"; } && echo 1)" "exit $r: $out"


# --- the breaker's findings on 6d7b5a42a (screens/P785-1/break-report.md), each a fixture
nocmt; f ".github/workflows/ci.yml" "+    permissions: write-all"; put
prj 7 mergify/merge-queue/x main someone; run judge
ok "B1: a branch named mergify/... by anyone but Mergify's bot is judged like any PR" "$(held)" "exit $r: $out"
prj 7 mergify/merge-queue/x main "mergify[bot]" fork/r; run judge
ok "B1: ... and so is one from another repository, even under the bot's name" "$(held)" "exit $r: $out"
prj 7
for p in "$S/api/src/platform/identity/guard.ts" "$S/api/src/platform/identity/keys.ts" "$S/api/src/platform/identity/catalogue.ts" "$S/api/src/core.ts" \
         "$S/api/src/platform/firm-scope.ts" "$S/api/src/platform/terms/gate.ts" "$S/api/src/features/platform-terms.ts"; do
  f "$p" "+    if (access.kind === \"sign-in\" || access.kind === \"any-staff\") return true;"; put; run judge
  ok "B2: the permission machinery itself is a kept path: $p" "$(held)" "exit $r: $out"
done
f "$S/api/src/platform/audit/firm-read/routes.ts" "@@ -20,4 +20,4 @@
   @Get(\"audit\")
   @PermissionKeys(
-    AUDIT_READ,
+    AUDIT_READ_OWN,"; put; run judge
ok "M1: any changed line of a walled routes file is held (a split decorator's argument)" "$(held)" "exit $r: $out"
line "$S/api/src/platform/support/consts.ts" "+const k = (verb: string) => \`agent/support:\${verb}\`;"
ok "M1: a key built from a template (agent/support:\${verb}) is held" "$(held)" "exit $r: $out"
line "$S/api/src/platform/support/consts.ts" "+const k = \`agent/\${AREA}:list\`;"
ok "M1: ... and agent/\${AREA}:list" "$(held)" "exit $r: $out"
line "$S/api/src/platform/support/consts.ts" "+export const SUPPORT_LIST = \"agent/\" + \"support:list\";"
ok "M1: a key built by concatenation is held" "$(held)" "exit $r: $out"
line "$S/api/src/team.ts" "+const k = \"agent/support:\" + verb;"
ok "M1: ... and \"agent/support:\" + verb" "$(held)" "exit $r: $out"
line "$S/samples/notification-groups.json" "-\"whoSeesIt\": { \"kind\": \"key\", \"key\": \"agent/invoice:list\" }
+\"whoSeesIt\": { \"kind\": \"everyone\" }"
ok "M2: an access rule in a samples JSON file is held" "$(held)" "exit $r: $out"
for x in mts js json cjs tsx; do line "$S/api/src/platform/settings/keys2.$x" "+  @AnyStaff(\"all\") 'agent/settings:edit'"
  ok "M2: an API source or data file .$x is read" "$(held)" "exit $r: $out"; done
f "$S/api/src/platform/settings/routes.mts" "+  @Get(\"x\")" renamed "$S/api/src/platform/settings/routes.ts"; put; run judge
ok "M2: a walled routes.ts renamed to .mts with a route line is held" "$(held)" "exit $r: $out"
f "$S/api/src/x/a.txt" "+  @PermissionKeys(\"agent/settings:edit\")" renamed "$S/api/src/x/a.ts"; put; run judge
ok "M2: rule (b) reads a rename's old name too" "$(held)" "exit $r: $out"
f "$S/api/src/platform/offices/routes.ts" "+  @Get(\"x\") @AnyStaff(\"x\")"; put
for c in "Lead read: OK ${HEAD1:0:7}" "Lead read: OK ${HEAD1:0:9}" "Lead read the diff: ${HEAD1:0:12}" "Lead read: OK ${HEAD1}0"; do
  nocmt; cmt MEMBER "$c"; run judge; ok "M3: only the full 40-character head counts, not: $c" "$(held)" "exit $r: $out"; done
nocmt; cmt OWNER "Lead read: OK $HEAD1" lead edited; run judge
ok "M4: an edited comment never counts (a writer can edit another's comment)" "$(held)" "exit $r: $out"
nocmt; cmt COLLABORATOR "Lead read: OK $HEAD1" someone; LEADS="lead other" run judge
ok "M4: with LEAD_LOGINS set, a writer not named there does not count" "$(held)" "exit $r: $out"
nocmt; cmt COLLABORATOR "Lead read: OK $HEAD1" builder; LEADS="lead builder" run judge
ok "M4: ... nor the PR's own author, even when named" "$(held)" "exit $r: $out"
nocmt; cmt MEMBER "Lead read: OK $HEAD1" lead; LEADS="lead" run judge
ok "M4: ... and a named login that is not the author does" "$(free)" "exit $r: $out"
for c in "Lead read: OK $HEAD1 is NOT what I can give: blocker" "Lead read the diff: $HEAD1. Verdict: Block" "<!-- Lead read: OK $HEAD1 -->" "\`\`\`
Lead read: OK $HEAD1
\`\`\`" "~~~
Lead read: OK $HEAD1
~~~"; do
  nocmt; cmt MEMBER "$c"; run judge; ok "m1, m2: not a read: $(head -1 <<< "$c" | cut -c1-40)" "$(held)" "exit $r: $out"; done
nocmt; cmt MEMBER "Lead read the diff $HEAD1"; run judge
ok "the Lead's line without a colon, full SHA, counts" "$(free)" "exit $r: $out"
nocmt; line "$S/api/src/platform/x/service.ts" "--- @Get(\"x\")"
ok "m3: a changed line whose text starts with -- is read (GitHub's patch has no file headers)" "$(held)" "exit $r: $out"
f ".mergify.yml" "+x"; put; GATE=BLOCK run status
ok "m4: LEAD_READ_GATE in capitals is block" "$(grep -q "lead-read failure" <<< "$log" && echo 1)" "$out / $log"
GATE=blok run status
ok "m4: an unknown LEAD_READ_GATE fails closed (block)" "$(grep -q "lead-read failure" <<< "$log" && echo 1)" "$out / $log"

# --- the reviewer's findings on 6d7b5a42a (screens/P785-1/review.md)
nocmt; f "$S/api/src/platform/offices/routes.ts" "+  @Get(\"x\") @AnyStaff(\"x\")"; put
for i in $(seq 1 60); do cmt MEMBER "Lead read the diff: $HEAD1"; done; cmt MEMBER "Lead read: OK $HEAD1"
held_n=0; for i in 1 2 3 4 5 6 7 8 9 10; do run judge; [ "$r" = 0 ] || held_n=$((held_n + 1)); done
ok "review M1: many read lines naming the head are read every time (no early-exit pipe under pipefail)" "$([ $held_n = 0 ] && echo 1)" "held $held_n of 10: $out"
nocmt
jq -n '[range(0; 100) | {filename: "web/x\(.).tsx", status: "modified", changes: 1, patch: "+x"}]' > "$T/fx/files-7.json"
jq -n '[{filename: ".mergify.yml", status: "modified", changes: 1, patch: "+x"}]' > "$T/fx/files-7-p2.json"; run judge
ok "review m3: a kept path on the second page of files is held (paging)" "$(held)" "exit $r: $out"
jq -n '[range(0; 100) | {user: {login: "x"}, author_association: "MEMBER", body: "note", created_at: "t", updated_at: "t"}]' > "$T/fx/comments-7.json"
jq -n --arg h "$HEAD1" '[{user: {login: "lead"}, author_association: "MEMBER", body: ("Lead read the diff: " + $h), created_at: "t", updated_at: "t"}]' > "$T/fx/comments-7-p2.json"; run judge
ok "review m3: a read on the second page of comments counts (paging)" "$(free)" "exit $r: $out"
rm -f "$T/fx/files-7-p2.json" "$T/fx/comments-7-p2.json"; nocmt
jq -n '[range(0; 2000) | {filename: ("ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/platform/very/long/folder/name/number/\(.)/routes.ts"), status: "modified", changes: 1, patch: "+  @Get(\"x\")"}]' > "$T/fx/files-7.json"; GATE=report run status
ok "review m4: 2000 held API files are held (pending in report-only), not 'cannot be read'" "$(grep -q 'lead-read pending' <<< "$log" && echo 1)" "exit $r: $out / $log"

# --- the breaker's round 2 (daa2d4e22)
nocmt
SPLIT='@@ -24,4 +24,4 @@
   @Put("booking-timings")
   @PermissionKeys(
-    LIST,
+    VIEW,
   )'
for p in "$S/api/src/front-office/booking/settings/timings.controller.ts" "$S/api/src/platform/messages/staff-routes.ts" "$S/api/src/platform/x/routes.helpers.ts" \
         "$S/api/src/platform/x/Routes.ts" "$S/api/src/platform/x/routes/index.ts" "$S/api/src/features/case-close.ts" "$S/api/src/forms.ts"; do
  f "$p" "$SPLIT"; put; run judge
  ok "round 2 M1: a split decorator's changed argument is held by its hunk's context: $p" "$(held)" "exit $r: $out"; done
f "$S/api/src/platform/x/service.ts" '@@ -1,3 +1,3 @@
 // uses @PermissionKeys("agent/x:y") on the route
-const a = 1;
+const a = 2;
@@ -40,3 +40,3 @@
 const z = 0;
-const b = 1;
+const b = 2;'; put; run judge
ok "round 2 M1: ... (a hunk whose context names a key counts; that is the price of the rule)" "$(held)" "exit $r: $out"
f "$S/api/src/platform/x/service.ts" '@@ -40,3 +40,3 @@
 const z = 0;
-const b = 1;
+const b = 2;'; put; run judge
ok "round 2 M1: a walled service hunk with no access word anywhere is not held" "$(free)" "exit $r: $out"
for p in "$S/api/src/front-office/booking/settings/timings.controller.ts" "$S/api/src/platform/x/Public-Routes.ts" "$S/api/src/platform/identity-door/keys.mts"; do
  f "$p" '@@ -40,3 +40,3 @@
 const z = 0;
-const b = 1;
+const b = 2;'; put; run judge
  ok "round 2 M1: any changed line of a walled routes, controller, keys or guard file is held, any case: $p" "$(held)" "exit $r: $out"; done
f "$S/samples/notification-groups.json" '+  "kind": "everyone",'; put; run judge
ok "round 2 m1: any line of samples/notification-groups.json is held (a kept path)" "$(held)" "exit $r: $out"
f ".mergify.yml" "+x"; put
nocmt; cmt MEMBER "    Lead read the diff: $HEAD1"; run judge
ok "round 2 m2: a read in a 4-space indented code block does not count" "$(held)" "exit $r: $out"
nocmt; cmt MEMBER "	Lead read the diff: $HEAD1"; run judge
ok "round 2 m2: ... nor tab-indented" "$(held)" "exit $r: $out"
nocmt; CS=$(jq -c --arg b "Lead read the diff: $HEAD1" '[{user: {login: "lead"}, author_association: "MEMBER", body: $b}]' <<< '[]'); echo "$CS" > "$T/fx/comments-7.json"; run judge
ok "round 2 m4: a comment without its creation time does not count" "$(held)" "exit $r: $out"
nocmt; cmt MEMBER "Lead read the diff: $HEAD1" Lead; LEADS="lead,other" run judge
ok "round 2 m5: LEAD_LOGINS split on commas and compared without case" "$(free)" "exit $r: $out"
nocmt

# --- who is judged
f ".github/workflows/ci.yml" "+x"; put
prj 7 mergify/merge-queue/abc main "mergify[bot]"; run judge
ok "Mergify's own batch PR is not held (each of its PRs is judged by itself)" "$(free)" "exit $r: $out"
prj 7 claude/x some-branch; run status
ok "a PR into another branch gets no status" "$([ "$r" = 0 ] && [ -z "$log" ] && grep -q SKIP <<< "$out" && echo 1)" "exit $r: $out / $log"
prj 7

# --- the status: report-only first (P-717 (b)), then block
run status
ok "report-only (the default): a held PR is pending, with what would hold it; never failure" "$(grep -q "^STATUS $HEAD1 lead-read pending report-only" <<< "$log" && echo 1)" "$out / $log"
GATE=block run status
ok "LEAD_READ_GATE=block: a held PR is failure, the line to write first in the description (R2-2)" "$(grep -q "^STATUS $HEAD1 lead-read failure needs the line \"Lead read the diff: $HEAD1\"" <<< "$log" && echo 1)" "$out / $log"
cmt MEMBER "Lead read: OK $HEAD1"; GATE=block run status
ok "... and success once the Lead's read names the head" "$(grep -q "^STATUS $HEAD1 lead-read success" <<< "$log" && echo 1)" "$out / $log"
nocmt; f "$S/web/src/x.tsx" "+x"; put; GATE=block run status
ok "a PR with nothing kept is success" "$(grep -q "^STATUS $HEAD1 lead-read success no path or line" <<< "$log" && echo 1)" "$out / $log"
rm "$T/fx/files-7.json"; GATE=block run status
ok "its files cannot be read: failure and exit 2 (fails closed)" "$([ "$r" = 2 ] && grep -q "^STATUS $HEAD1 lead-read failure" <<< "$log" && echo 1)" "exit $r: $out / $log"
rm "$T/fx/files-7.json" 2>/dev/null; run status
ok "... in report-only too: an unreadable PR is never success" "$([ "$r" = 2 ] && ! grep -q 'success' <<< "$log" && echo 1)" "exit $r: $out / $log"
f ".mergify.yml" "+x"; put; rm "$T/fx/comments-7.json"; GATE=block run status
ok "its comments cannot be read: failure, not a free pass" "$([ "$r" = 2 ] && grep -q "^STATUS $HEAD1 lead-read failure" <<< "$log" && echo 1)" "exit $r: $out / $log"
nocmt

# --- the event and the sweep
echo '{"pull_request": {"number": 7}}' > "$T/ev.json"; EV="$T/ev.json" GATE=block run event
ok "event: a pull_request_target event judges its PR" "$(grep -q "^STATUS $HEAD1 lead-read failure" <<< "$log" && echo 1)" "$out / $log"
echo '{"issue": {"number": 7, "pull_request": {}}, "comment": {"body": "Lead read: OK"}}' > "$T/ev.json"; EV="$T/ev.json" GATE=block run event
ok "event: a comment on a PR judges that PR" "$(grep -q "^STATUS $HEAD1 lead-read failure" <<< "$log" && echo 1)" "$out / $log"
echo '{"issue": {"number": 7}}' > "$T/ev.json"; EV="$T/ev.json" run event
ok "event: a comment on an issue judges nothing" "$([ "$r" = 0 ] && [ -z "$log" ] && echo 1)" "exit $r: $out / $log"
echo '[{"number": 7}]' > "$T/fx/pulls.json"; GATE=block run sweep
ok "sweep: every open PR into main gets its status" "$(grep -q "^STATUS $HEAD1 lead-read failure" <<< "$log" && echo 1)" "exit $r: $out / $log"

# --- main's list and the workflow
L="$TOOLS/lead-read-paths.txt"
ok "lead-read-paths.txt keeps .github/, .mergify.yml, the schema, migrations and the permission machinery" "$(grep -qx '^\^\\\.github/' "$L" && grep -qx '^\^\\\.mergify\\\.yml\$' "$L" && grep -qx '/prisma/migrations/' "$L" && grep -qx '/prisma/schema/' "$L" && grep -qx '/api/src/platform/identity/' "$L" && echo 1)"
W="$ROOTD/.github/workflows/lead-read.yml"
if [ ! -f "$W" ]; then ok "lead-read.yml exists" 0 "no workflow runs the gate"; finish; fi
wf() { python3 -I - "$W" "$1" <<'PY'
import sys, yaml
w = yaml.safe_load(open(sys.argv[1])); on = w.get("on", w.get(True)) or {}; j = (w.get("jobs") or {}).get("read-gate") or {}
steps = j.get("steps") or []; co = [s for s in steps if str(s.get("uses", "")).startswith("actions/checkout@")]
perms = j.get("permissions") or {}
q = {
 "target": "pull_request_target" in on and "pull_request" not in on and set((on["pull_request_target"] or {}).get("types") or []) >= {"opened", "synchronize", "reopened", "ready_for_review", "edited"},
 "comment": set((on.get("issue_comment") or {}).get("types") or []) >= {"created", "edited", "deleted"},
 "main": len(co) == 1 and (co[0].get("with") or {}).get("ref") == "main" and (co[0].get("with") or {}).get("persist-credentials") is False,
 "nopr": not any("refs/pull" in str(s.get("run", "")) or "head.sha" in str((s.get("with") or {}).get("ref", "")) or "head.ref" in str((s.get("with") or {}).get("ref", "")) for s in steps),
 "token": (w.get("permissions") == {}) and perms.get("statuses") == "write" and not [k for k, v in perms.items() if v == "write" and k != "statuses"],
 "runs": any("product/tools/lead-read-gate.sh event" in str(s.get("run", "")) or "product/tools/lead-read-gate.sh sweep" in str(s.get("run", "")) for s in steps),
 "keep": (j.get("concurrency") or {}).get("cancel-in-progress") is False,
 "switch": any("vars.LEAD_READ_GATE" in str((s.get("env") or {}).get("LEAD_READ_GATE", "")) and "vars.LEAD_LOGINS" in str((s.get("env") or {}).get("LEAD_LOGINS", "")) for s in steps),
 "rejudge": "contains(github.event.changes.body.from, 'Lead read')" in str(j.get("if", "")),   # OS-78c: an edit is judged on its old body too
}
print(1 if q[sys.argv[2]] else 0)
PY
}
ok "lead-read.yml runs on pull_request_target (main's copy of the workflow), every push and base change, never on pull_request" "$(wf target)"
ok "... and on a PR comment created, edited or deleted (the read line may be any of them)" "$(wf comment)"
ok "... checks out main only, keeps no credentials" "$(wf main)"
ok "... never fetches or checks out the PR's commits" "$(wf nopr)"
ok "... holds one write scope, statuses" "$(wf token)"
ok "... runs lead-read-gate.sh" "$(wf runs)"
ok "... never cancels a run in progress (the newest verdict must land)" "$(wf keep)"
ok "... passes the kill switch vars.LEAD_READ_GATE and vars.LEAD_LOGINS" "$(wf switch)"
ok "... judges again on an edited or deleted writer comment whose old or new body names the read (a read taken back; OS-78c, check-comment-words.sh)" "$(wf rejudge)"
finish
