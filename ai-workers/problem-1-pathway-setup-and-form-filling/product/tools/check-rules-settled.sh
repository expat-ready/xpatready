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
okk "pass: a loose list, blank lines between bullets" "$M" 'Rules settled:

- a (P-801)

- b (A348)

Other text'
warn "fail: the second bullet of a loose list names nothing" "$M" '- **Rules settled:**
- a (P-801)

- trust may go negative' '1 of 2 rules'
warn "fail: an empty line before a bold field that cites" "$M" 'Rules settled:

**Done when:** check_x passes (P-801)' 'names no rule'
okk "pass: none with a reason, then a bold field" "$M" 'Rules settled: none (an index only; no rule changes)
**Done when:** x'
warn "fail: a rule on the next line that looks like a field" "$M" 'Rules settled: a (P-801)
Trust balance: may go below zero' '1 of 2 rules'
okk "pass: a rule wrapped to a second line" "$M" 'Rules settled:
- the receipt is kept seven years,
  by the decision P-801'
warn "fail: two rules on one bullet, one cited" "$M" 'Rules settled:
- a (P-801); trust may go negative' '1 of 2 rules'
warn "fail: an HTML comment" "$M" '<!-- x
Rules settled: example (P-801) -->' 'no "Rules settled:" line'
warn "fail: a quote" "$M" '> Rules settled: a (P-801)' 'no "Rules settled:" line'
warn "fail: a longer fence" "$M" '````
```
Rules settled: a (P-801)
````' 'no "Rules settled:" line'
for x in 'Annex A12 of the form' 'step BK-P-2' 'P-99999' 'https://example.com/canada.ca'; do warn "fail: '$x' is no decision or requirement" "$M" "Rules settled: a ($x)" '1 of 1 rules'; done
for f in platform/system-identity/guard.ts platform/audit/access/lines.ts; do warn "fail: $f is a permission file" "$D/api/src/$f" x 'changes permission'; done
okk "pass: a test beside the money code" "$D/api/src/client-money/tests/refunds.ts" x
okk "pass: a form's roles are people, not permissions" "$D/api/src/features/checkpoint/100-form-roles.ts" x

# The step of pr-rules.yml itself: its condition, and its script run as written with a stand-in gh and python3
W="$TOOLS/../../../../.github/workflows/pr-rules.yml"
awk '/names the decision or requirement of each rule/ {on = 1} on {print} on && /file list could not be read/ {exit}' "$W" > "$T/step.yml"
ok "pr-rules.yml runs the step on every PR that is not records only" "$(grep -qxF "        if: \"\${{ !cancelled() && steps.rec.outputs.records != 'yes' }}\"" "$T/step.yml" && echo 1)" "$(head -3 "$T/step.yml")"
sed -n '/run: |/,$p' "$T/step.yml" | tail -n +2 | sed -e 's/^          //' -e 's/\${{ github.repository }}/o\/r/' -e 's/\${{ github.event.pull_request.number }}/77/' > "$T/step.sh"; mkdir -p "$T/bin" "$T/tools" "$T/tmp"
cp "$TOOLS/rules-settled.py" "$T/tools/"
printf '#!/bin/sh\ncase "$*" in *repos/o/r/pulls/77/files*previous_filename*) [ -n "$DOWN" ] && exit 1; echo "$F";; *) exit 1;; esac\n' > "$T/bin/gh"; chmod +x "$T/bin/gh"
base="$T"; step() { o=$(PATH="$T/bin:$PATH" DOWN="${3:-}" F="$1" BODY="$2" RUNNER_TEMP="$T/tmp" T="$T/tools" bash "$base/step.sh" 2>&1; echo "rc=$?"); }
step "$M" x; ok "the step warns, exit 0" "$(grep -q '^::warning' <<<"$o" && grep -q 'changes migration' <<<"$o" && grep -q 'rc=0' <<<"$o" && echo 1)" "$o"
step "$M" "Rules settled: a (P-801)"; ok "the step passes a settled body" "$(grep -q '^ok ' <<<"$o" && ! grep -q '::warning' <<<"$o" && echo 1)" "$o"
step "$M" "Rules settled: a (P-801)" 1; ok "fail: a file list that cannot be read is a warning, never ok" "$(grep -q 'file list could not be read' <<<"$o" && ! grep -q '^ok' <<<"$o" && grep -q 'rc=0' <<<"$o" && echo 1)" "$o"
mv "$T/tools/rules-settled.py" "$T/tools/x"; step "$M" x; ok "fail: a check that cannot run is a warning" "$(grep -q 'could not run' <<<"$o" && grep -q 'rc=0' <<<"$o" && echo 1)" "$o"
finish
