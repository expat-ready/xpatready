# OS-857 (P-857 (5), founder 28 Nov, "cap the records"): a PR over 800 changed lines passes with the label "size: exception"
# and a "Size exception: <reason>" body line, so an exception no longer costs a DECISIONS row; the old "Size exception: P-NNN"
# form keeps working. pr-rules.yml reads the labels at the run and fails closed. Each row switches a part off, so
# check-size-exception.sh must then fail.
TESTS="$TESTS check-size-exception.sh"
MUT="$MUT"'
OS857 label|product/tools/pr-size.sh|s/^if \[ "\${4:-no}" = yes \]; then/if false; then/|check-size-exception.sh
OS857 reason|product/tools/pr-size.sh|s/^  \[ -n "\$reason" \] \&\& {/  true \&\& {/|check-size-exception.sh
OS857 handed|../../.github/workflows/pr-rules.yml|s/pr-size.sh" "\$CODE" 0 "\$REC" "\$LAB"/pr-size.sh" "$CODE" 0 "$REC"/|check-size-exception.sh
OS857 closed|../../.github/workflows/pr-rules.yml|s/labels could not be read, so this step fails (LR-043, fail closed)"; exit 1; }/labels could not be read"; }/|check-size-exception.sh'
