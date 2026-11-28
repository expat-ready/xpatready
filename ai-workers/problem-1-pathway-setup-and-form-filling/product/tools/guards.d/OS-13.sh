# OS-13 (lab LR-048, Lab lane starter A451, 28 Nov): report-only-tally.py counts the report-only workflows' false blocks;
# each row switches one of its rules off, so check-report-only-tally.sh must then fail.
TESTS="$TESTS check-report-only-tally.sh"
MUT="$MUT"'
OS13 false block|product/tools/report-only-tally.py|s/false = \[r for r in red if r\["head_sha"\] in merged\]/false = []/|check-report-only-tally.sh
OS13 caught|product/tools/report-only-tally.py|s/caught = \[r for r in red if r\["head_sha"\] not in merged/caught = [r for r in [] if 1/|check-report-only-tally.sh
OS13 batch head|product/tools/report-only-tally.py|s/and not str(r.get("head_branch", "")).startswith("mergify\/"))/)/|check-report-only-tally.sh'
