#!/bin/bash
# Where the Lead's records live (private split, design/private-split-plan-2026-11-27.md, PS-1b). STATE.md, history/,
# lanes/, inbox/, reports/, ops/, RESUME-ON-NEW-ACCOUNT.md and SECOND-MAC.md move to github.com/expat-ready/private,
# folder xpatready/product/, in the working copy private-sync.sh already uses. Prints the folder that holds them:
#   1. $XR_RECORDS when set (tests, or a Lead who keeps the clone elsewhere);
#   2. ${PRIVATE_HOME_DIR:-$TMPDIR/private-home}/xpatready/product when it holds STATE.md (the Lead's private copy);
#   3. this copy's product/ while it still holds STATE.md (before the files leave xpatready, or after a rollback).
# --private: only 1 or 2, so a check meant for the private copy never mistakes the in-tree files for it.
# Exit 1 (prints nothing) when no folder qualifies: CI and builder copies once the files have left.
# Usage: bash product/tools/records-dir.sh [--private]   Test: check-records-dir.sh.
priv=0; [ "${1:-}" = --private ] && priv=1
if [ -n "${XR_RECORDS:-}" ]; then [ -d "$XR_RECORDS" ] && { echo "$XR_RECORDS"; exit 0; }; exit 1; fi
h="${PRIVATE_HOME_DIR:-${TMPDIR:-/tmp}/private-home}"; h="${h%/}/xpatready/product"
[ -f "$h/STATE.md" ] && { echo "$h"; exit 0; }
[ "$priv" = 1 ] && exit 1
ph="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ph/STATE.md" ] && { echo "$ph"; exit 0; }
exit 1
