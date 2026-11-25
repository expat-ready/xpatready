#!/usr/bin/env bash
# CK-2 (founder asks A151, A154, 17 Nov): pipeline-heartbeat.py fires each alarm (no merge, stuck queue, stalled lane,
# missing nightly, conformance failing, GitHub unreadable) on hand-made facts and stays quiet on a healthy pipeline;
# P95 waits are reported, never red; green-streak counts. test_pipeline_heartbeat.py; no network, US$0.
# Run by check-guards.sh (guard 25: each test fails with its alarm switched off).
#   bash product/tools/check-pipeline-heartbeat.sh
set -u
python3 -I "$(dirname "$0")/test_pipeline_heartbeat.py" 2>&1
