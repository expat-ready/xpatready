# LR-178 (Lead 13, 28 Nov; records PR #4100): one writer for the lab register. A PR that is not records-only and changes
# design/lab-register-2026-11-27.md fails pr-rules; each part switched off in turn, check-register-writer.sh must then fail.
TESTS="$TESTS check-register-writer.sh"
MUT="$MUT"'
LR178 match|product/tools/register-writer.sh|s/grep -qxF "\$REG"/grep -qxF "\$REG.none"/|check-register-writer.sh
LR178 refuse|product/tools/register-writer.sh|/REGISTER WRITTEN BY A CODE PR/,/^fi/s/  exit 1/  exit 0/|check-register-writer.sh
LR178 skip records|../../.github/workflows/pr-rules.yml|/leaves the lab register to the records lane/,/register-writer.sh/s/ \&\& steps.rec.outputs.records != .yes. }}"/ }}"/|check-register-writer.sh
LR178 fail closed|../../.github/workflows/pr-rules.yml|/leaves the lab register to the records lane/,/register-writer.sh/s/          set -o pipefail/          true/|check-register-writer.sh'
