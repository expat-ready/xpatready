#!/usr/bin/env bash
# Test of comment-filter-check.py (OS-78 (a)): main's workflows pass; planted workflows fail. No network, US$0.
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/cfilter.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
C="$TOOLS/comment-filter-check.py"
out=$(python3 -I "$C" 2>&1); ok "this repository's comment workflows all filter at the job" "$([ $? = 0 ] && echo 1)" "$out"
w() { mkdir -p "$T/$1"; printf '%s\n' "$2" > "$T/$1/x.yml"; out=$(python3 -I "$C" "$T/$1" 2>&1); r=$?; }
w a $'on:\n  issue_comment:\n    types: [created]\njobs:\n  go:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true'
ok "a comment workflow with no job filter fails, naming the job" "$([ $r = 1 ] && echo "$out" | grep -q 'job "go" runs for every PR comment' && echo 1)" "exit $r: $out"
w b $'on:\n  issue_comment:\njobs:\n  go:\n    if: >-\n      github.event.issue.pull_request &&\n      contains(github.event.comment.body, \'/run\')\n    runs-on: ubuntu-latest\n  after:\n    needs: go\n    runs-on: ubuntu-latest'
ok "a job filter on a continued line, and a job that needs it, pass" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
w c $'on:\n  issue_comment:\njobs:\n  go:\n    if: github.event.issue.pull_request\n    runs-on: ubuntu-latest'
ok "a filter that does not read the comment's text fails" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
w d $'on:\n  push:\njobs:\n  go:\n    runs-on: ubuntu-latest'
ok "no comment workflow at all: exit 1 (nothing was checked)" "$([ $r = 1 ] && echo "$out" | grep -q '0 checked' && echo 1)" "exit $r: $out"
finish
