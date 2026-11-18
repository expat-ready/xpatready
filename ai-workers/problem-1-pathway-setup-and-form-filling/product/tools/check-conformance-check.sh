#!/usr/bin/env bash
# CK-1 (founder asks A151, A154, 17 Nov): conformance-check.py passes a fixture repository built to the approved set-up
# and fails each break of it (a deny line removed, max_parallel_checks changed, a required job renamed, a master's
# version bumped without the registry, ...). The unit tests in test_conformance_check.py; no network, US$0.
# Run by check-guards.sh (guard 24: each test fails with its part of the check switched off).
#   bash product/tools/check-conformance-check.sh
set -u
python3 -I "$(dirname "$0")/test_conformance_check.py" 2>&1
