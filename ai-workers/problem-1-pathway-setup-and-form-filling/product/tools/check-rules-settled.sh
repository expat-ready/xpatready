#!/usr/bin/env bash
# A348 (founder 24 Nov): rules-settled.py, the warning on a money, permission or migration PR whose body does not name the
# decision or requirement of each rule. Pass and fail case for each. US$0, no network.   bash product/tools/check-rules-settled.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/rs.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
D=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio; M=$D/prisma/migrations/20261124010000_x/migration.sql
run() { printf '%s\n' "$1" > "$T/f"; printf '%s\n' "$2" | python3 -I "$TOOLS/rules-settled.py" --files "$T/f"; echo "rc=$?"; }
warn() { o=$(run "$2" "$3"); ok "$1" "$(grep -q '^::warning' <<<"$o" && grep -q 'rc=0' <<<"$o" && grep -qF -- "$4" <<<"$o" && echo 1)" "$o"; }
okk() { o=$(run "$2" "$3"); ok "$1" "$(grep -q '^ok ' <<<"$o" && ! grep -q '::warning' <<<"$o" && grep -q 'rc=0' <<<"$o" && echo 1)" "$o"; }
okk "pass: no money, permission or migration file" "$D/web/src/pages/x.tsx" "nothing"
okk "pass: a test of money code is not money code" "$D/tests/check_money.ts" "nothing"
warn "fail: a migration with no line" "$M" "Done when: x" 'changes migration: its body has no "Rules settled:" line'
for f in platform/identity/keys.ts core.ts staff/role-grants.ts platform/firm-scope.ts; do warn "fail: $f is a permission file" "$D/api/src/$f" "x" 'changes permission'; done
for f in client-money/trust.service.ts front-office/invoices.ts money.ts sales/refund-rules.ts; do warn "fail: $f is a money file" "$D/api/src/$f" "x" 'changes money'; done
okk "pass: 'feedback' and 'feed' are not fees" "$D/api/src/ui/feedback.ts" "x"
okk "pass: one line, two rules, each cited" "$M" "Rules settled: a refund needs a second person (P-801); trust first (SA-2-1@374fb7a9)"
okk "pass: a list, bold heading, an official page and a requirement file" "$M" '**Rules settled:**
- the receipt is kept seven years: https://www.canada.ca/en/x "q" 2026-11-01
- one ledger a firm: domain/requirements-2026-11-01/SA-2.md

Other text with no citation'
warn "fail: one of two rules names nothing" "$M" 'Rules settled:
- a refund needs a second person (P-801)
- the trust balance may not go below zero' '1 of 2 rules name no decision or requirement: the trust balance'
warn "fail: the line is empty" "$M" 'Rules settled:

Done when: x' 'names no rule'
warn "fail: a line in a code fence is an example" "$M" '```
Rules settled: x (P-1)
```' 'no "Rules settled:" line'
warn "fail: prose that mentions it is not the line" "$M" 'We will add Rules settled: later P-1' 'no "Rules settled:" line'
okk "pass: none with a reason" "$M" "Rules settled: none (an index only, no rule changes)"
warn "fail: none without a reason" "$M" "Rules settled: none" 'gives no reason'
warn "the next field ends the list" "$M" 'Rules settled:
- keep both names
Item: R1.4 P-801' '1 of 1 rules'
o=$(run "" "x"); ok "fail: an empty file list is said, exit 2, never ok" "$(grep -q 'not checked' <<<"$o" && grep -q 'rc=2' <<<"$o" && echo 1)" "$o"
W="$TOOLS/../../../../.github/workflows/pr-rules.yml"
ok "pr-rules.yml runs it on the PR's own file list, and a failed read is a warning, never a pass" "$(grep -q 'rules-settled.py" --files "$RUNNER_TEMP/rs-files"' "$W" && grep -A12 'Rules settled' "$W" | grep -q 'set -o pipefail' && echo 1)"
finish
