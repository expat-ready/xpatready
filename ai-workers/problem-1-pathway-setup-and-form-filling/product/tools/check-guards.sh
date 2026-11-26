#!/usr/bin/env bash
# The eight guards of 6 Nov, B134's label sweep (7 Nov), B170a's engine test PDFs (L1, 11 Nov), D3's comment trigger (P-506, 12 Nov), rule triage (guard 14) and B194's queue gate (guard 15, 16 Nov), B206's runs waiting (guard 30, 20 Nov), ENF-758's queue blocked by checks (guard 37, 20 Nov, P-758), P-789 (2)'s app view rows and running jobs (guard 36, 22 Nov), ENF-763's founder-click guard (guard 31, 20 Nov, P-763), E14's index integrity (guard 33, 21 Nov, P-772), ENF-738's constraint section (guard 29, 20 Nov), CI-SPEED-3's queue depth (CS3, 21 Nov, A254), E2's report-only PR suites (guard 35, 21 Nov, P-772), B193 part 2's Lead hooks (18-23, 16 Nov), CK-1's conformance check (guard 24) and CK-2's heartbeat (guard 25, 17 Nov), ENF-733's focus list (guard 26) and workflow lock (guard 27, 19 Nov, P-734), B204's waves (guard 28, 20 Nov, P-745) with ENF-761's under-cap ACTs (761c) (founder, ~03:00 IST: "fix it so that it becomes a hard rule and it never messes up"), each
# with its test. --mutate also proves each test fails without its guard: in a throwaway copy of the tools, the guard is
# switched off by one edit and its test must go red. Run by .github/workflows/guards.yml. US$0, no network.
#   bash product/tools/check-guards.sh [--mutate [--part i/n] [--list]]
# --part i/n (Lead 5, 23 Nov: 363 rows no longer fit one 45-minute job): the plain tests in part 1 only, and every n-th
# mutation row starting at row i, so parts 1..n together run each test and each row exactly once (check-guard-parts.sh);
# guards.yml runs the parts as a matrix. --list prints what the part would run (TEST <file>, ROW <index> <guard>), runs nothing.
set -u
mutate=0; part=1; parts=1; list=0
while [ $# -gt 0 ]; do
  case "$1" in
    --mutate) mutate=1; shift;;
    --list) list=1; shift;;
    --part) case "${2:-}" in [1-9]*/[1-9]*) part=${2%/*}; parts=${2#*/};; *) echo "check-guards: --part needs i/n with 1 <= i <= n" >&2; exit 2;; esac
            case "$part$parts" in *[!0-9]*) echo "check-guards: --part needs i/n with 1 <= i <= n" >&2; exit 2;; esac
            [ "$part" -le "$parts" ] || { echo "check-guards: --part $2: i is over n" >&2; exit 2; }; shift 2;;
    *) echo "check-guards: unknown argument $1" >&2; exit 2;;
  esac
done
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; P=ai-workers/problem-1-pathway-setup-and-form-filling
TESTS="check-current-lead.sh check-items.sh check-handover.sh check-label-guard.sh check-lane-preflight.sh check-isolated-ttl.sh check-gh-fallback.sh check-state-page.sh check-lead-cron.sh check-lead-heartbeat.sh check-label-sweep.sh check-rules-lag.sh check-push-guard-fixtures.sh check-comment-run.sh check-outside-deps-watch.sh check-rule-triage.sh check-queue-gate.sh check-lead-watch-board.sh check-known-failures.sh check-queued-push-guard.sh check-lead-read-guard.sh check-gmail-start-check.sh check-lead-act-check.sh check-wip-guard.sh check-ist-time-guard.sh check-conformance-check.sh check-pipeline-heartbeat.sh check-mergify-scopes.sh check-focus-list.sh check-workflow-lock.sh check-waves.sh check-runs-waiting.sh check-founder-click-guard.sh check-proof-read-watch.sh check-idx-integrity.sh check-image-size.sh check-queue-depth.sh check-pr-suites-job.sh check-contributing.sh check-app-view.sh check-nightly-watch.sh check-resource-claim-guard.sh check-rule-register.sh check-decision-impact.sh check-lead-upkeep.sh check-flow-constraint.sh check-lead-gap.sh check-queue-blocked.sh check-owed-watch.sh check-lead-merge.sh check-lead-read-gate.sh check-guard-parts.sh test-spd-2.sh"
TESTS="$TESTS check-cleanup-checks.sh check-cleanup-pr.sh"   # E5 (P-674 to P-677): the clean-up safety net, #2597
TESTS="$TESTS check-rules-settled.sh"   # A348: rules before review
TESTS="$TESTS check-ready-gate.sh"   # ENF-782a readiness gate, #2738
TESTS="$TESTS check-lane-cleanup.sh"   # A348: lane clean-up list
TESTS="$TESTS check-branch-sweep.sh check-queue-red.sh"   # ENF-761 parts 5+3, #2473
TESTS="$TESTS check-checks-changed.sh"   # A351 C2: checks weakened or removed
TESTS="$TESTS check-stop-check.sh"   # P-756 tune 1 stop-check, #2444
TESTS="$TESTS check-capacity-watch.sh"   # A348: capacity
TESTS="$TESTS check-own-migration-guard.sh"   # own-migration guard (#3254)
TESTS="$TESTS check-same-cause.sh"   # A351 B1: same cause twice
TESTS="$TESTS check-retry-watch.sh"   # A348: retry-only passes
TESTS="$TESTS check-merge-wake.sh"   # wake on merge
TESTS="$TESTS check-full-run-ask.sh"   # OS-06: full run on ask
TESTS="$TESTS check-startup-failures.sh"   # OS-52: runs that never started
TESTS="$TESTS check-founder-wait.sh"   # OS-18: the 🔴 founder line is an ACT each check
TESTS="$TESTS check-hang-report.sh"   # Lead 30, 24 Nov: what a hung suite waits on, no secret printed
TESTS="$TESTS check-lead-watch-speed.sh"   # Lead 26, 24 Nov: the check's reads start together, none lost
TESTS="$TESTS check-lead-watch-idle.sh"   # A334 fix 1: idle-lane alarm, night checklist, PR-only proof
TESTS="$TESTS check-proof-number.sh"   # A348: the proof number above merges
TESTS="$TESTS check-after-read-owed.sh check-migration-additive.sh"   # P-823: the Lead's after-reads owed; the migration allowlist
TESTS="$TESTS check-question-gate.sh"   # ENF-778a E-a: no Lead turn ends on an unanswered question
TESTS="$TESTS check-npm-audit-report.sh"   # P-776 npm audit
TESTS="$TESTS check-red-on-old.sh"   # A351 C1: red on the old code
# OS-85 (Lead 2, 26 Nov, "no hot spot"): the mutation rows (and any extra tests) live in one file per item,
# product/tools/guards.d/<name>.sh, sourced in name order (C locale): 000-base.sh holds every row up to OS-85, frozen; an
# item adds guards.d/OS-<n>.sh with MUT="$MUT"'<rows>' and, if it adds a test, TESTS="$TESTS <test>". No row is
# written in this file: check-guards-d.sh fails a PR that adds one here or a block to 000-base.sh.
MUT=""
for gd in $(cd "$TOOLS/guards.d" 2>/dev/null && LC_ALL=C ls -- *.sh 2>/dev/null); do . "$TOOLS/guards.d/$gd"; done
[ -n "$MUT" ] || { echo "FAIL  no mutation rows read from $TOOLS/guards.d: nothing to mutate"; exit 2; }
bad=0
if [ "$part" = 1 ]; then
for t in $TESTS check-deps-line.sh check-pr-concurrency.sh; do [ "$list" = 1 ] && { echo "TEST $t"; continue; }; bash "$TOOLS/$t" > "${TMPDIR:-/tmp}/guard-$$.log" 2>&1; r=$?; echo "$( [ $r = 0 ] && echo PASS || echo FAIL )  $t ($(tail -1 "${TMPDIR:-/tmp}/guard-$$.log"))"
  [ $r = 0 ] || { bad=1; grep '^FAIL' "${TMPDIR:-/tmp}/guard-$$.log" | sed 's/^/      /'; }; done
fi
rm -f "${TMPDIR:-/tmp}/guard-$$.log"
[ "$mutate" = 1 ] || exit $bad
[ "$list" = 1 ] || echo "--- each test without its guard (must FAIL)${parts:+ (part $part of $parts)}"
k=-1
while IFS='|' read -r g f edit t; do
  k=$((k + 1)); [ $((k % parts)) = $((part - 1)) ] || continue
  [ "$list" = 1 ] && { echo "ROW $k $g"; continue; }
  M=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$M" ] || { echo "no temp dir: nothing was checked"; exit 2; }; mkdir -p "$M/$P/product" "$M/$P/prototype/studio" "$M/.claude" "$M/.github/workflows" "$M/$P/product/qa"
  cp -R "$TOOLS" "$M/$P/product/"; cp -R "$ROOTD/$P/prototype/studio/tools" "$M/$P/prototype/studio/"
  cp "$ROOTD/$P/product/qa/CAPABILITIES.md" "$M/$P/product/qa/"; mkdir -p "$M/$P/product/design"; cp "$ROOTD/$P/product/design/waves.tsv" "$ROOTD/$P/product/design/waves.md" "$ROOTD/$P/product/design/night-checklist.json" "$M/$P/product/design/"; cp "$ROOTD/$P/product/focus-list.md" "$M/$P/product/"; cp -R "$ROOTD/.claude/skills" "$ROOTD/.claude/settings.json" "$M/.claude/"
  cp "$ROOTD/.github/workflows/"*.yml "$M/.github/workflows/"; cp "$ROOTD/.mergify.yml" "$M/"; git -C "$M" init -q   # every workflow: check-label-guard parses two
  for x in $(cd "$ROOTD" && ls packages/xfa-engine/fixtures/synthetic/*.pdf packages/xfa-engine/src/__tests__/fixtures/*.pdf 2>/dev/null); do mkdir -p "$M/$(dirname "$x")"; cp "$ROOTD/$x" "$M/$x"; done   # guard 11 needs the real bytes
  before=$(cksum < "$M/$P/$f"); sed -i.bak "$edit" "$M/$P/$f"; rm -f "$M/$P/$f.bak"
  sh=bash; head -1 "$M/$P/$f" | grep -q zsh && sh=zsh; case "$f" in *.yml|*.txt) sh=true;; *.py) sh=pyparse;; *.js|*.mjs) sh=jsparse;; esac   # a .yml or .txt list is read by its test; a .py by ast (B192)
  if [ "$before" = "$(cksum < "$M/$P/$f")" ]; then echo "FAIL  guard $g: the edit '$edit' changed nothing in $f"; bad=1
  elif ! $sh -n "$M/$P/$f" 2>"$M/log"; then echo "FAIL  guard $g: the edit '$edit' breaks $f's syntax, so its test failing proves nothing ($(head -1 "$M/log"))"; bad=1
  elif bash "$M/$P/product/tools/$t" > "$M/log" 2>&1; then echo "FAIL  guard $g: $t still passes with the guard off"; bad=1
  else echo "PASS  guard $g off → $t fails ($(tail -1 "$M/log"); first: $(grep -m1 '^FAIL' "$M/log" | cut -c7-90))"; fi
  rm -rf "$M"
done <<< "$MUT"
exit $bad
