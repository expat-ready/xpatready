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
  "GET pulls/"*/files*) n=${p#pulls/}; n=${n%%/*}; [ "${pg:-1}" = 1 ] && serve "files-$n.json" || echo '[]';;
  "GET pulls?"*) [ "${pg:-1}" = 1 ] && serve pulls.json || echo '[]';;
  "GET pulls/"*) serve "pr-${p#pulls/}.json";;
  "GET issues/"*/comments*) n=${p#issues/}; n=${n%%/*}; [ "${pg:-1}" = 1 ] && serve "comments-$n.json" || echo '[]';;
  "POST statuses/"*) echo "STATUS ${p#statuses/} $(echo "$d" | jq -r '.context + " " + .state + " " + .description')" >> "$FX/log"; echo '{}';;
  *) echo "unexpected $m $p" >> "$FX/log"; exit 22;;
esac
EOF
chmod +x "$T/bin/curl"
G="$TOOLS/lead-read-gate.sh"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
if [ ! -f "$G" ]; then ok "lead-read-gate.sh exists (P-785 (2) step 1)" 0 "no $G: a labelled PR with a permission route queues without the Lead's read"; finish; fi
S=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio; PR3=ai-workers/problem-1-pathway-setup-and-form-filling/product
HEAD1=1111111aaaaaaa1111111aaaaaaa1111111aaaaa; OLD=2222222bbbbbbb2222222bbbbbbb2222222bbbbb
prj() {  # prj <n> [head ref] [base] → pulls/<n>
  jq -n --argjson n "$1" --arg h "$HEAD1" --arg r "${2:-claude/x}" --arg b "${3:-main}" '{number: $n, state: "open", base: {ref: $b}, head: {sha: $h, ref: $r}}' > "$T/fx/pr-$1.json"; }
FILES='[]'
f() {  # f <path> [patch] [status] [previous path]: one changed file; no patch argument = GitHub gave none
  FILES=$(jq -c --arg f "$1" --arg p "${2-}" --arg s "${3:-modified}" --arg o "${4:-}" --argjson has "$([ $# -ge 2 ] && echo true || echo false)" \
    '. + [{filename: $f, status: $s, changes: 3} + (if $has then {patch: $p} else {} end) + (if $o != "" then {previous_filename: $o} else {} end)]' <<< "$FILES"); }
put() { echo "$FILES" > "$T/fx/files-7.json"; FILES='[]'; }
CS='[]'
cmt() { CS=$(jq -c --arg a "$1" --arg b "$2" '. + [{user: {login: "o"}, author_association: $a, body: $b}]' <<< "$CS"); echo "$CS" > "$T/fx/comments-7.json"; }
nocmt() { CS='[]'; echo '[]' > "$T/fx/comments-7.json"; }
run() {  # run <mode> → $out $log $r
  : > "$T/fx/log"; out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x REPO=o/r API=https://api.test PR=7 LEAD_READ_GATE="${GATE:-}" LEAD_READ_PATHS="${LRP:-}" \
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
ok "... and the reason names the file and the line to write" "$(grep -q 'offices/routes.ts' <<< "$out" && grep -q "Lead read: OK ${HEAD1:0:9}" <<< "$out" && echo 1)" "$out"
cmt MEMBER "Reviewer: Approve $HEAD1"; run judge
ok "a reviewer's Approve is not the Lead's read" "$(held)" "exit $r: $out"
cmt MEMBER "Lead read: OK ${HEAD1:0:9}

Existing keys, used as for the rest of Settings."; run judge
ok "Lead read: OK <head> by someone with write access frees it" "$(free)" "exit $r: $out"
nocmt; cmt OWNER "Lead read the diff: $HEAD1"; run judge
ok "the line the Lead writes today (Lead read the diff: <full sha>) counts the same" "$(free)" "exit $r: $out"
nocmt; cmt MEMBER "**Lead read: OK** \`${HEAD1:0:12}\`"; run judge
ok "markdown marks around the line do not hide it" "$(free)" "exit $r: $out"
nocmt; cmt MEMBER "Lead read: OK ${OLD:0:9}"; run judge
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
ok "an unchanged (context) line naming a key does not hold a PR" "$(free)" "exit $r: $out"
line "$S/web/src/modules/platform/settings/offices-page.tsx" "+// the route is @PermissionKeys(\"agent/settings:edit\")"
ok "a web file is not an API source file: not held by a key it shows" "$(free)" "exit $r: $out"
line "$S/api/src/platform/settings/NOTES.md" "+@PermissionKeys(\"agent/settings:edit\")"
ok "a .md under api/src is not a source file" "$(free)" "exit $r: $out"
line "$S/api/src/platform/messages/send/messages.ts" "+const url = \"agent/inbox\";
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

# --- who is judged
f ".github/workflows/ci.yml" "+x"; put
prj 7 mergify/merge-queue/abc; run judge
ok "a merge-queue batch is not held (each of its PRs is judged by itself)" "$(free)" "exit $r: $out"
prj 7 claude/x some-branch; run status
ok "a PR into another branch gets no status" "$([ "$r" = 0 ] && [ -z "$log" ] && grep -q SKIP <<< "$out" && echo 1)" "exit $r: $out / $log"
prj 7

# --- the status: report-only first (P-717 (b)), then block
run status
ok "report-only (the default): a held PR is pending, with what would hold it; never failure" "$(grep -q "^STATUS $HEAD1 lead-read pending report-only" <<< "$log" && echo 1)" "$out / $log"
GATE=block run status
ok "LEAD_READ_GATE=block: a held PR is failure, naming the path" "$(grep -q "^STATUS $HEAD1 lead-read failure waits for the Lead's read (P-423): \`.github/workflows/ci.yml\`" <<< "$log" && echo 1)" "$out / $log"
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
ok "lead-read-paths.txt keeps .github/, .mergify.yml, the schema and migrations" "$(grep -qx '^\^\\\.github/' "$L" && grep -qx '^\^\\\.mergify\\\.yml\$' "$L" && grep -qx '/prisma/migrations/' "$L" && grep -qx '/prisma/schema/' "$L" && echo 1)"
W="$ROOTD/.github/workflows/lead-read.yml"
if [ ! -f "$W" ]; then ok "lead-read.yml exists" 0 "no workflow runs the gate"; finish; fi
wf() { python3 -I - "$W" "$1" <<'PY'
import sys, yaml
w = yaml.safe_load(open(sys.argv[1])); on = w.get("on", w.get(True)) or {}; j = (w.get("jobs") or {}).get("lead-read") or {}
steps = j.get("steps") or []; co = [s for s in steps if str(s.get("uses", "")).startswith("actions/checkout@")]
perms = j.get("permissions") or {}
q = {
 "target": "pull_request_target" in on and "pull_request" not in on and set((on["pull_request_target"] or {}).get("types") or []) >= {"opened", "synchronize", "reopened", "ready_for_review"},
 "comment": set((on.get("issue_comment") or {}).get("types") or []) >= {"created", "edited", "deleted"},
 "main": len(co) == 1 and (co[0].get("with") or {}).get("ref") == "main" and (co[0].get("with") or {}).get("persist-credentials") is False,
 "nopr": not any("refs/pull" in str(s.get("run", "")) or "head.sha" in str((s.get("with") or {}).get("ref", "")) or "head.ref" in str((s.get("with") or {}).get("ref", "")) for s in steps),
 "token": (w.get("permissions") == {}) and perms.get("statuses") == "write" and not [k for k, v in perms.items() if v == "write" and k != "statuses"],
 "runs": any("product/tools/lead-read-gate.sh event" in str(s.get("run", "")) or "product/tools/lead-read-gate.sh sweep" in str(s.get("run", "")) for s in steps),
 "keep": (j.get("concurrency") or {}).get("cancel-in-progress") is False,
 "switch": any("vars.LEAD_READ_GATE" in str((s.get("env") or {}).get("LEAD_READ_GATE", "")) for s in steps),
}
print(1 if q[sys.argv[2]] else 0)
PY
}
ok "lead-read.yml runs on pull_request_target (main's copy of the workflow), every push to a PR, never on pull_request" "$(wf target)"
ok "... and on a PR comment created, edited or deleted (the read line may be any of them)" "$(wf comment)"
ok "... checks out main only, keeps no credentials" "$(wf main)"
ok "... never fetches or checks out the PR's commits" "$(wf nopr)"
ok "... holds one write scope, statuses" "$(wf token)"
ok "... runs lead-read-gate.sh" "$(wf runs)"
ok "... never cancels a run in progress (the newest verdict must land)" "$(wf keep)"
ok "... passes the kill switch vars.LEAD_READ_GATE" "$(wf switch)"
finish
