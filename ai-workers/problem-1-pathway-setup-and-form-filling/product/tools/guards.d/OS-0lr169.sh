# LR-169 (file named OS-0lr169.sh: check-guards-d.sh reads only OS-<digits>…; founder A455, #4019): a head pushed as a draft
# whose ready-for-review pr-suites run is still going is pending, not skipped; a label put on meanwhile is kept, and the
# run's end takes it off unless it ended green.
MUT="$MUT"'
LR169 pending|product/tools/queue-gate.sh|s/  case "\$suites_state" in missing.skipped) prpending "\$s";; esac; return 0; }/  return 0; }/|check-queue-gate.sh
LR169 break|product/tools/queue-gate.sh|s/    \[ "\$suites_state" = skipped \] \&\& break /    true /|check-queue-gate.sh
LR169 mine|product/tools/queue-gate.sh|s/    and .head_sha == \$s and .status != "completed" and any(.pull_requests\[\]?; .number == \$n and .base.ref == "main"))\]/    and .status != "completed")]/|check-queue-gate.sh
LR169 exit3|product/tools/queue-gate.sh|s/\[ "\$suites_state" = pending \] \&\& exit 3; exit 1; }/exit 1; }/|check-queue-gate.sh
LR169 keep|product/tools/label-guard.sh|s/    \[ "\$p" = 3 \] \&\& { echo "kept:/    [ "$p" = 99 ] \&\& { echo "kept:/|check-label-guard.sh
LR169 end|product/tools/queue-gate.sh|s/do PR=\$n; suitesend "\$e" .. rc=\$?; both/do PR=$n; both/|check-queue-gate.sh
LR169 head|product/tools/queue-gate.sh|s/  \[ "\$(jq -r ..workflow_run.head_sha \/\/ "". "\$e")" = "\$head" \] .. return 0/  true/|check-queue-gate.sh'
