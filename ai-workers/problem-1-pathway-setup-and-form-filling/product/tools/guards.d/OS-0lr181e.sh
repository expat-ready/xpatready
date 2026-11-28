# LR-181 (lab register, the eslint edit hook; LR-083's hook half. "e" because #4109's queue cases also say LR-181).
# Each row switches one of edit-lint.sh's rules off.
TESTS="$TESTS check-edit-lint.sh"
MUT="$MUT"'
LR181e findings|product/tools/edit-lint.sh|s/^exit 2$/exit 0/|check-edit-lint.sh
LR181e studio-only|product/tools/edit-lint.sh|s/^case "\$f" in "\$STUDIO"\/\*) .*$/:/|check-edit-lint.sh
LR181e source-only|product/tools/edit-lint.sh|s/^case "\$rel" in \*\.ts .*$/:/|check-edit-lint.sh
LR181e skip-list|product/tools/edit-lint.sh|s/^case "\$rel" in \*\.d\.ts .*$/:/|check-edit-lint.sh
LR181e edit-config|product/tools/edit-lint.sh|s/ -c eslint.edit.config.js//|check-edit-lint.sh
LR181e crash-quiet|product/tools/edit-lint.sh|s/^\[ "\$rc" = 1 \] /[ "$rc" != 0 ] /|check-edit-lint.sh
LR181e mac-timeout|product/tools/edit-lint.sh|s/^CAP=.*$/CAP=timeout/|check-edit-lint.sh'
