# OS-26 / LR-053 (lab lane fast-route-2, 28 Nov): the hand-over warning at the context line; each row switches one part of
# context-line.sh off, so check-context-line.sh must then fail.
TESTS="$TESTS check-context-line.sh"
MUT="$MUT"'
OS26 over|product/tools/context-line.sh|s/^\[ "\$used" -gt "\$line" \] .. exit 0/exit 0/|check-context-line.sh
OS26 last|product/tools/context-line.sh|s/2>\/dev\/null . head -1)/2>\/dev\/null . tail -1)/|check-context-line.sh
OS26 side|product/tools/context-line.sh|s/ and (.isSidechain \/\/ false) == false//|check-context-line.sh
OS26 lead|product/tools/context-line.sh|s/line=320000/line=400000/|check-context-line.sh'
