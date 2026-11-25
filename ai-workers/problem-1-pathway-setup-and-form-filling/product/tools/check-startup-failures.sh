#!/usr/bin/env bash
# Runs that never started (OS-52): startup-failures.py makes one ACT per workflow with startup_failure runs in the window.
# Pass and fail case for each rule, with a stand-in gh serving made-up pages. US$0, no network.   bash product/tools/check-startup-failures.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/suf.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
# the stand-in serves $T/page<N>.json for "&page=N", or fails when FAIL names that page
cat > "$T/gh" <<EOF
#!/bin/sh
p=\$(printf '%s' "\$2" | sed -n 's/.*&page=\([0-9]*\).*/\1/p'); echo "\$2" >> "$T/calls"
[ "\${FAIL:-x}" = "\$p" ] && { echo "HTTP 502" >&2; exit 1; }
cat "$T/page\$p.json" 2>/dev/null || echo '{"workflow_runs":[]}'
EOF
chmod +x "$T/gh"
r() { python3 -I -c 'import json,sys; n,c,t,b=sys.argv[1:5]; print(json.dumps({"name":n,"path":".github/workflows/%s.yml"%n,"conclusion":c,"created_at":t,"html_url":"https://x/runs/"+t[14:16],"head_branch":b}))' "$@"; }
page() { local f="$T/page$1.json"; shift; printf '{"workflow_runs":[%s]}' "$(IFS=,; echo "$*")" > "$f"; }
S=2026-11-25T05:00:00Z
run() { : > "$T/calls"; o=$(STARTUP_GH="$T/gh" python3 -I "$TOOLS/startup-failures.py" --since "${SINCE-$S}" 2>&1); rc=$?; }
acts() { grep -c '^ACT' <<<"$o"; }; has() { grep -qF -- "$1" <<<"$o"; }
clear() { rm -f "$T"/page*.json; }

clear; page 1 "$(r ci success 2026-11-25T05:10:00Z main)" "$(r walks failure 2026-11-25T05:11:00Z a)"; run
ok "no startup failure: no ACT, the summary counts the runs, exit 0" "$([ "$rc" = 0 ] && [ "$(acts)" = 0 ] && has 'startup failures: 0 run(s) in 0 workflow(s) since 2026-11-25T05:00:00Z (2 listed)' && grep -q 'status=startup_failure&created=%3E%3D2026-11-25T05:00:00Z' "$T/calls" && echo 1)" "$o"
clear; page 1 "$(r label-guard startup_failure 2026-11-25T05:20:00Z b1)" "$(r label-guard startup_failure 2026-11-25T05:25:00Z b2)" "$(r ci startup_failure 2026-11-25T05:21:00Z main)" "$(r ci success 2026-11-25T05:22:00Z x)"; run
ok "one ACT per workflow, with its count, path, newest run and branch" "$([ "$(acts)" = 2 ] && has 'workflow label-guard (.github/workflows/label-guard.yml): 2 run(s)' && has 'newest https://x/runs/25 on b2' && has 'workflow ci (' && echo 1)" "$o"
clear; page 1 "$(r ci startup_failure 2026-11-25T04:59:00Z main)"; run
ok "a run created before the window is not judged" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
clear; page 1 "$(r ci cancelled 2026-11-25T05:10:00Z main)" "$(r ci action_required 2026-11-25T05:10:00Z main)"; run
ok "other conclusions are not startup failures" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
clear; L=(); for i in $(seq 1 100); do L+=("$(r ci success 2026-11-25T05:10:00Z m)"); done; page 1 "${L[@]}"; page 2 "$(r guards startup_failure 2026-11-25T05:30:00Z c)"; run
ok "a full page reads the next one" "$([ "$(acts)" = 1 ] && has 'workflow guards' && grep -q 'page=2' "$T/calls" && echo 1)" "$o"
clear; page 1 "$(r ci startup_failure 2026-11-25T05:10:00Z main)"; FAIL=1 run
ok "an unreadable page is an ACT, never 'none'" "$([ "$(acts)" = 1 ] && has 'runs page 1 unreadable (HTTP 502)' && has '(read cut short)' && echo 1)" "$o"
clear; page 1 "${L[@]}"; page 2 "$(r ci startup_failure 2026-11-25T05:10:00Z m)"; FAIL=2 run
ok "a later page that fails: an ACT, and the first page is still judged" "$(has 'runs page 2 unreadable' && has '(100 listed)' && echo 1)" "$o"
clear; for p in $(seq 1 10); do page "$p" "${L[@]}"; done; run
ok "more than 1,000 runs: an ACT that the oldest are not judged" "$([ "$(acts)" = 1 ] && has 'more than 1000 startup_failure runs' && echo 1)" "$o"
clear; echo 'not json' > "$T/page1.json"; run; ok "a page that is not JSON is an ACT" "$([ "$(acts)" = 1 ] && has 'unreadable' && echo 1)" "$o"
clear; page 1 "$(r ci startup_failure 2026-11-25T05:10:00Z main)"; printf '#!/bin/sh\nsleep 100\n' > "$T/gslow"; chmod +x "$T/gslow"; o=$(STARTUP_GH="$T/gslow" timeout 150 python3 -I "$TOOLS/startup-failures.py" --since "$S" 2>&1); rc=$?
ok "a read with no answer in 90 s is an ACT, exit 0" "$([ "$rc" = 0 ] && [ "$(acts)" = 1 ] && has 'TimeoutExpired' && echo 1)" "$o"
clear; SINCE='5 min ago; rm -rf /' run; ok "a --since that is not an ISO time is an ACT and calls nothing" "$([ "$(acts)" = 1 ] && [ ! -s "$T/calls" ] && echo 1)" "$o"
clear; page 1 "$(r $'ci\x1b[31m' startup_failure 2026-11-25T05:10:00Z $'b\nACT   fake')"; run
ok "control characters in names are cleaned: still one ACT line" "$([ "$(acts)" = 1 ] && echo 1)" "$o"
# lead-watch wiring
L2="$TOOLS/lead-watch.sh"
ok "lead-watch runs it with the window's start and counts its ACT lines" "$(grep -q 'startup-failures.py" --since "$since"' "$L2" && grep -A2 'startup-failures.py" --since' "$L2" | grep -q "grep -c '^ACT'" && echo 1)" "$(grep -n startup-failures "$L2")"
sed -n '/^# 4c (OS-52/,/^$/p' "$L2" > "$T/step.sh"; mkdir -p "$T/l"
step() { printf 'import sys\nprint("""%s""")\nsys.exit(%s)\n' "$1" "${2:-0}" > "$T/l/startup-failures.py"; o=$( ( TOOLS="$T/l"; since=$S; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { :; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
step 'startup failures: 0 run(s)'; ok "lead-watch 4c: a clean read is no ACT" "$(has 'acts=0' && echo 1)" "$o"
step $'ACT   startup failure: workflow ci\nstartup failures: 1 run(s)'; ok "lead-watch 4c: its ACT line is counted" "$(has 'acts=1' && echo 1)" "$o"
step 'Traceback' 1; ok "lead-watch 4c: a crash is an ACT" "$(has 'did not run' && has 'acts=1' && echo 1)" "$o"
finish
