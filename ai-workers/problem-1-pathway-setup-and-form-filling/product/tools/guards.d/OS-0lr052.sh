# LR-052 (file named OS-0lr052.sh: check-guards-d.sh reads only OS-<digits>…) (FP #54, #186): the session start is a
# pointer under 1,536 bytes. Row "paste" puts STATE.md back into the output; row "lead" drops the current_lead line.
TESTS="$TESTS check-session-start-size.sh"   # LR-052: session-start.sh output under 1.5 KB
MUT="$MUT"'
LR052 paste|product/tools/session-start.sh|s/^\[ -n "\$cl" \] \&\& page=/page="$page$(cat "$RD\/STATE.md" 2>\/dev\/null)"; [ -n "$cl" ] \&\& page=/|check-session-start-size.sh
LR052 lead|product/tools/session-start.sh|s/cl=\$(grep -m1 .^current_lead:. "\$RD\/STATE.md"/cl=$(grep -m1 NEVER "$RD\/STATE.md"/|check-session-start-size.sh'
