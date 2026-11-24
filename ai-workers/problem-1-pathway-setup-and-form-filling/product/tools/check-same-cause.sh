#!/usr/bin/env bash
# A351 B1 (founder 24 Nov): same-cause.py, one ACT at the second failed batch with the same suite and FAIL line. Pass and fail
# case for each rule, on the real failed batches of 24 Nov and a stand-in GitHub. US$0, no network.
#   bash product/tools/check-same-cause.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/sc.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
N="$TOOLS/fixtures/same-cause/night-24-nov.json"; k=0
new() { k=$((k + 1)); mkdir "$T/s$k"; printf '{"runs":{},"logs":{},"fired":{}}' > "$T/s$k/same-cause.json"; }
run() { o=$(python3 -I "$TOOLS/same-cause.py" --state "$T/s$k" --fixture "$1" --now "$2" 2>&1); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }; not() { ! grep -qF -- "$1" <<<"$o" && echo 1; }; acts() { grep -c '^ACT' <<<"$o"; }
pick() { python3 -I -c '
import json,sys
d=json.load(open(sys.argv[1])); runs=set(map(int,sys.argv[3:]))
d["runs"]=[r for r in d["runs"] if r["run"] in runs]; d["green"]={"run":45249511505,"end":"2026-11-23T20:11:14Z"}
json.dump(d,open(sys.argv[2],"w"))' "$N" "$@"; }
# the real night: seven batches red on csdl3; two of them were also red on 33 other things
new; run "$N" 2026-11-23T20:14:00Z; ok "pass: after run 1, nothing is told" "$([ "$(acts)" = 0 ] && has 'same cause 1 failed batches in 12 h, 0 failures seen in two')" "$o"
run "$N" 2026-11-23T20:33:00Z
ok "fail: at run 2, one ACT naming both batches, both runs and the pull requests in both" "$([ "$(acts)" = 1 ] && has 'alike in batch #3311 (run 45249581438, 24 Nov 01:43 IST) and #3315 (run 45254544646, 24 Nov 02:02 IST); pull requests in both: #3173 #3193 #3216 #3289')" "$o"
for at in 20:35 20:37 20:47 21:06 21:07; do run "$N" "2026-11-23T$at:00Z"; ok "once: no second ACT at $at UTC, runs 3 to 7" "$([ "$(acts)" = 0 ] && has 'already told')" "$o"; done
ok "its count and the one pull request in all seven are shown" "$(has 'again  7 runs, in every one: #3289: check_csdl3_milestones.ts · exit 1: FAIL  CS-DL3 kind pass: CASE_MILESTONE_DEADLINE is added after the earlier kinds')" "$o"
# the five that were red on csdl3 alone
pick "$T/five.json" 45255249651 45255283757 45256816567 45260882131 45259041082; new
for at in 20:35:1:0 20:37:2:1 20:47:3:0 21:06:4:0 21:07:5:0; do IFS=: read -r hh mm n want <<<"$at"; run "$T/five.json" "2026-11-23T$hh:$mm:00Z"; ok "five csdl3 runs: $want ACT after run $n" "$([ "$(acts)" = "$want" ] && echo 1)" "$o"; [ "$n" = 2 ] && ok "naming the suite, its FAIL line and the newest green batch" "$([ "$(has '1 failure alike in batch #3316 (run 45255249651, 24 Nov 02:04 IST) and #3317')" = 1 ] && [ "$(has 'check_csdl3_milestones.ts · exit 1: FAIL  CS-DL3 kind pass')" = 1 ] && has 'newest batch green whole: run 45249511505, 24 Nov 01:41 IST')" "$o"; done
# two different causes: real batches with one red each, never the same
pick "$T/two.json" 45278504196 45309178814 45317306928; new; run "$T/two.json" 2026-11-24T04:00:00Z
ok "pass: three real batches red for three different causes: no ACT" "$([ "$(acts)" = 0 ] && has 'same cause 3 failed batches in 12 h, 0 failures seen in two')" "$o"
mk() { python3 -I -c '
import json,sys
print(json.dumps({"runs":[{"run":i+1,"batch":100+i,"start":e,"end":e,"prs":json.loads(p),"fails":json.loads(f)} for i,(e,p,f) in enumerate(zip(*[iter(sys.argv[1:])]*3))]}))' "$@" > "$T/m.json"; }
E1=2026-11-24T01:00:00Z E2=2026-11-24T02:00:00Z
mk $E1 '[1,2]' '{"check_a.ts":"exit 1: FAIL  x"}' $E2 '[3]' '{"check_a.ts":"exit 1: FAIL  y"}'; new; run "$T/m.json" 2026-11-24T03:00:00Z; ok "pass: the same suite with another FAIL line is another cause" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
mk $E1 '[1,2]' '{"check_a.ts":"exit 1: FAIL  x"}' $E2 '[3]' '{"check_b.ts":"exit 1: FAIL  x"}'; new; run "$T/m.json" 2026-11-24T03:00:00Z; ok "pass: another suite with the same words is another cause" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
mk $E1 '[1]' '{"check_a.ts":"x"}' $E2 '[3]' '{"check_a.ts":"x"}'; new; run "$T/m.json" 2026-11-24T03:00:00Z; ok "fail: no pull request in both is said" "$(has 'pull requests in both: none;')" "$o"
mk 2026-11-23T13:00:00Z '[1]' '{"check_a.ts":"x"}' $E2 '[3]' '{"check_a.ts":"x"}'; new; run "$T/m.json" 2026-11-24T03:00:00Z; ok "pass: 13 h apart is not the same night" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
mk $E1 '[1]' '{"check_a.ts":"x"}' $E2 '[3]' '{"check_a.ts":"x"}'; new; run "$T/m.json" 2026-11-24T03:00:00Z; run "$T/m.json" 2026-11-24T23:00:00Z; mk 2026-11-25T01:00:00Z '[1]' '{"check_a.ts":"x"}' 2026-11-25T02:00:00Z '[3]' '{"check_a.ts":"x"}'; run "$T/m.json" 2026-11-25T03:00:00Z; ok "fail: after 12 h without it, the cause is told again" "$([ "$(acts)" = 1 ] && echo 1)" "$o"
for m in '' '{' '[]' '{"runs":{},"logs":[],"fired":{}}'; do new; printf '%s' "$m" > "$T/s$k/same-cause.json"; run "$T/five.json" 2026-11-23T20:40:00Z; ok "fail: a memory of '$m' is an ACT, and the 12 h are judged again" "$([ "$(acts)" = 2 ] && has 'ACT   same cause: memory unreadable')" "$o"; done
k=$((k + 1)); run "$T/five.json" 2026-11-23T20:40:00Z; ok "fail: a missing memory is an ACT" "$(has 'ACT   same cause: memory missing')" "$o"
new; run "$T/none.json" $E1; ok "fail: an unreadable input is an ACT" "$(has 'ACT   same cause: not measured')" "$o"

# The live reader: a curl that answers as GitHub does, real log rows
mkdir "$T/bin"; cat > "$T/bin/curl" <<'G'
#!/usr/bin/env python3
import json, os, sys
u = sys.argv[-1]; d = os.environ["FX"]; open(d + "/calls", "a").write(u.split("/xpatready/")[1] + "\n")
W = lambda i, e, b: {"id": i, "head_branch": b, "run_started_at": e, "updated_at": e}
if os.path.exists(d + "/down") and open(d + "/down").read().strip() in u: sys.stderr.write("curl: (22) error: 429\n"); sys.exit(22)
if "status=failure" in u: r = {"workflow_runs": [W(1, "2026-11-24T01:00:00Z", "mergify/a"), W(2, "2026-11-24T02:00:00Z", "mergify/b"), W(9, "2026-11-24T02:00:00Z", "claude/x")] if "page=1" in u.split("&")[-1] else []}
elif "status=success" in u: r = {"workflow_runs": [W(7, "2026-11-24T00:30:00Z", "mergify/g"), W(8, "2026-11-24T02:50:00Z", "claude/x")]}
elif "/pulls?" in u: b = u[-1]; r = [{"number": 200 + ord(b), "title": "merge queue: checking #11 + #12 together on main (abc)" if b == "a" else "merge queue: checking #12 on main (abc), stacked on #13", "body": "" if b == "a" else "### Queued ahead of this batch\n- [#11](x)\n<details>"}]
elif u.split("?")[0].endswith("/jobs"): i = int(u.split("/runs/")[1].split("/")[0]); r = {"jobs": [{"id": i * 100 + j, "name": "shard (%d)" % j, "conclusion": "failure"} for j in range(1, int(os.environ.get("PARTS", "1")) + 1)] + [{"id": 99, "name": "ci", "conclusion": "failure"}, {"id": 98, "name": "shard (20)", "conclusion": "success"}]}
elif u.endswith("/logs"):
    j = u.split("/jobs/")[1].split("/")[0]
    print("2026-11-24T01:00:00.1Z | check_a.ts | PASS | 5 s | 1 passed |")
    print("2026-11-24T01:00:00.1Z | check_r.ts | passed on retry | 5 s | ok · 1st try exit 1: FAIL  z |")
    print("2026-11-24T01:00:00.1Z | check_s%s.ts | failed twice | 5 s | exit 1: FAIL  case 2e52b542-37e7-4376-b6fd-99267456f3%s on 2026-11-2%s | x · 1st try exit 1: FAIL  q |" % (j[1:], j[:2], j[0])); sys.exit()
print(json.dumps(r))
G
chmod +x "$T/bin/curl"; live() { o=$(FX="$T" PATH="$T/bin:$PATH" GITHUB_TOKEN=x GITHUB_REPOSITORY=o/r python3 -I "$TOOLS/same-cause.py" --state "$T/s$k" --now "${1:-2026-11-24T03:00:00Z}" 2>&1); }
new; live
ok "live: two batches, the same suite and line but for ids and dates: one ACT, members and those ahead, the green batch" "$([ "$(acts)" = 1 ] && has "1 failure alike in batch #297 (run 1, 24 Nov 06:30 IST) and #298 (run 2, 24 Nov 07:30 IST); pull requests in both: #11 #12; newest batch green whole: run 7, 24 Nov 06:00 IST: check_s01.ts · exit 1: FAIL  case # on #")" "$o"
ok "a suite that passed on retry, a green part, the ci job and a branch that is no batch are not read" "$([ "$(not check_r.ts)" = 1 ] && ! grep -qE 'jobs/9[89]/logs|runs/9/' "$T/calls" && echo 1)" "$(cat "$T/calls")"
: > "$T/calls"; live; ok "a log and a list of parts are read once" "$([ "$(acts)" = 0 ] && ! grep -qE "logs|/jobs" "$T/calls" && echo 1)" "$(cat "$T/calls")"
new; PARTS=12 live; ok "whole: 24 red parts, 16 read: said, and nothing is judged from the half-read run" "$([ "$(acts)" = 1 ] && [ "$(has 'same cause 1 failed batches in 12 h, 0 failures seen in two or more')" = 1 ] && has 'ACT   same cause: 8 red parts and 0 whole failed batches not read yet')" "$o"
PARTS=12 live; ok "and the next check reads the rest" "$([ "$(acts)" = 1 ] && has '12 failures alike')" "$o"
new; live; echo 'jobs/101/logs' > "$T/down"; new; live; ok "fail: a log that cannot be read is an ACT, never green" "$(has 'ACT   same cause: not read')" "$o"; echo status=failure > "$T/down"; new; live; ok "fail: runs that cannot be read are an ACT" "$(has 'ACT   same cause: not read')" "$o"; : > "$T/down"; echo nothing-here > "$T/down"
ok "the token is never on a command line" "$(! grep -n '"Authorization: Bearer {' "$TOOLS/same-cause.py" | grep -q '"-H"' && grep -q '"-H", "@-"' "$TOOLS/same-cause.py" && echo 1)"

# lead-watch.sh's own step 2j, cut out and run as written
sed -n '/^# 2j\. Same cause/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir "$T/l"
step() { printf 'print("""%s""")\n' "$1" > "$T/l/same-cause.py"; o=$( ( TOOLS="$T/l"; STATE_DIR="$T/s1"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { echo "seen: $1"; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
step 'same cause 0'; ok "lead-watch.sh prints its line and hands it to step 12, no ACT counted" "$([ "$(has 'seen: same cause 0')" = 1 ] && has 'acts=0')" "$o"
step 'ACT   same cause: x'; ok "lead-watch.sh counts its ACT line" "$(has 'acts=1')" "$o"
step Traceback; ok "fail: a same-cause.py that dies is an ACT" "$(has 'ACT   same cause: same-cause.py did not run')" "$o"
finish
