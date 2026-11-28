# OS-34 (lab bundle A2 "Guards right-sized", LR-044, 28 Nov): the seven check-*.sh that nothing ran (no check-guards test,
# no mutation row's file, named only in workflow comments) now run as plain tests, and orphan-checks.sh lists any new one
# (check-orphan-checks.sh, 0 orphans on the repository). check-local-lanes.sh passes on Linux again (local-lanes.sh's mtime).
TESTS="$TESTS check-copy-prefix.sh check-g4-rules.sh check-local-lanes.sh check-plan-watch.sh check-pr-rules-closed.sh check-sle-watch.sh check-touch-overlap.sh check-orphan-checks.sh"
MUT="$MUT"'
OS34 comments|product/tools/orphan-checks.sh|s/^nocomment() { grep -hv .*/nocomment() { cat "$@" 2>\/dev\/null; }/|check-orphan-checks.sh
OS34 exit|product/tools/orphan-checks.sh|s/^\[ "\$n" = 0 \]$/true/|check-orphan-checks.sh
OS34 rows|product/tools/orphan-checks.sh|s/^covered=\$( { tests; extras; rowfiles; workflows; }/covered=$( { tests; extras; workflows; }/|check-orphan-checks.sh
OS34 guards.d|product/tools/orphan-checks.sh|s/^tests() { nocomment "\$T\/check-guards.sh" "\$T"\/guards.d\/\*.sh /tests() { nocomment "$T\/check-guards.sh" /|check-orphan-checks.sh
OS34 workflows|product/tools/orphan-checks.sh|s/^workflows() { .*/workflows() { :; }/|check-orphan-checks.sh'
