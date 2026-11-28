# LR-167 (file named OS-0lr167.sh: check-guards-d.sh reads only OS-<digits>…; founder A455, 28 Nov): the Lead's check turn
# cannot end without a lead-watch run finished under 12 min ago from a copy within 20 commits of origin/main.
TESTS="$TESTS check-check-stamp.sh"   # LR-167: the check turn needs a finished lead-watch run
MUT="$MUT"'
LR167 age|product/tools/lead-check-guard.sh|s/if \[ "\$age" -ge "\${FULL_MAX:-12}" \] .. \[ "\$age" -lt 0 \]; then/if false; then/|check-check-stamp.sh
LR167 behind|product/tools/lead-check-guard.sh|s/elif \[ "\$fbh" -gt "\${FULL_BEHIND:-20}" \]; then/elif false; then/|check-check-stamp.sh
LR167 none|product/tools/lead-check-guard.sh|s/if \[ ! -s "\$fc" \]; then why="no lead-watch run/if false; then why="no lead-watch run/|check-check-stamp.sh
LR167 loop|product/tools/lead-check-guard.sh|s/if \[ "\$n" -gt 3 \]; then gave=/if false; then gave=/|check-check-stamp.sh
LR167 minutes|product/tools/lead-check-guard.sh|s/elif \[ "\$fs" -lt 30 \]; then/elif false; then/|check-check-stamp.sh
LR167 turn|product/tools/lead-check-guard.sh|s/cut -d. . -f1).\${pos:-0}"/cut -d" " -f1)"/|check-check-stamp.sh
LR167 clear|product/tools/lead-check-guard.sh|s/  if \[ -z "\$why" \]; then rm -f "\$cnt" 2>\/dev\/null/  if [ -z "$why" ]; then :/|check-check-stamp.sh'
