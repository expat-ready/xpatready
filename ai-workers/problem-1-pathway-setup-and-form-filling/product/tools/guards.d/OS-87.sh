# OS-87 (Lead 2, 26 Nov): the full run and a missing pr-suites run start by themselves on an Approve or a review label;
# the gate's dispatched pr-suites run (main's file, named by PR and head) counts for P-822.
MUT="$MUT"'
OS87 counted|product/tools/queue-gate.sh|s/^  case "\$suites_state" in missing.skipped) dispatched "\$s";; esac; return 0; }/  return 0; }/|check-queue-gate.sh
OS87 main|product/tools/queue-gate.sh|s/    and .event == "workflow_dispatch" and .head_branch == "main")/    and .event == "workflow_dispatch")/|check-queue-gate.sh
OS87 job|product/tools/queue-gate.sh|s/\[.jobs\[\]? . select(.name == "pr-suites")\]/[.jobs[]?]/|check-queue-gate.sh
OS87 approved|product/tools/queue-gate.sh|s/^  approved \(.. { echo "#\$PR: no pr-suites run started\)/  true \1/|check-queue-gate.sh
OS87 label|product/tools/queue-gate.sh|s/= "labeled \$LABEL" \(\]; then load\)/= "never"\1/|check-queue-gate.sh
OS87 wake|../../.github/workflows/queue-gate.yml|s/startsWith(github.event.workflow_run.display_title, .pr-suites PR #.)/false/|check-queue-gate.sh
OS87 reviewed|../../.github/workflows/pr-suites.yml|s/          \[ "\$now" = "\$HEAD_SHA \$GITHUB_REPOSITORY" \] .. { echo "::error::pr-suites: that commit/          true; { echo "::warning::pr-suites: that commit/|check-pr-suites-job.sh
OS87 cache|../../.github/workflows/pr-suites.yml|s/cache: \${{ github.event_name == .pull_request. \&\& .npm. .. .. }}/cache: npm/|check-pr-suites-job.sh'
