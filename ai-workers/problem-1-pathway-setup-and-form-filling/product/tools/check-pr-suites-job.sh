#!/usr/bin/env bash
# E2 (P-772, B203): ci.yml's jobs pr-suites-plan and pr-suites run a PR's affected suites REPORT ONLY. pr-suites-plan.sh
# on fake pickers, and the workflow wiring: never in job "ci"'s needs, never a Mergify condition, never on a batch, the
# suites step cannot turn the check red. US$0, no network.
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
ok "a small pick: one part, --changed with the PR's range, not --direct" "$([ $r = 0 ] && [ "$out" = "$(printf 'direct=false\nunits=6\nn=1\nshards=[1]')" ] && grep -qx -- '--changed HEAD~1..HEAD --list' "$T/fake/args" && echo 1)" "exit $r: $out / $(cat "$T/fake/args")"
out=$(FAKE_SEL='ALL\tci.yml: shared' FAKE_UNITS=7 plan HEAD~1..HEAD)
ok "a change that would pick every suite runs --direct (the queue runs the whole set, P-651)" "$(grep -qx direct=true <<< "$out" && grep -qx -- '--changed HEAD~1..HEAD --direct --list' "$T/fake/args" && echo 1)" "$out / $(cat "$T/fake/args")"
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
# the wiring in ci.yml (parsed as YAML) and .mergify.yml
Y="$TOOLS/../../../../.github/workflows/ci.yml"; M="$TOOLS/../../../../.mergify.yml"
w=$(python3 -I - "$Y" <<'PY'
import sys, yaml
d = yaml.safe_load(open(sys.argv[1])); j = d["jobs"]; out = []
need = j["ci"].get("needs", []); need = [need] if isinstance(need, str) else need
out.append("ci-needs-free" if not ({"pr-suites", "pr-suites-plan"} & set(need)) else "ci-needs-pr-suites")
p = j.get("pr-suites-plan", {}); s = j.get("pr-suites", {})
cond = str(p.get("if", ""))
out.append("pr-only" if "github.event_name == 'pull_request'" in cond and "queue != 'true'" in cond and "kind == 'code'" in cond else "not-pr-only")
step = [x for x in s.get("steps", []) if "run-suites.sh" in str(x.get("run", ""))]
out.append("changed" if step and "--changed" in step[0]["run"] and step[0].get("continue-on-error") is True and step[0].get("timeout-minutes") else "step-can-fail")
out.append("job-ok" if s.get("timeout-minutes", 0) > (step[0].get("timeout-minutes", 999) if step else 999) and "continue-on-error" not in s else "job-timeout")
out.append("plan" if any("pr-suites-plan.sh" in str(x.get("run", "")) for x in p.get("steps", [])) else "no-plan")
out.append("read-only" if p.get("permissions") == {"contents": "read"} and s.get("permissions") == {"contents": "read"} else "write-token")
print(" ".join(out))
PY
)
ok "job \"ci\" (the one check Mergify and the ruleset read) does not wait on pr-suites" "$(grep -qw ci-needs-free <<< "$w" && echo 1)" "$w"
ok "pr-suites-plan runs on a PR of code only, never on a merge-queue batch" "$(grep -qw pr-only <<< "$w" && echo 1)" "$w"
ok "the suites step is --changed, continue-on-error and time-limited (report only: never a red check)" "$(grep -qw changed <<< "$w" && echo 1)" "$w"
ok "the job's limit is above the step's, so a slow pick ends the step, not the job" "$(grep -qw job-ok <<< "$w" && echo 1)" "$w"
ok "the plan comes from pr-suites-plan.sh" "$(grep -qw plan <<< "$w" && echo 1)" "$w"
ok "both jobs hold a read-only token (they run the PR's code)" "$(grep -qw read-only <<< "$w" && echo 1)" "$w"
ok "no Mergify condition names pr-suites (P-717 (b): report only until the tech lead adds it)" "$(! grep -q 'pr-suites' "$M" && echo 1)" "pr-suites found in .mergify.yml"
finish
