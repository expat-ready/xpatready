# OS-05 (OS P1, lab lane automation-measures, 27 Nov): queue-gate.sh's batch-failure line names its red parts by itself
# (autocover/autoline); this row switches that off, so check-queue-gate.sh must then fail.
MUT="$MUT"'
OS05 red part|product/tools/queue-gate.sh|s/^    \[ -n "\$url" \] .*/    url=x/|check-queue-gate.sh'
