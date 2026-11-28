#!/usr/bin/env bash
# Test of factory-watch.py and pause-label.sh (lab bundle A11, founder A451): planted open PRs, comments, pushes, merges
# and a lab register give each check its pass and fail cases, and lead-watch.sh's own step 10e prints the three ACT lines.
# No network (planted files; a stand-in gh for pause-label.sh --apply), US$0.   bash product/tools/check-factory-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v python3 >/dev/null || { echo "python3 is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/fwatch.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
NOW=1800000000; H="ab12$(printf '%036d' 3)"
python3 -I - "$T" "$NOW" "$H" <<'PY'
import json, sys
from datetime import datetime, timezone
T, now, H = sys.argv[1], int(sys.argv[2]), sys.argv[3]
iso = lambda m: datetime.fromtimestamp(now - m * 60, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
def pr(n, title, draft=False, labels=(), br=None, sha=None, body="", who="lane"):
    return {"number": n, "title": title, "draft": draft, "labels": [{"name": l} for l in labels], "body": body,
            "head": {"ref": br or f"claude/b{n}", "sha": sha or f"sha{n}"}, "user": {"login": who}, "updated_at": iso(500)}
pulls = [pr(1, "lab: LR-010 idle lane", True, body="https://claude.ai/code/session_01Idle"),
         pr(2, "tooling: commented 10 min ago"), pr(3, "pipeline: ready on head", sha=H), pr(4, "LR-020 ready on an old head"),
         pr(5, "tooling: labelled", labels=["review: approved"]), pr(6, "runtime: R1.5 product item"),
         pr(7, "lab: only the Lead woke it"), pr(8, "deps: bump x", br="dependabot/npm/x", who="dependabot[bot]"),
         pr(9, "tooling: the Lead's records", br="lead/2026-11-28"), pr(10, "lab: pushed 30 min ago"),
         pr(11, "screens: paused product item", labels=["paused"]), pr(12, "lab: LR-030 dead lane")]
c = lambda n, m, body, who="lane": {"issue_url": f"https://api.github.com/repos/o/r/issues/{n}", "created_at": iso(m), "body": body, "user": {"login": who}}
comments = [c(2, 10, "Round 2 reviewer asked for a test; pushing"), c(3, 70, f"Ready for Lead read {H}"),
            c(4, 100, "Ready for Lead read " + "0" * 40), c(7, 5, "**Wake on merge (OS-49, lead-watch):** #9 merged"),
            c(1, 5, "LGTM", who="someone-else"), c(12, 5, "**Lane stopped (StopFailure):** `rate_limit`")]
pushes = "".join(f"{now - m * 60}\tclaude/b{n}\n" for n, m in [(1, 90), (2, 90), (3, 90), (4, 120), (5, 300), (6, 900), (7, 75), (10, 30), (12, 61)])
merged = [{"number": 20, "title": "lab: x", "body": "Built LR-010.", "pull_request": {"merged_at": iso(120)}},
          {"number": 21, "title": "LR-011 done", "body": "", "pull_request": {"merged_at": iso(60)}},
          {"number": 22, "title": "LR-012 old", "body": "", "pull_request": {"merged_at": iso(3 * 24 * 60)}},
          {"number": 23, "title": "lab: LR-13 unpadded, LR-999 not a row", "body": "", "pull_request": {"merged_at": iso(30)}}]
reg = """# Lab register\n\n| ID | Item | Status | Gate notes |\n|---|---|---|---|
| LR-010 | a | Intended | x |\n| LR-011 | b | Built: #21 merged | x |\n| LR-012 | c | Intended | x |\n| LR-013 | d | Intended (#23 ready) | x |\n"""
for name, v in [("pulls.json", pulls), ("comments.json", comments), ("merged.json", merged)]:
    json.dump(v, open(f"{T}/{name}", "w"))
open(f"{T}/pushes.tsv", "w").write(pushes); open(f"{T}/reg.md", "w").write(reg)
PY
A="--pulls $T/pulls.json --comments $T/comments.json --pushes $T/pushes.tsv --merged $T/merged.json --register $T/reg.md --now $NOW"
FW="$TOOLS/factory-watch.py"
o=$(python3 -I "$FW" idle $A); acts=$(grep '^ACT' <<<"$o")
ok "idle: a lab draft with no push or lane comment for 90 min is one ACT, its session named" "$(grep -qx 'ACT   #1 lane idle 90 min: wake it (type its next step in claude.ai) \[session_01Idle\]' <<<"$o" && echo 1)" "$o"
ok "idle: a lane comment 10 min ago, a push 30 min ago: not idle" "$(! grep -qE '#(2|10) ' <<<"$acts" && echo 1)" "$acts"
ok "idle: \"Ready for Lead read\" on the current head 70 min ago: not idle" "$(! grep -q '#3 ' <<<"$acts" && echo 1)" "$acts"
ok "idle: \"Ready for Lead read\" on an old head: still idle (100 min since that comment)" "$(grep -q '^ACT   #4 lane idle 100 min' <<<"$acts" && echo 1)" "$acts"
ok "idle: the Lead's wake comment is not the lane's (75 min idle)" "$(grep -q '^ACT   #7 lane idle 75 min' <<<"$acts" && echo 1)" "$acts"
ok "idle: a lane-death comment is not lane work (61 min idle)" "$(grep -q '^ACT   #12 lane idle 61 min' <<<"$acts" && echo 1)" "$acts"
ok "idle: labelled, product, Dependabot and lead/ PRs are not lab lanes" "$(! grep -qE '#(5|6|8|9|11) ' <<<"$acts" && [ "$(grep -c . <<<"$acts")" = 4 ] && echo 1)" "$acts"
ok "idle: oldest first and a count line" "$(head -1 <<<"$acts" | grep -q '#4 ' && grep -qx 'idle lab PRs: 4 over 60 min' <<<"$o" && echo 1)" "$o"
o=$(python3 -I "$FW" register $A); acts=$(grep '^ACT' <<<"$o")
ok "register: LR-010 merged in #20 and still Intended is an ACT" "$(grep -qx 'ACT   register: LR-010 merged in #20, still Intended' <<<"$o" && echo 1)" "$o"
ok "register: LR-13 written unpadded matches row LR-013 (Intended with a note)" "$(grep -qx 'ACT   register: LR-013 merged in #23, still Intended' <<<"$o" && echo 1)" "$o"
ok "register: a Built row, a merge over 48 h old and an unknown row are not ACTs" "$(! grep -qE 'LR-011|LR-012|LR-999' <<<"$o" && [ "$(grep -c . <<<"$acts")" = 2 ] && echo 1)" "$o"
o=$(OPEN_PR_CAP=5 python3 -I "$FW" cap $A)
ok "cap: 9 ready PRs (drafts, Dependabot and paused out) over a cap of 5 is one ACT with the count" "$(grep -q '^ACT   open PRs: 9 ready (not draft, not Dependabot, not paused), over the cap of 5' <<<"$o" && echo 1)" "$o"
o=$(python3 -I "$FW" cap $A); ok "cap: 9 under the cap of 25: no ACT" "$(! grep -q '^ACT' <<<"$o" && grep -qx 'open PRs: 9 ready of cap 25' <<<"$o" && echo 1)" "$o"
o=$(python3 -I "$FW" cap --pulls "$T/none.json"); ok "an unreadable answer is an ACT, never a silent 0" "$(grep -q '^ACT   factory watch cap: open PRs unreadable' <<<"$o" && echo 1)" "$o"
o=$(python3 -I "$FW" register --merged "$T/merged.json" --register "$T/pulls.json" --now $NOW); ok "a register with no rows is an ACT" "$(grep -q '^ACT   factory watch register: lab register has no rows' <<<"$o" && echo 1)" "$o"
# The live path (round 1 of #4003): a stand-in gh answers as GitHub does. A search answer is {items}, paged by hand; a
# "Ready for Lead read" older than the 48 h comment window is found by reading that PR's own comments.
cat > "$T/fakegh.py" <<'PY'
import json, re, sys
u = next(a for a in sys.argv[1:] if "/" in a); C = "c" * 40
ready = lambda n, sha: [{"body": f"Ready for Lead read {sha}", "created_at": "2026-01-01T00:00:00Z", "user": {"login": "lane"}}]
if "pulls?state=open" in u:
    out = [{"number": n, "title": f"lab: live {n}", "draft": False, "labels": [], "body": "", "head": {"ref": f"claude/b{n}", "sha": C},
            "user": {"login": "lane"}, "updated_at": "2026-01-01T00:00:00Z"} for n in (31, 32)]
elif "issues/comments?since=" in u: out = []
elif "issues/31/comments" in u: out = ready(31, C)
elif "issues/32/comments" in u: out = ready(32, "d" * 40)
elif u.startswith("search/issues") and re.search(r"[&?]page=1(&|$)", u) and "per_page=100" in u:
    out = {"items": [{"number": 100 + i, "title": "x", "body": ""} for i in range(100)]}
elif u.startswith("search/issues") and re.search(r"[&?]page=2(&|$)", u): out = {"items": [{"number": 40, "title": "lab: LR-012", "body": ""}]}
else: sys.exit(f"unexpected {u}")
print(json.dumps(out))
PY
printf '%s\tclaude/b31\n%s\tclaude/b32\n' $((NOW - 3010 * 60)) $((NOW - 3010 * 60)) > "$T/live-pushes.tsv"
o=$(FACTORY_GH="python3 -I $T/fakegh.py" python3 -I "$FW" idle register cap --pushes "$T/live-pushes.tsv" --register "$T/reg.md" --now $NOW)
ok "live: a \"Ready for Lead read\" on the head older than 48 h (only in the PR's own comments) is not an idle lane" "$(! grep -q '#31 ' <<<"$o" && echo 1)" "$o"
ok "live: one on an old head is still an idle lane (3010 min)" "$(grep -q '^ACT   #32 lane idle 3010 min' <<<"$o" && echo 1)" "$o"
ok "live: a merge on the search's second page is read (LR-012 in #40)" "$(grep -qx 'ACT   register: LR-012 merged in #40, still Intended' <<<"$o" && echo 1)" "$o"
# lead-watch.sh's own step 10e, run on the planted data: the three lines, counted as ACTs.
step=$(sed -n '/^# 10e\. /,/^fresh "factory-watch.py/p' "$TOOLS/lead-watch.sh")
o=$(act=0; seen() { :; }; fresh() { :; }; ACT() { act=$((act+1)); echo "ACT   $1"; }; export FACTORY_ARGS="$A" OPEN_PR_CAP=5; eval "$step"; echo "act=$act")
ok "lead-watch.sh step 10e prints the idle, register and cap lines and counts them" "$(grep -q '^ACT   #1 lane idle 90 min' <<<"$o" && grep -q '^ACT   register: LR-010 merged in #20' <<<"$o" && grep -q '^ACT   open PRs: 9 ready' <<<"$o" && grep -qx 'act=7' <<<"$o" && echo 1)" "$o"
# pause-label.sh: dry run labels nothing; --apply labels each product PR once through gh.
mkdir -p "$T/bin"; printf '#!/usr/bin/env bash\necho "$*" >> "%s/gh.log"\n' "$T" > "$T/bin/gh"; chmod +x "$T/bin/gh"
o=$(PATH="$T/bin:$PATH" PAUSE_PULLS="$T/pulls.json" bash "$TOOLS/pause-label.sh"); rc=$?
ok "pause-label: dry run lists the open product PR not yet paused, labels nothing" "$([ $rc = 0 ] && grep -qx 'would label #6 runtime: R1.5 product item' <<<"$o" && [ "$(grep -c '^would label' <<<"$o")" = 1 ] && [ ! -s "$T/gh.log" ] && echo 1)" "$o $(cat "$T/gh.log" 2>/dev/null)"
o=$(PATH="$T/bin:$PATH" PAUSE_PULLS="$T/pulls.json" bash "$TOOLS/pause-label.sh" --apply); rc=$?
ok "pause-label --apply: labels #6 paused, nothing else" "$([ $rc = 0 ] && grep -q 'issues/6/labels -f labels\[\]=paused' "$T/gh.log" && [ "$(grep -c . "$T/gh.log")" = 1 ] && echo 1)" "$o $(cat "$T/gh.log" 2>/dev/null)"
finish
