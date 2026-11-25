#!/usr/bin/env bash
# E2 (P-772, B203): .github/workflows/pr-suites.yml runs a PR's affected suites. pr-suites-plan.sh on fake pickers, and
# the wiring: its own workflow (never ci.yml, never job "ci"'s needs or concurrency group), never a Mergify condition,
# never on a draft or a batch. P-822: the job "pr-suites" the queue gate reads, red unless the plan picked nothing or
# every part was green (fails closed), each part's one red-able step "verdict", and the 4 quarantined suites, each with
# an owner and a date. US$0.
#   bash product/tools/check-pr-suites-job.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/prsuites.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
# a throwaway repository with one change, and fakes for select-suites.mjs and run-suites.sh (FAKE_SEL, FAKE_UNITS)
git -C "$T" init -q -b main && git -C "$T" config user.email t@t && git -C "$T" config user.name t && git -C "$T" config commit.gpgsign false
echo a > "$T/a.ts" && git -C "$T" add -A && git -C "$T" commit -qm base && echo b > "$T/a.ts" && git -C "$T" commit -qam change
mkdir "$T/fake"; cp "$TOOLS/pr-suites-plan.sh" "$T/fake/"
cat > "$T/fake/select-suites.mjs" <<'JS'
process.stdout.write(process.env.FAKE_SEL.replace(/\\t/g, "\t").replace(/\\n/g, "\n") + "\n");
JS
cat > "$T/fake/run-suites.sh" <<'SH'
echo "$*" > "$PR_SUITES_TOOLS/args"; [ -n "${FAKE_FAIL:-}" ] && exit 1
for i in $(seq 1 "$FAKE_UNITS"); do echo "check_u$i.ts"; done
SH
plan() { (cd "$T" && PR_SUITES_TOOLS="$T/fake" bash "$T/fake/pr-suites-plan.sh" "$@"); }
out=$(FAKE_SEL='check_x.ts\tsmoke' FAKE_UNITS=6 plan HEAD~1..HEAD); r=$?
ok "a small pick: one part, --changed with the PR's range, by module (SPD-2 item 2: --modules)" "$([ $r = 0 ] && [ "$out" = "$(printf 'direct=false\nunits=6\nn=1\nshards=[1]')" ] && grep -qx -- '--changed HEAD~1..HEAD --modules --list' "$T/fake/args" && echo 1)" "exit $r: $out / $(cat "$T/fake/args")"
out=$(FAKE_SEL='ALL\tci.yml: shared' FAKE_UNITS=7 plan HEAD~1..HEAD)
ok "a change that would pick every suite still runs by module, never everything (the queue runs the whole set, P-651; SPD-2)" "$(grep -qx direct=true <<< "$out" && grep -qx -- '--changed HEAD~1..HEAD --modules --list' "$T/fake/args" && echo 1)" "$out / $(cat "$T/fake/args")"
out=$(FAKE_SEL='check_x.ts\tapi' FAKE_UNITS=51 plan HEAD~1..HEAD)
ok "51 units: ceil(51 / 25) = 3 parts" "$(grep -qx n=3 <<< "$out" && grep -qx 'shards=\[1,2,3\]' <<< "$out" && echo 1)" "$out"
out=$(FAKE_SEL='check_x.ts\tapi' FAKE_UNITS=600 plan HEAD~1..HEAD)
ok "600 units: capped at 12 parts" "$(grep -qx n=12 <<< "$out" && grep -qx 'shards=\[1,2,3,4,5,6,7,8,9,10,11,12\]' <<< "$out" && echo 1)" "$out"
out=$(FAKE_SEL='check_x.ts\tapi' FAKE_UNITS=0 plan HEAD~1..HEAD)
ok "no unit: no part (shards=[])" "$(grep -qx n=0 <<< "$out" && grep -qx 'shards=\[\]' <<< "$out" && echo 1)" "$out"
out=$(FAKE_SEL='x' FAKE_UNITS=1 FAKE_FAIL=1 plan HEAD~1..HEAD 2>&1); r=$?
ok "a pick that cannot be read: exit 2, no shards line (the job runs nothing)" "$([ $r = 2 ] && ! grep -q '^shards=' <<< "$out" && echo 1)" "exit $r: $out"
out=$(plan notarange 2>&1); r=$?
ok "no range: exit 2" "$([ $r = 2 ] && echo 1)" "exit $r"
# a rename: both paths reach the picker (as run-suites.sh reads the change; review m2)
git -C "$T" mv a.ts b.ts && git -C "$T" commit -qm rename
cat > "$T/fake/select-suites.mjs" <<'JS'
import { readFileSync } from "node:fs"; const t = readFileSync(0, "utf8"); process.stdout.write(t.includes("a.ts") && t.includes("b.ts") ? "ALL\tboth\n" : "check_x.ts\tsmoke\n");
JS
out=$(FAKE_UNITS=1 plan HEAD~1..HEAD)
ok "a renamed file gives the picker both paths (no rename detection)" "$(grep -qx direct=true <<< "$out" && echo 1)" "$out"
# the wiring: pr-suites.yml (parsed as YAML), ci.yml and .mergify.yml
W="$TOOLS/../../../../.github/workflows"; Y="$W/pr-suites.yml"; M="$TOOLS/../../../../.mergify.yml"
w=$(python3 -I - "$Y" "$W/ci.yml" <<'PY'
import sys, yaml
d = yaml.safe_load(open(sys.argv[1])); ci = open(sys.argv[2]).read(); j = d.get("jobs", {}); out = []
on = d.get(True) or d.get("on") or {}
out.append("pr-event" if set(on) == {"pull_request"} else "other-events")
out.append("own-workflow" if "pr-suites-plan.sh" not in ci and "pr-suites" not in ci else "in-ci")
c = d.get("concurrency") or {}
cip = str(c.get("cancel-in-progress"))   # SPD-2 item 5: a newer push cancels the PR's older run; a batch is never cancelled
out.append("supersedes-pr-not-batch" if "pr-suites-" in str(c.get("group")) and "pull_request" in cip and "mergify/" in cip else "cancel-rule")
p, s = j.get("plan", {}), j.get("parts", {})
cond = str(p.get("if", ""))
out.append("no-draft-no-batch" if "draft" in cond and "mergify/" in cond else "drafts-or-batches")
ps = p.get("steps", [])[1:]; ss = s.get("steps", [])[1:]
# P-822: every step is continue-on-error (summaries and logs always written) but the part's last step, "verdict"
out.append("one_verdict_step" if ps and ss and all(x.get("continue-on-error") is True for x in ps + ss[:-1]) and "continue-on-error" not in ss[-1]
  and "verdict" in ss[-1].get("name", "") and ss[-1].get("if") == "always()" and 'SETUP" = success' in ss[-1]["run"] and 'OUTCOME" = success' in ss[-1]["run"] else "verdict_step_shape")
v = j.get("pr-suites", {}); vr = str((v.get("steps") or [{}])[0].get("run", "")); vc = str(v.get("if", ""))
out.append("summary_job" if v.get("needs") == ["plan", "parts"] and "always()" in vc and "draft" in vc and "mergify/" in vc and v.get("permissions") == {}
  and '"success none skipped")' in vr and '"success run success")' in vr and vr.rstrip().endswith("exit 1") and vr.count("exit 0") == 2 else "summary_job_shape")
pl = str(ps[0].get("run", "")) if ps else ""
out.append("plan_verdict" if pl.count("verdict=fail") == 2 and "verdict=none" in pl and "verdict=%s" in pl and p.get("outputs", {}).get("verdict") else "plan_verdict_missing")
out.append("quarantine_read" if "pr-suites-quarantine.txt" in str(run[0]["run"] if (run := [x for x in ss if "run-suites.sh" in str(x.get("run", ""))]) else "") and "SUITES_QUARANTINE_AUTO" in str(run[0]["run"]) else "quarantine_missing")
run = [x for x in ss if "run-suites.sh" in str(x.get("run", ""))]
out.append("changed" if run and "--changed" in run[0]["run"] and "--modules" in run[0]["run"] and run[0].get("timeout-minutes") and "setup.outcome == 'success'" in str(run[0].get("if")) else "suites-step")
out.append("limits" if s.get("timeout-minutes", 0) >= sum(x.get("timeout-minutes", 0) for x in ss) + 5 else "job-limit-too-short")
out.append("plan" if any("pr-suites-plan.sh" in str(x.get("run", "")) and "change-kind.sh" in str(x.get("run", "")) for x in ps) else "no_plan")
perm = lambda x: x.get("permissions") == {"contents": "read"}
out.append("read-only" if d.get("permissions") == {} and perm(p) and perm(s) else "write-token")
print(" ".join(out))
PY
)
ok "pull_request only" "$(grep -qw pr-event <<< "$w" && echo 1)" "$w"
ok "its own workflow: ci.yml (job \"ci\", the one required check, and its concurrency group) never waits on it" "$(grep -qw own-workflow <<< "$w" && echo 1)" "$w"
ok "a newer push supersedes the PR's older run; a merge-queue batch is never cancelled (SPD-2 item 5)" "$(grep -qw supersedes-pr-not-batch <<< "$w" && echo 1)" "$w"
ok "drafts and Mergify's batch PRs run nothing" "$(grep -qw no-draft-no-batch <<< "$w" && echo 1)" "$w"
ok "every step after checkout is continue-on-error but each part's last, \"verdict\" (always(), red unless set-up and suites succeeded; P-822)" "$(grep -qw one_verdict_step <<< "$w" && echo 1)" "$w"
ok "job pr-suites: after plan and parts, always() but never on a draft or a batch, no token; green only for no suite picked or every part green, else red (P-822)" "$(grep -qw summary_job <<< "$w" && echo 1)" "$w"
ok "the plan says its verdict: fail when no test merge or the picker failed, none when nothing to run, run otherwise (P-822)" "$(grep -qw plan_verdict <<< "$w" && echo 1)" "$w"
ok "the suites step reads pr-suites-quarantine.txt into SUITES_QUARANTINE_AUTO (P-822)" "$(grep -qw quarantine_read <<< "$w" && echo 1)" "$w"
# P-822: the job's own script, run with each plan and parts result: green only for nothing picked or every part green
python3 -I -c 'import sys,yaml; print(yaml.safe_load(open(sys.argv[1]))["jobs"]["pr-suites"]["steps"][0]["run"])' "$Y" > "$T/verdict.sh" 2>/dev/null || : > "$T/verdict.sh"
vbad=""
for c in "success none skipped 0" "success run success 0" "success run failure 1" "success run cancelled 1" "success run skipped 1" "success fail skipped 1" \
         "success _ skipped 1" "failure _ skipped 1" "cancelled _ skipped 1" "success none success 1"; do
  read -r pl vd pa want <<< "$c"; [ "$vd" = _ ] && vd=""
  PLAN=$pl VERDICT=$vd PARTS=$pa GITHUB_STEP_SUMMARY=/dev/null bash -e "$T/verdict.sh" >/dev/null 2>&1; got=$?
  [ "$got" = "$want" ] || vbad="$vbad [$c: exit $got]"
done
ok "job pr-suites' script: green for no suite picked or every part green; red for a red, cancelled or missing part, a failed or missing plan (fails closed)" "$([ -s "$T/verdict.sh" ] && [ -z "$vbad" ] && echo 1)" "${vbad:-no script}"
# P-822's 4 quarantined suites: each a real suite, an owner lane, a date, the decision marker; run-suites.sh accepts each
Q="$TOOLS/pr-suites-quarantine.txt"; ST="$TOOLS/../../prototype/studio/tests"; qbad=""; qn=0
while IFS='|' read -r qs qo qd qr; do qn=$((qn + 1))
  [ -f "$ST/$qs" ] && [[ "$qo" =~ ^(screens|forms|runtime|evidence)$ && "$qd" =~ ^2026-1[12]-[0-9]{2}$ && "$qr" = p822 ]] || qbad="$qbad $qs|$qo|$qd|$qr"
done < <(grep -vE '^[[:space:]]*(#|$)' "$Q")
ok "pr-suites-quarantine.txt: the 4 suites, each a real suite with an owner lane and a fix date (P-822)" "$([ "$qn" = 4 ] && [ -z "$qbad" ] && for x in check_s5_slice3_browser.cjs check_c69_page_browser.cjs check_c83_review_browser.cjs check_fo8_prospect_won.ts; do grep -q "^$x|" "$Q" || exit; done && echo 1)" "$qn entries; bad:$qbad"
qa=$(grep -vE '^[[:space:]]*(#|$)' "$Q" | xargs); qr=$(sed -n '/^AUTOQ=" "$/,/^done$/p' "$TOOLS/run-suites.sh"); qw=$(sed -n '/^qwhy() {/,/^  echo "fails at random/p' "$TOOLS/run-suites.sh")
qo=$(SUITES_QUARANTINE_AUTO="$qa" QUARANTINE="" bash -c "$qr"$'\n'"$qw"$'\n''for s in check_c83_review_browser.cjs; do qwhy "$s"; done; echo "Q:$QUARANTINE"' 2>&1)
ok "run-suites.sh takes every entry (none \"ignored\") and its row names the owner and date: nothing skipped silently" "$(! grep -q ignored <<< "$qo" && grep -q 'owner screens, fix by 2026-12-02' <<< "$qo" && [ "$(grep -o 'check_[a-z0-9_]*\.\(cjs\|ts\)' <<< "${qo##*Q:}" | wc -l)" = 4 ] && echo 1)" "$qo"
ok "the suites step is --changed, time-limited, and runs only after a good set-up" "$(grep -qw changed <<< "$w" && echo 1)" "$w"
ok "the parts' job limit covers its steps' limits plus 5 min" "$(grep -qw limits <<< "$w" && echo 1)" "$w"
ok "the plan reads change-kind.sh and pr-suites-plan.sh" "$(grep -qw plan <<< "$w" && echo 1)" "$w"
ok "read-only tokens (it runs the PR's code)" "$(grep -qw read-only <<< "$w" && echo 1)" "$w"
# a change to how a PR's suites run runs them: select-suites.mjs counts pr-suites.yml and pr-suites-plan.sh as suite tooling
for f in .github/workflows/pr-suites.yml ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/pr-suites-plan.sh; do
  o=$(cd "$TOOLS/../../../.." && printf '%s\n' "$f" | node "$TOOLS/select-suites.mjs" | head -1); k=$(cd "$TOOLS/../../../.." && printf '%s\n' "$f" | bash "$TOOLS/change-kind.sh" --files)
  ok "${f##*/}: kind code and every suite (so its own PR runs the parts, --direct)" "$([ "$k" = code ] && grep -qP '^ALL\t' <<< "$o" && echo 1)" "kind $k, $o"
done
ok "no Mergify condition names pr-suites (P-822 is enforced at the label, by queue-gate.sh)" "$(! grep -q 'pr-suites' "$M" && echo 1)" "pr-suites found in .mergify.yml"
finish
