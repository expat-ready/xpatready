# LR-180 (qa #4083): the Python form helpers step of cloud-setup.sh (python-helpers.sh) and its test. Each row switches one
# behaviour off; check-python-helpers.sh must fail. (The lock rows L1, L2 are not read in a guards copy: no prototype/env.)
TESTS="$TESTS check-python-helpers.sh"
MUT="$MUT"'
LR180 strict|product/tools/python-helpers.sh|s/ \&\& \[ -n "\${CI:-}" \] \&\& STRICT=1//|check-python-helpers.sh
LR180 goeson|product/tools/python-helpers.sh|s/exit 1; exit 0; }/exit 1; exit 1; }/|check-python-helpers.sh
LR180 venvguard|product/tools/python-helpers.sh|s/^if \[ ! -x "\$VENV\/bin\/python" \]; then/if true; then/|check-python-helpers.sh
LR180 called|product/tools/cloud-setup.sh|/python-helpers.sh" "\$VENV" "\$LOCK"/d|check-python-helpers.sh'
