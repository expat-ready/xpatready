#!/usr/bin/env bash
# A351 B1 (founder 24 Nov): same-cause.py, one ACT at the second failed batch with the same suite and FAIL line. Pass and fail
# case for each rule, on the real failed batches of 24 Nov and a stand-in GitHub. US$0, no network.
#   bash product/tools/check-same-cause.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/sc.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
N="$TOOLS/fixtures/same-cause/night-24-nov.json"; k=0
new() { k=$((k + 1)); mkdir "$T/s$k"; printf '{"runs":{},"logs":{},"fired":{},"ran":{}}' > "$T/s$k/same-cause.json"; }
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
for at in 20:35:1:0 20:37:2:1 20:47:3:0 21:06:4:0 21:07:5:0; do IFS=: read -r hh mm n want <<<"$at"; run "$T/five.json" "2026-11-23T$hh:$mm:00Z"; ok "five csdl3 runs: $want ACT after run $n" "$([ "$(acts)" = "$want" ] && echo 1)" "$o"; [ "$n" = 2 ] && ok "naming the suite, its FAIL line and the newest green batch" "$([ "$(has '1 failure alike in batch #3316 (run 45255249651, 24 Nov 02:04 IST) and #3317')" = 1 ] && [ "$(has 'check_csdl3_milestones.ts · exit 1: FAIL  CS-DL3 kind pass')" = 1 ] && has 'newest batch whose suites all passed: run 45249511505, 24 Nov 01:41 IST')" "$o"; done
# two different causes: real batches with one red each, never the same
pick "$T/two.json" 45278504196 45309178814 45317306928; new; run "$T/two.json" 2026-11-24T04:00:00Z
ok "pass: three real batches red for three different causes: no ACT" "$([ "$(acts)" = 0 ] && has 'same cause 3 failed batches in 12 h, 0 failures seen in two')" "$o"
mk() { python3 -I -c '
import json,sys
print(json.dumps({"runs":[{"run":i+1,"batch":100+i,"start":e,"end":e,"prs":json.loads(p),"rows":["| %s | FAIL | 1 s | %s |" % x for x in json.loads(f).items()]} for i,(e,p,f) in enumerate(zip(*[iter(sys.argv[1:])]*3))]}))' "$@" > "$T/m.json"; }
E1=2026-11-24T01:00:00Z E2=2026-11-24T02:00:00Z
mk $E1 '[1,2]' '{"check_a.ts":"exit 1: FAIL  x"}' $E2 '[3]' '{"check_a.ts":"exit 1: FAIL  y"}'; new; run "$T/m.json" 2026-11-24T03:00:00Z; ok "pass: the same suite with another FAIL line is another cause" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
mk $E1 '[1,2]' '{"check_a.ts":"exit 1: FAIL  x"}' $E2 '[3]' '{"check_b.ts":"exit 1: FAIL  x"}'; new; run "$T/m.json" 2026-11-24T03:00:00Z; ok "pass: another suite with the same words is another cause" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
mk $E1 '[1]' '{"check_a.ts":"exit 1: FAIL  x"}' $E2 '[3]' '{"check_a.ts":"exit 1: FAIL  x"}'; new; run "$T/m.json" 2026-11-24T03:00:00Z; ok "fail: no pull request in both is said" "$(has 'pull requests in both: none;')" "$o"
mk 2026-11-23T13:00:00Z '[1]' '{"check_a.ts":"exit 1: FAIL  x"}' $E2 '[3]' '{"check_a.ts":"exit 1: FAIL  x"}'; new; run "$T/m.json" 2026-11-24T03:00:00Z; ok "pass: 13 h apart is not the same night" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
mk $E1 '[1]' '{"check_a.ts":"exit 1: FAIL  x"}' $E2 '[3]' '{"check_a.ts":"exit 1: FAIL  x"}'; new; run "$T/m.json" 2026-11-24T03:00:00Z; run "$T/m.json" 2026-11-24T23:00:00Z; mk 2026-11-25T01:00:00Z '[1]' '{"check_a.ts":"exit 1: FAIL  x"}' 2026-11-25T02:00:00Z '[3]' '{"check_a.ts":"exit 1: FAIL  x"}'; run "$T/m.json" 2026-11-25T03:00:00Z; ok "fail: after 12 h without it, the cause is told again" "$([ "$(acts)" = 1 ] && echo 1)" "$o"
for m in '' '{' '[]' '{"runs":{},"logs":[],"fired":{},"ran":{}}'; do new; printf '%s' "$m" > "$T/s$k/same-cause.json"; run "$T/five.json" 2026-11-23T20:40:00Z; ok "fail: a memory of '$m' is an ACT, and the 12 h are judged again" "$([ "$(acts)" = 2 ] && has 'ACT   same cause: memory ')" "$o"; done
k=$((k + 1)); run "$T/five.json" 2026-11-23T20:40:00Z; ok "fail: a missing memory is an ACT" "$(has 'ACT   same cause: memory missing')" "$o"
new; run "$T/none.json" $E1; ok "fail: an unreadable input is an ACT" "$(has 'ACT   same cause: not measured')" "$o"

mk $E1 '[1]' '{"check_a.ts":"exit 1:   name: '"'TimeoutError'"'","check_b.ts":"exit 1: ","check_c.ts":"exit 1: [TypeError: fetch failed] {"}' $E2 '[3]' '{"check_a.ts":"exit 1:   name: '"'TimeoutError'"'","check_b.ts":"exit 1: "}'; new; run "$T/m.json" 2026-11-24T03:00:00Z
ok "pass: rows that name no cause are counted, never compared" "$([ "$(acts)" = 0 ] && has '5 red rows name no cause')" "$o"
mk $E1 '[1]' '{"check_a.ts":"exit 1: locator.click: Error: strict mode violation: nav resolved to 2"}' $E2 '[3]' '{"check_a.ts":"exit 1: locator.click: Error: strict mode violation: nav resolved to 2"}'; new; run "$T/m.json" 2026-11-24T03:00:00Z; ok "fail: an error with words is a cause" "$([ "$(acts)" = 1 ] && echo 1)" "$o"
many() { python3 -I -c 'import json; print(json.dumps({"check_%02d.ts" % i: "exit 1: FAIL  x" for i in range(9)}))'; }
mk $E1 '[1]' "$(many)" $E2 '[3]' "$(many)"; new; run "$T/m.json" 2026-11-24T03:00:00Z; ok "fail: the one ACT names every suite" "$([ "$(acts)" = 1 ] && has '| and in check_03.ts check_04.ts check_05.ts check_06.ts check_07.ts check_08.ts')" "$o"
run "$T/m.json" 2026-11-24T03:10:00Z; ok "the info lines say how many more" "$([ "$(grep -c '      again  2 runs' <<<"$o")" = 5 ] && has 'again  4 more causes')" "$o"
for m in '{"runs":{"1":5},"logs":{},"fired":{},"ran":{}}' '{"runs":{"1":{"done":true,"end":"2026-11-23T20:30:00Z","prs":[]}},"logs":{},"fired":{},"ran":{}}'; do new; printf '%s' "$m" > "$T/s$k/same-cause.json"; run "$T/five.json" 2026-11-23T20:40:00Z; ok "fail: a memory that is wrong inside is an ACT and is read again" "$([ "$(acts)" = 2 ] && has 'memory not as written')" "$o"; run "$T/five.json" 2026-11-23T20:40:00Z; ok "and it is whole at the next check" "$([ "$(acts)" = 0 ] && echo 1)" "$o"; done

# The live reader: a curl that answers as GitHub does, from a list of runs, parts and raw log rows ($T/g.json)
mkdir "$T/bin"; cat > "$T/bin/curl" <<'G'
#!/usr/bin/env python3
import json, os, sys
from urllib.parse import urlsplit, parse_qs
d = os.environ["FX"]; a = sys.argv[1:]; u = urlsplit(a[-1]); q = {k: v[0] for k, v in parse_qs(u.query).items()}; path = u.path.split("/xpatready/")[1]
open(d + "/calls", "a").write(path + "?" + u.query + "\n"); g = json.load(open(d + "/g.json"))
assert "--fail" in a and "@-" in a and "Bearer x" in sys.stdin.read() and not any("Bearer" in x for x in a), a
down = g.get("down", [])
if any(x in path for x in down): sys.stderr.write("curl: (22) The requested URL returned error: 404\n"); sys.exit(22)
n = int(q.get("page", 1)); per = int(q.get("per_page", 30)); cut = lambda l: l[(n - 1) * per:n * per]
if path.endswith("workflows/ci.yml/runs"):
    r = {"workflow_runs": cut([{"id": x["id"], "head_branch": x["b"], "run_started_at": x["e"], "updated_at": x["e"]} for x in g["runs"] if x["s"] == q["status"] and x["e"] >= q["created"][2:]])}
    assert q["created"].startswith(">=2026"), q
elif path == "pulls": r = [p for p in g["prs"] if q["head"] == "expat-ready:" + p["branch"]][:1]
elif path.endswith("/jobs"): r = {"jobs": cut([x for y in g["runs"] if str(y["id"]) == path.split("/")[2] for x in y["jobs"]])}
elif path.endswith("/logs"): sys.stdout.buffer.write(g["logs"].get(path.split("/")[2], "").encode("utf-8", "surrogateescape")); sys.exit()
print(json.dumps(r))
G
chmod +x "$T/bin/curl"; live() { o=$(FX="$T" PATH="$T/bin:$PATH" GITHUB_TOKEN=x GITHUB_REPOSITORY=o/r python3 -I ${LV:-"$TOOLS/same-cause.py"} --state "$T/s$k" --now "${1:-2026-11-24T03:00:00Z}" 2>&1); }
cat > "$T/w.py" <<'P'
import json, os, sys
T = sys.argv[1]
def part(i, c="failure", n="shard (%d)" % 1): return {"id": i, "name": n, "conclusion": c}
TS = "2026-11-24T01:00:00.1234567Z "
A = TS + "| check_a.ts | PASS | 5 s | 1 passed |\n"
def twice(s, first, second): return TS + "| %s | failed twice | 5 s | %s · 1st try %s |\n" % (s, second, first)
def once(s, w): return TS + "| %s | FAIL | 5 s | %s · not retried: it runs on the shared demo database |\n" % (s, w)
def run(i, e, b, jobs, s="failure"): return {"id": i, "e": e, "b": "mergify/" + b, "s": s, "jobs": jobs}
E = ["2026-11-24T0%d:00:00Z" % i for i in range(0, 4)]
PR = [{"branch": "mergify/a", "number": 297, "title": "merge queue: checking #11 + #12 together on main (abc)", "body": ""}, {"branch": "mergify/b", "number": 298, "title": "merge queue: checking #12 on main (abc), stacked on #13", "body": "### Queued ahead of this batch\n- [#11](x)\n<details>"}, {"branch": "mergify/c", "number": 299, "title": "merge queue: checking #14 on main (abc)", "body": ""}]
G = run(7, "2026-11-24T00:30:00Z", "g", [part(70, "success", "shard (3)")], "success"); R = run(8, "2026-11-24T02:50:00Z", "records", [part(80, "skipped", "shard (1)"), part(81, "success", "ci")], "success")
X = {"id": 9, "e": E[2], "b": "claude/x", "s": "failure", "jobs": [part(90)]}
one = lambda l1, l2, **k: {"runs": [run(1, E[1], "a", [part(11), part(19, "failure", "ci"), part(18, "success")]), run(2, E[2], "b", [part(21)]), X, G, R], "prs": PR, "logs": {"11": A + l1, "21": A + l2}, **k}
W = "exit 1: FAIL  case 2e52b542-37e7-4376-b6fd-9926745%s on 2026-11-2%d"
S = {
 "plain": one(twice("check_s.ts", W % ("6f30b", 3), "exit 2: STOP x") + TS + "| check_r.ts | passed on retry | 5 s | ok · 1st try exit 1: FAIL  z |\n", twice("check_s.ts", W % ("b149b", 4), "exit 1: FAIL  other")),
 "cutid": one(once("check_s.ts", "exit 1: FAIL  case 2e52b542-37e7-43"), once("check_s.ts", "exit 1: FAIL  case b149bc72-e081-41")),
 "mixed": one(twice("check_s.ts", "exit 1: FAIL  x", "exit 2: STOP the copy did not start"), TS + "| check_s.ts | FAIL | 5 s | exit 1: FAIL  x · not retried: 2 retries already in this run |\n"),
 "stop": one(twice("check_s.ts", "exit 1: FAIL  one", "exit 2: FAIL  STOP the copy did not start"), twice("check_s.ts", "exit 1: FAIL  two", "exit 2: FAIL  STOP the copy did not start")),
 "bytes": one(once("check_s.ts", "exit 1: FAIL  x") + "\udcff\udcfe\n", once("check_s.ts", "exit 1: FAIL  x")),
 "blank": one("no table here\n", "cut\n"),
 "norec": one(once("check_s.ts", "exit 1: FAIL  x"), once("check_s.ts", "exit 1: FAIL  x")),
 "lost": one(once("check_s.ts", "exit 1: FAIL  x"), once("check_s.ts", "exit 1: FAIL  x"), down=["jobs/11/logs"]),
 "nopr": one(once("check_s.ts", "exit 1: FAIL  x"), once("check_s.ts", "exit 1: FAIL  x")),
 "big": {"runs": [run(1, E[1], "a", [part(100 + i) for i in range(12)]), run(2, E[2], "b", [part(200 + i) for i in range(12)]), run(3, E[3], "c", [part(300)]), G], "prs": PR, "logs": {str(h * 100 + i): once("check_%02d.ts" % i, "exit 1: FAIL  x") for h in (1, 2, 3) for i in range(12)}},
}
S["lost"]["runs"].append(run(3, "2026-11-24T02:30:00Z", "c", [part(31)])); S["lost"]["logs"]["31"] = once("check_s.ts", "exit 1: FAIL  x")
S["nopr"]["prs"] = PR[:1]
S["green2"] = json.loads(json.dumps(S["norec"])); S["green2"]["runs"][1]["s"] = "success"
S["rerun"] = json.loads(json.dumps(S["norec"])); S["rerun"]["runs"][1].update(e="2026-11-24T02:40:00Z", jobs=[part(22)]); S["rerun"]["logs"]["22"] = once("check_s.ts", "exit 1: FAIL  x")
S["pages"] = json.loads(json.dumps(S["norec"])); S["pages"]["runs"] = [{"id": 1000 + i, "e": E[2], "b": "claude/y", "s": "failure", "jobs": []} for i in range(100)] + [{"id": 2000 + i, "e": E[2], "b": "claude/z", "s": "success", "jobs": []} for i in range(100)] + S["pages"]["runs"]
json.dump(S[sys.argv[2]], open(T + "/g.json", "w"))
P
g_() { python3 -I "$T/w.py" "$T" "$1" || echo "bad stand-in $1"; : > "$T/calls"; }
new; g_ plain; live
ok "live: the first try's line, ids and dates alike, members and those ahead, and the newest batch whose suites ran (not the records one)" "$([ "$(acts)" = 1 ] && has "1 failure alike in batch #297 (run 1, 24 Nov 06:30 IST) and #298 (run 2, 24 Nov 07:30 IST); pull requests in both: #11 #12; newest batch whose suites all passed: run 7, 24 Nov 06:00 IST: check_s.ts · exit 1: FAIL  case # on #")" "$o"
ok "a suite that passed on retry, a green part, the ci job and a branch that is no batch are not read" "$([ "$(not check_r.ts)" = 1 ] && ! grep -qE 'jobs/(18|19|90)/logs|runs/9/' "$T/calls" && echo 1)" "$(cat "$T/calls")"
: > "$T/calls"; live; ok "a log and a list of parts are read once" "$([ "$(acts)" = 0 ] && ! grep -qE "logs|runs/[0-9]+/jobs" "$T/calls" && echo 1)" "$(cat "$T/calls")"
new; g_ cutid; live; ok "fail: an id cut short at the row's edge is alike too" "$([ "$(acts)" = 1 ] && has 'FAIL  case #')" "$o"
new; g_ mixed; live; ok "fail: a first try and a suite not retried, the same line" "$([ "$(acts)" = 1 ] && has 'check_s.ts · exit 1: FAIL  x')" "$o"
new; g_ stop; live; ok "pass: two causes whose retries stopped alike" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
new; g_ bytes; live; ok "a log with odd bytes is read" "$([ "$(acts)" = 1 ] && echo 1)" "$o"
new; g_ blank; live; ok "fail: red parts with no suite row are an ACT, never green" "$(has 'ACT   same cause: 2 red parts hold no suite row (set-up, a cut log')" "$o"
new; g_ pages; live; ok "fail: batches on the second page of runs, and the green one too" "$([ "$(acts)" = 1 ] && has 'run 7, 24 Nov 06:00 IST')" "$o"
new; g_ lost; live; ok "fail: one log that cannot be read is an ACT, and the other two runs are still compared" "$([ "$(acts)" = 3 ] && [ "$(has 'ACT   same cause: not read: part 11 of run 1')" = 1 ] && has 'alike in batch #298 (run 2')" "$o"
new; g_ nopr; live; ok "fail: a batch whose pull request is not found is an ACT, not read as none" "$([ "$(has 'ACT   same cause: not read: run 2: no pull request found')" = 1 ] && not 'pull requests in both')" "$o"
new; g_ norec; python3 -I -c 'import json,sys; f=sys.argv[1]; d=json.load(open(f)); d["down"]=["workflows"]; json.dump(d,open(f,"w"))' "$T/g.json"; live; ok "fail: runs that cannot be read are an ACT" "$(has 'ACT   same cause: not read')" "$o"
new; g_ green2; live; ok "pass: one failed batch only" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
new; g_ norec; live; g_ green2; live; ok "a batch run again and green leaves the list" "$(has 'same cause 1 failed batches')" "$o"
new; g_ norec; live; g_ rerun; live; ok "a batch run again and red is read again" "$(grep -q 'jobs/22/logs' "$T/calls" && has 'same cause 2 failed batches')" "$o"
new; g_ big; live; ok "whole: 25 red parts, 16 read: an ACT, and nothing is judged from the half-read run" "$([ "$(acts)" = 1 ] && [ "$(has 'same cause 1 failed batches in 12 h, 0 failures')" = 1 ] && has 'ACT   same cause: 8 red parts and 1 whole failed batches not read yet')" "$o"
live; ok "and the next check reads the rest" "$([ "$(acts)" = 1 ] && has 'same cause 3 failed batches in 12 h, 12 failures')" "$o"
sed 's/, SECONDS = 12, 16, 20/, SECONDS = 12, 16, -1/' "$TOOLS/same-cause.py" > "$T/slow.py"; cp "$TOOLS/merge-queue-causes.py" "$T/"; new; g_ norec; LV="$T/slow.py" live; ok "out of time: no log is read, said as an ACT" "$([ "$(has '0 red parts and 2 whole failed batches not read yet')" = 1 ] && ! grep -q logs "$T/calls" && echo 1)" "$o"

# lead-watch.sh's own step 2j, cut out and run as written
sed -n '/^# 2j\. Same cause/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir "$T/l"
step() { printf 'print("""%s""")\n' "$1" > "$T/l/same-cause.py"; o=$( ( TOOLS="$T/l"; STATE_DIR="$T/s1"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { echo "seen: $1"; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
step 'same cause 0'; ok "lead-watch.sh prints its line and hands it to step 12, no ACT counted" "$([ "$(has 'seen: same cause 0')" = 1 ] && has 'acts=0')" "$o"
step 'ACT   same cause: x'; ok "lead-watch.sh counts its ACT line" "$(has 'acts=1')" "$o"
step Traceback; ok "fail: a same-cause.py that dies is an ACT" "$(has 'ACT   same cause: same-cause.py did not run')" "$o"
finish
