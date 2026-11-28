# LR-155 slice (memory-enforcement audit top 15 no. 5 (c), lab lane fast-route-2, 28 Nov): no personal name in a PR's
# title or body (names-check.sh, run by pr-rules); each row switches one part off, so check-names-check.sh must fail.
TESTS="$TESTS check-names-check.sh"
MUT="$MUT"'
LR155N refuse|product/tools/names-check.sh|s/^exit 1$/exit 0/|check-names-check.sh
LR155N closed|product/tools/names-check.sh|s/(fails closed). Fix: restore the NAMES_RE=.\.\.\.. line in push-guard.sh."; exit 2; }/(fails closed). Fix: restore it."; exit 0; }/|check-names-check.sh
LR155N case|product/tools/names-check.sh|s/grep -noiE/grep -noE/|check-names-check.sh
LR155N wired|../../.github/workflows/pr-rules.yml|s/bash "$T\/names-check.sh"/true/|check-names-check.sh'
