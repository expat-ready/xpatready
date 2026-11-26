#!/usr/bin/env bash
# OS-84: pipeline-watch.py with stand-in detectors (PW_CMD_*) and a stand-in gh (PW_GH: comments served from files,
# posts written to a log), then the wiring of .github/workflows/pipeline-watch.yml. Cases: an act is posted once on the
# PR it names, one line per act and one comment per PR; the same act (its minutes changed) is not posted again within
# 24 h, and is after; sle-watch's other targets are not posted; an act naming no PR goes to the summary only; a broken
# detector, unreadable comments and a failed post are said (and the first and last turn the run red); without --post
# nothing is posted. US$0, no network.
#   bash product/tools/check-pipeline-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/pwatch.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
W="$TOOLS/pipeline-watch.py"; WF="$TOOLS/../../../../.github/workflows/pipeline-watch.yml"
[ -f "$W" ] || { ok "pipeline-watch.py exists (OS-84)" 0 "no $W"; finish; }
mkdir -p "$T/fx" "$T/state"
cat > "$T/gh" <<'EOF'
#!/usr/bin/env bash
# stand-in gh: api <path> → $FX/comments-<n>.json (missing: fails); api -X POST <path> -f body=... → a line in $FX/log
if [ "$1 $2" = "api -X" ]; then
  n=$(sed -n 's|.*/issues/\([0-9]*\)/comments.*|\1|p' <<< "$4"); [ -e "$FX/postfail-$n" ] && { echo "HTTP 403" >&2; exit 1; }
  b=${6#body=}; printf 'POST %s %s\n' "$n" "$(tr '\n' '~' <<< "$b")" >> "$FX/log"; exit 0; fi
n=$(sed -n 's|.*/issues/\([0-9]*\)/comments.*|\1|p' <<< "$2"); p=$(sed -n 's|.*[?&]page=\([0-9]*\).*|\1|p' <<< "$2")
[ "${p:-1}" = 1 ] || { echo '[]'; exit 0; }
[ -f "$FX/comments-$n.json" ] && cat "$FX/comments-$n.json" || { echo '{"message":"Not Found"}'; exit 1; }
EOF
chmod +x "$T/gh"
det() { printf '%s\n' "$2" > "$T/fx/out-$1.txt"; printf '#!/usr/bin/env bash\ncat %q; exit %s\n' "$T/fx/out-$1.txt" "${3:-0}" > "$T/fx/$1.sh"; }
quiet() { for d in sle proof wake owed; do det $d "$d  nothing"; done; }
NOW=1764150000   # 2025-11-26T09:40:00Z, the stand-in clock (PW key age is read against it)
run() { : > "$T/fx/log"; out=$(cd "$T" && FX="$T/fx" PW_GH="$T/gh" PW_CMD_SLE="bash $T/fx/sle.sh" PW_CMD_PROOF="bash $T/fx/proof.sh" \
  PW_CMD_WAKE="bash $T/fx/wake.sh" PW_CMD_OWED="bash $T/fx/owed.sh" python3 -I "$W" --repo o/r --state "$T/state" --now "${AT:-$NOW}" --summary "$T/sum.md" "$@" 2>&1); r=$?; log=$(cat "$T/fx/log"); }
for n in 7 8 9; do echo '[]' > "$T/fx/comments-$n.json"; done

quiet; det sle "MISS  Q #7: question for the tech lead unanswered 12 min (target 10)
MISS  L #8: quiet 45 min with work left (target 30): read its session, send its next step
due   Q #9: question for the tech lead unanswered 4 min (target 10)"
run --post
ok "sle Q MISS: one comment on #7 naming the act" "$([ "$(grep -c '^POST 7 ' <<< "$log")" = 1 ] && grep -q 'unanswered 12 min' <<< "$log" && echo 1)" "$out / $log"
ok "sle: other targets (L) and a Q not yet due are not posted" "$(! grep -qE '^POST (8|9) ' <<< "$log" && echo 1)" "$log"
ok "the line carries its hidden key" "$(grep -qE 'pipeline-watch:[0-9a-f]{16} -->' <<< "$log" && echo 1)" "$log"
K=$(grep -oE 'pipeline-watch:[0-9a-f]{16}' <<< "$log" | head -1)
ok "exit 0 when every post landed" "$([ $r = 0 ] && echo 1)" "exit $r"

jq -n --arg b "x <!-- $K -->" '[{user: {login: "github-actions[bot]"}, created_at: "2025-11-26T09:00:00Z", body: $b}]' > "$T/fx/comments-7.json"
det sle "MISS  Q #7: question for the tech lead unanswered 22 min (target 10)"; run --post
ok "the same act 10 minutes later (its minutes changed) is not posted again" "$([ -z "$log" ] && grep -q 'already posted' <<< "$out" && echo 1)" "$out / $log"
AT=$((NOW + 25 * 3600)) run --post
ok "the same act still standing after 24 h is posted once more" "$(grep -q '^POST 7 ' <<< "$log" && echo 1)" "$out / $log"
jq -n --arg b "x <!-- $K -->" '[{user: {login: "someone"}, created_at: "2025-11-26T09:00:00Z", body: $b}]' > "$T/fx/comments-7.json"; run --post
ok "a key in a person's comment (a quote) is not a post by the watch: posted" "$(grep -q '^POST 7 ' <<< "$log" && echo 1)" "$log"
echo '[]' > "$T/fx/comments-7.json"

quiet; det proof "proof  1 merged
ACT   R1.5 merged in #8 at 10:00 IST, no qa proof PR after 41 min: type \"/qa capability R1.5\" into its qa lane (P-728)
ACT   #9 approved at 09:00 IST 70 min ago, unlabelled: waits on the Lead's P-423 read (.github/x.yml): read the diff, then label
ACT   2 approved PR(s) waiting over 24 h on the Lead's P-423 read: #8 #9: read each diff, or close it if superseded"
det wake "wake  #7 waited on #3, all on main; it is approved or queued: nothing to type
ACT   wake: #7 was woken by a PR comment 70 min ago and has not merged #3 yet: lane not found. Type: \"#3 is on main\""
run --post
ok "proof: the act on #8 and the aggregate naming #8 and #9 go in one comment on #8, one line each" "$([ "$(grep -c '^POST 8 ' <<< "$log")" = 1 ] && [ "$(grep '^POST 8 ' <<< "$log" | grep -o 'pipeline-watch:' | wc -l)" = 2 ] && echo 1)" "$log"
ok "proof: #9 gets its read act and the aggregate (two lines, one comment)" "$([ "$(grep -c '^POST 9 ' <<< "$log")" = 1 ] && [ "$(grep '^POST 9 ' <<< "$log" | grep -o 'pipeline-watch:' | wc -l)" = 2 ] && echo 1)" "$log"
ok "wake: its ACT line is posted on #7; its info lines are not" "$(grep '^POST 7 ' <<< "$log" | grep -q 'has not merged #3' && ! grep -q 'nothing to type' <<< "$log" && echo 1)" "$log"
ok "the issue numbers inside an act (#3) are not posted to as PRs only when the act names them: #3 has no comments file, so it is said" "$(grep -q 'comments of #3 cannot be read' <<< "$out" && ! grep -q '^POST 3 ' <<< "$log" && echo 1)" "$out"

quiet; det owed "ACT   owed starts: 2 starts owed at the founder's next typed turn"; run --post
ok "owed: an act naming no PR goes to the summary only" "$([ -z "$log" ] && grep -q 'no PR named; summary only' "$T/sum.md" && echo 1)" "$log"

quiet; det wake "" 1; run --post
ok "a detector that prints nothing and fails is said and turns the run red" "$([ $r = 1 ] && grep -q 'ACT   watch: wake is broken' <<< "$out" && echo 1)" "exit $r: $out"
quiet; det sle "MISS  SLE: could not read GitHub (HTTP 502); targets unchecked" 1; run --post
ok "sle-watch that cannot read GitHub is said and turns the run red" "$([ $r = 1 ] && grep -q 'sle is broken' <<< "$out" && echo 1)" "exit $r: $out"
quiet; det sle "MISS  Q #7: question for the tech lead unanswered 12 min (target 10)" 1; touch "$T/fx/postfail-7"; run --post
ok "a failed post is said and turns the run red" "$([ $r = 1 ] && grep -q 'the post on #7 failed' <<< "$out" && echo 1)" "exit $r: $out"
rm -f "$T/fx/postfail-7"; run
ok "without --post nothing is posted (it says what it would post)" "$([ -z "$log" ] && grep -q 'would post' <<< "$out" && echo 1)" "$out / $log"

# --- the wiring
wf=$(python3 -I - "$WF" <<'PY' 2>&1
import sys, yaml
d = yaml.safe_load(open(sys.argv[1])); on = d.get(True) or d.get("on"); bad = []
if set(on) != {"schedule", "workflow_dispatch", "push", "workflow_run", "issue_comment"}: bad.append(f"triggers {sorted(on)}")
if on["schedule"][0]["cron"].split()[0].count(",") != 5: bad.append("not every 10 minutes")
if (on["push"] or {}).get("branches") != ["main"] or (on["workflow_run"] or {}).get("branches") != ["main"]: bad.append("push or workflow_run not on main only")
if d.get("permissions") != {}: bad.append("workflow-level permissions are not {}")
j = d["jobs"]["watch"]; p = j["permissions"]
if [k for k, v in p.items() if v == "write"] != ["issues"]: bad.append(f"writes {p}")
if (d.get("concurrency") or {}).get("cancel-in-progress") is not False: bad.append("concurrency may cancel")
co = [s for s in j["steps"] if str(s.get("uses", "")).startswith("actions/checkout")]
if not co or co[0]["with"].get("ref") != "main" or co[0]["with"].get("persist-credentials") is not False: bad.append("checkout is not main without credentials")
txt = open(sys.argv[1]).read()
if "refs/pull" in txt or "head.sha" in txt: bad.append("fetches PR code")
if "author_association" not in j.get("if", ""): bad.append("any commenter starts it")
if "pipeline-watch.py" not in txt or "--post" not in txt: bad.append("does not run pipeline-watch.py --post")
print("; ".join(bad) or "ok")
PY
)
ok "pipeline-watch.yml: every 10 min plus push and ci on main and writers' comments; only issues: write; main's copy, no PR code; never cancelled" "$([ "$wf" = ok ] && echo 1)" "$wf"
ok "pipeline-watch.py runs the four existing detectors (no detection of its own)" "$(for s in sle-watch.py proof-read-watch.py merge-wake.py owed-watch.py; do grep -q "\"$s\"" "$W" || echo no; done | grep -q no || echo 1)" "a detector is not named"
finish
