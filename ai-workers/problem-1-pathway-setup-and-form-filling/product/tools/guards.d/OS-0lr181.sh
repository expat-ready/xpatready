# LR-181 (lab register, lane automation-measures-2, 28 Nov): the edit-time lint hook (lint-hook.sh, a PostToolUse hook)
# lints an edited studio source file and skips the rest, never blocking on its own trouble. Each row breaks one rule, so
# check-lint-hook.sh must then fail.
TESTS="$TESTS check-lint-hook.sh"   # LR-181: the edit-time lint hook
MUT="$MUT"'
LR181 scope|product/tools/lint-hook.sh|s/^case "\$f" in "\$S"\/\*) ;; \*) exit 0 ;; esac$/true/|check-lint-hook.sh
LR181 kind|product/tools/lint-hook.sh|s/^\(case "\$rel" in \*.ts.*\) \*) exit 0 ;; esac$/\1 *) ;; esac/|check-lint-hook.sh
LR181 crash|product/tools/lint-hook.sh|s/^\[ "\$rc" = 1 \] .. exit 0 /[ "$rc" = 0 ] \&\& exit 0 /|check-lint-hook.sh
LR181 config|product/tools/lint-hook.sh|s/--config eslint.hook.config.js //|check-lint-hook.sh
LR181 report|product/tools/lint-hook.sh|s/^exit 2$/exit 0/|check-lint-hook.sh
LR181 notimeout|product/tools/lint-hook.sh|s/command -v gtimeout .. true)/echo timeout)/|check-lint-hook.sh
LR181 realpath|product/tools/lint-hook.sh|s/os.path.realpath(/os.path.normpath(/|check-lint-hook.sh'
