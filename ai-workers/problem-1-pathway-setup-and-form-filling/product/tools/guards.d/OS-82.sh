# OS-82 (OS-PM 4): a head whose only pr-suites run predates job "pr-suites" counts only when its parts were skipped
MUT="$MUT"'
OS82 wired|product/tools/queue-gate.sh|s/\[ "\$suites_state" = missing \] \&\& noparts "\$s"; return 0; }/return 0; }/|check-queue-gate.sh
OS82 skipped|product/tools/queue-gate.sh|s/length > 0 and all(.conclusion == "skipped")/length > 0/|check-queue-gate.sh
OS82 warned|product/tools/queue-gate.sh|s/startswith("pr-suites"))/startswith("~"))/|check-queue-gate.sh
OS82 job|product/tools/queue-gate.sh|s/(\$j . any(.name == "pr-suites"))/(false)/|check-queue-gate.sh
OS82 green|product/tools/queue-gate.sh|s/select(.status == "completed" and .conclusion == "success" and/select(/|check-queue-gate.sh
OS82 before|product/tools/queue-gate.sh|s/ and (.created_at .. "9") < .before)/)/|check-queue-gate.sh
OS82 level|product/tools/queue-gate.sh|s/ or .annotation_level == "warning" or .annotation_level == "failure")/)/|check-queue-gate.sh
OS82 code|product/tools/queue-gate.sh|s/^  \[ -z "\$(grep -E .\/prototype\/.^packages\/. <<< "\${files:-}"/  [ -z "$(grep -E "^~" <<< "${files:-}"/|check-queue-gate.sh'
