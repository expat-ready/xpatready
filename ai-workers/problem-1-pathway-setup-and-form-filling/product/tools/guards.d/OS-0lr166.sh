# LR-166 (file named OS-0lr166.sh: check-guards-d.sh reads only OS-<digits>…; founder A455, 28 Nov): a copy over 20 behind
# origin/main or on a base over 24 h old is refused (lead-watch.sh exit 3, one ACT line with the command); session-start says so.
TESTS="$TESTS check-copy-gate.sh"   # LR-166: stale copy refused, not warned
MUT="$MUT"'
LR166 behind|product/tools/copy-gate.sh|s/if \[ "\$behind" -le "\$B" \] \&\& \[ "\$age_h" -le "\$H" \]; then/if [ "$age_h" -le "$H" ]; then/|check-copy-gate.sh
LR166 age|product/tools/copy-gate.sh|s/if \[ "\$behind" -le "\$B" \] \&\& \[ "\$age_h" -le "\$H" \]; then/if [ "$behind" -le "$B" ]; then/|check-copy-gate.sh
LR166 recut|product/tools/copy-gate.sh|s/if \[ "\$unpushed" = 0 \] \&\& \[ -z "\$dirty" \]; then/if true; then/|check-copy-gate.sh
LR166 watch|product/tools/lead-watch.sh|s/^  \[ "\$cgr" = 0 \] /  true /|check-copy-gate.sh
LR166 own|product/tools/lead-watch.sh|s/cg=\$(bash "\$TOOLS\/copy-gate.sh" "\$TOOLS" 2>\&1)/cg=$(bash "$TOOLS\/copy-gate.sh" . 2>\&1)/|check-copy-gate.sh
LR166 start|product/tools/session-start.sh|s/^ctx=\$(\[ -n "\${gate:-}" \] \&\& { echo "\$gate"; echo; }; /ctx=$(/|check-copy-gate.sh'
