#!/usr/bin/env bash
# review-rounds.py's tests as a guard test (check-guards.sh's mutation rows run a check-*.sh): test_review_rounds.py.
# A438 cut 3: only change-requesting rounds count; Approve rounds never do; the Lead's allowance line still works.
#   bash product/tools/check-review-rounds.sh
set -u
cd "$(dirname "$0")" && python3 -I test_review_rounds.py 2>&1 | tail -3; exit "${PIPESTATUS[0]}"
