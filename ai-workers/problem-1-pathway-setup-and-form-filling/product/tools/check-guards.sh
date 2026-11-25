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
TESTS="$TESTS check-records-pr.sh"   # OS-15: the records PR in one command
TESTS="$TESTS check-founder-wait.sh"   # OS-18: the 🔴 founder line is an ACT each check
TESTS="$TESTS check-hang-report.sh"   # Lead 30, 24 Nov: what a hung suite waits on, no secret printed
TESTS="$TESTS check-lead-watch-speed.sh"   # Lead 26, 24 Nov: the check's reads start together, none lost
TESTS="$TESTS check-lead-watch-idle.sh"   # A334 fix 1: idle-lane alarm, night checklist, PR-only proof
TESTS="$TESTS check-proof-number.sh"   # A348: the proof number above merges
TESTS="$TESTS check-question-gate.sh"   # ENF-778a E-a: no Lead turn ends on an unanswered question
TESTS="$TESTS check-npm-audit-report.sh"   # P-776 npm audit
TESTS="$TESTS check-red-on-old.sh"   # A351 C1: red on the old code
bad=0
if [ "$part" = 1 ]; then
for t in $TESTS check-deps-line.sh check-pr-concurrency.sh; do [ "$list" = 1 ] && { echo "TEST $t"; continue; }; bash "$TOOLS/$t" > "${TMPDIR:-/tmp}/guard-$$.log" 2>&1; r=$?; echo "$( [ $r = 0 ] && echo PASS || echo FAIL )  $t ($(tail -1 "${TMPDIR:-/tmp}/guard-$$.log"))"
  [ $r = 0 ] || { bad=1; grep '^FAIL' "${TMPDIR:-/tmp}/guard-$$.log" | sed 's/^/      /'; }; done
fi
rm -f "${TMPDIR:-/tmp}/guard-$$.log"
[ "$mutate" = 1 ] || exit $bad
# guard | file the edit goes in | sed edit that switches the guard off (no | or ' in it: .. stands for || and . for ') | the test that must then fail
# Rows 36 deadlock and 36 wfname add a line with GNU sed's \n in the replacement (CI runs on ubuntu; BSD sed would not).
MUT='1|product/tools/check-docs.sh|/CURRENT LEAD: STATE.md has/d|check-current-lead.sh
2|product/tools/label-guard.sh|s/^# No review for the head.*/exit 0/|check-label-guard.sh
2 walk|product/tools/label-guard.sh|s/^  c=\$next; merges=.*/  exit 0/|check-label-guard.sh
2 who|product/tools/label-guard.sh|s/^team=.*/team=true/|check-label-guard.sh
A351 c1 app|product/tools/red-on-old.py|s/ + (" ".join(all_\[:MAX\]) if app else "")/ + " ".join(all_[:MAX])/|check-red-on-old.sh
A351 c1 note|product/tools/red-on-old.py|s/ and not NOTE.match(l\[1:\])//|check-red-on-old.sh
A351 c1 max|product/tools/red-on-old.py|s/MAX = 4/MAX = 40/|check-red-on-old.sh
A351 c1 ci|product/tools/red-on-old.py|s/^    if os.environ.get("GITHUB_ACTIONS") != "true":/    if False:/|check-red-on-old.sh
A351 c1 gone|product/tools/red-on-old.py|s/^            git("rm", "-rq", "--", p)/            pass/|check-red-on-old.sh
A351 c1 green|product/tools/red-on-old.py|s/^    if red or load:/    if True:/|check-red-on-old.sh
A351 c1 reason|product/tools/red-on-old.py|s/^    elif green and y:/    elif green:/|check-red-on-old.sh
A351 c1 none|product/tools/red-on-old.py|s/ or (r == "FAIL" and SETUP.search(w)) else/ else/|check-red-on-old.sh
A351 c1 load|product/tools/red-on-old.py|s/ load if LOAD.search(w) else red$/ red/|check-red-on-old.sh
A351 c1 once|../../.github/workflows/red-on-old.yml|s/types: \[opened, ready_for_review\]/types: [opened, synchronize]/|check-red-on-old.sh
A351 c1 red check|../../.github/workflows/red-on-old.yml|/^      - id: old$/,/run:/s/^        continue-on-error: true$/        continue-on-error: false/|check-red-on-old.sh
A351 c1 base|../../.github/workflows/red-on-old.yml|s/old --base HEAD^1/old --base HEAD/|check-red-on-old.sh
A351 c1 only|../../.github/workflows/red-on-old.yml|s/ --only "\$SUITES"//|check-red-on-old.sh
A351 c1 depth|../../.github/workflows/red-on-old.yml|s/fetch-depth: 0/fetch-depth: 1/|check-red-on-old.sh
A351 c1 batch|../../.github/workflows/red-on-old.yml|s/^    if: .*/    if: true/|check-red-on-old.sh
A351 c1 ports|product/tools/red-on-old.py|s/"packages", "ports", /"packages", /|check-red-on-old.sh
2 labeled|../../.github/workflows/label-guard.yml|s/types: \[synchronize, labeled, opened\]/types: [synchronize, opened]/|check-label-guard.sh
2 after|../../.github/workflows/label-guard.yml|s/^\( *AFTER: \).*/\1${{ github.event.after }}/|check-label-guard.sh
2 full|product/tools/label-guard.sh|s/^    \[ "\$p" = 1 \] \&\& break/    true/|check-label-guard.sh
2 records|product/tools/label-guard.sh|s/^records_pr() {  #/records_pr() { return 0; }\n_off() {  #/|check-label-guard.sh
2 relabel|../../.github/workflows/label-guard.yml|/^ *LABELED: /d|check-label-guard.sh
2 reviewers|../../.github/workflows/label-guard.yml|/^          REVIEWERS: /{x;s/^/x/;/^x$/{x;d;};x;}|check-label-guard.sh
3|product/tools/lane-preflight.sh|/under ${min} GB;/d|check-lane-preflight.sh
3 touch|product/tools/lane-preflight.sh|s/ python3 -I "\$DIR\/touch-overlap.py" 2>\&1)/ cat >\/dev\/null)/|check-touch-overlap.sh
P776 count|product/tools/npm-audit-report.py|s/^    if len(v) != c\["total"\]:/    if False:/|check-npm-audit-report.sh
P776 error|product/tools/npm-audit-report.py|s/ or e or "metadata" not in d:/ or "metadata" not in d:/|check-npm-audit-report.sh
P776 new|product/tools/npm-audit-report.py|s/ or ORDER.index(s) < ORDER.index(w\[k\])}/}/|check-npm-audit-report.sh
P776 base|product/tools/npm-audit-report.py|s/^            line += "; the base could not be read"; warn = .*/            pass/|check-npm-audit-report.sh
P776 safe|product/tools/npm-audit-report.py|s/.replace("::", ": :")//|check-npm-audit-report.sh
P776 order|product/tools/npm-audit-report.py|s/for k, _ in order\[:5\]/for k in list(new)[:5]/|check-npm-audit-report.sh
P776 folder|../../.github/workflows/studio-audit.yml|s/npm audit --prefix "\$RUNNER_TEMP.\$v"/npm audit --prefix "$S"/|check-npm-audit-report.sh
P776 show|../../.github/workflows/studio-audit.yml|s/> "\$RUNNER_TEMP.base.\$f" .. true$/> "$RUNNER_TEMP\/base\/$f"/|check-npm-audit-report.sh
P776 depth|../../.github/workflows/studio-audit.yml|s/fetch-depth: 2/fetch-depth: 1/|check-npm-audit-report.sh
P776 block|../../.github/workflows/studio-audit.yml|/^      - id: ci$/,/run:/s/^        continue-on-error: true$/        continue-on-error: false/|check-npm-audit-report.sh
P776 scripts|../../.github/workflows/studio-audit.yml|s/ --ignore-scripts//|check-npm-audit-report.sh
P776 token|../../.github/workflows/studio-audit.yml|s/permissions: { contents: read }/permissions: { contents: write }/|check-npm-audit-report.sh
3 hit|product/tools/touch-overlap.py|s/^            if paths:/            if False:/|check-touch-overlap.sh
3 closed|product/tools/touch-overlap.py|s/^        return 2$/        return 0/|check-touch-overlap.sh
A348 rules cite|product/tools/rules-settled.py|s/^        bad = .*/        bad = []/|check-rules-settled.sh
A348 rules none|product/tools/rules-settled.py|s/^    if r is None:/    if False:/|check-rules-settled.sh
A348 rules kinds|product/tools/rules-settled.py|s/^    ("permission", /    ("permission", re.compile("^none$")), ("x", /|check-rules-settled.sh
A348 rules fence|product/tools/rules-settled.py|s/^        if fence:/        if False:/|check-rules-settled.sh
A348 rules gap|product/tools/rules-settled.py|s/^        elif not BULLET.match(l) and (FIELD.*/        elif False:/|check-rules-settled.sh
A348 rules html|product/tools/rules-settled.py|s/^    body = re.sub(.*/    pass/|check-rules-settled.sh
A348 rules wired|../../.github/workflows/pr-rules.yml|s/^\( *\)printf .*rules-settled.py" --files.*/\1true/|check-rules-settled.sh
A348 rules unread|../../.github/workflows/pr-rules.yml|s/else echo "::warning title=Rules settled (A348)::the PR.*/else echo ok; fi/|check-rules-settled.sh
3 own|product/tools/touch-overlap.py|s/^        if n in own:/        if False:/|check-touch-overlap.sh
A351 b1 two|product/tools/same-cause.py|s/ if len({r\["run"\] for r in rs}) > 1}/}/|check-same-cause.sh
A351 b1 once|product/tools/same-cause.py|s/^        if k not in fired:/        if len(rs) > 1:/|check-same-cause.sh
A351 b1 words|product/tools/same-cause.py|s/by.setdefault(f"{s}.*{w}"/by.setdefault(s/|check-same-cause.sh
A351 b1 fail row|product/tools/same-cause.py|s/(FAIL.failed twice)/(failed twice)/|check-same-cause.sh
A351 b1 first try|product/tools/same-cause.py|s/^        if what == "failed twice" and .*/        if False:/|check-same-cause.sh
A351 b1 not retried|product/tools/same-cause.py|s/^        w = re.split(.*/        w = why/|check-same-cause.sh
A351 b1 named|product/tools/same-cause.py|s/ if NAMED.search(w) else ""$//|check-same-cause.sh
A351 b1 errors|product/tools/same-cause.py|s/^NAMED = .*/NAMED = re.compile(r"FAIL +")/|check-same-cause.sh
A351 b1 ids|product/tools/same-cause.py|s/ID.sub("#", w.strip())/w.strip()/|check-same-cause.sh
A351 b1 12h|product/tools/same-cause.py|s/ if r.get("end", "9") >= since}/}/|check-same-cause.sh
A351 b1 forget|product/tools/same-cause.py|s/^    fired = .*/    fired = dict(st["fired"])/|check-same-cause.sh
A351 b1 whole|product/tools/same-cause.py|s/^        if not missing:/        if True:/|check-same-cause.sh
A351 b1 left|product/tools/same-cause.py|s/^    if left or unread:/    if False:/|check-same-cause.sh
A351 b1 unread|product/tools/same-cause.py|s/^            unread += 1; continue/            continue/|check-same-cause.sh
A351 b1 blank|product/tools/same-cause.py|s/^    if blank:/    if False:/|check-same-cause.sh
A351 b1 lost|product/tools/same-cause.py|s/^    for b in bad\[:3\]:/    for b in []:/|check-same-cause.sh
A351 b1 memory|product/tools/same-cause.py|s/^    if why:/    if False:/|check-same-cause.sh
A351 b1 inside|product/tools/same-cause.py|s/ for r in st\["runs"\].values())$/ for r in [])/|check-same-cause.sh
A351 b1 batch|product/tools/same-cause.py|s/ if w\["head_branch"\].startswith("mergify.")\]$/]/|check-same-cause.sh
A351 b1 green|product/tools/same-cause.py|s/^            if st\["ran"\]\[k\]:/            if True:/|check-same-cause.sh
A351 b1 pages|product/tools/same-cause.py|s/^    for n in range(1, 11):/    for n in range(1, 2):/|check-same-cause.sh
A351 b1 rerun|product/tools/same-cause.py|s/ and r.get("end") == w\["updated_at"\]:/:/|check-same-cause.sh
A351 b1 gone|product/tools/same-cause.py|s/^    st\["runs"\] = {k: r for k, r in st\["runs"\].items() if k in .*/    pass/|check-same-cause.sh
A351 b1 nopr|product/tools/same-cause.py|s/^        raise RuntimeError(f"no pull request.*/        p = [{"number": 0, "title": "", "body": ""}]/|check-same-cause.sh
A351 b1 wired|product/tools/lead-watch.sh|s/^sc=/# sc=/|check-same-cause.sh
A351 b1 ran|product/tools/lead-watch.sh|/same-cause.py did not run/d|check-same-cause.sh
3 dot|product/tools/touch-overlap.py|s/re.sub(r"^(\\.\/)+", "", /(/|check-touch-overlap.sh
3 run|product/tools/check-lane-preflight.sh|/check-touch-overlap.sh" 2>\&1)/d|check-touch-overlap.sh
4 ttl|prototype/studio/tools/isolated.sh|s/\$(( TTL \* \${ISOLATED_TTL_UNIT:-60} ))/999999/|check-isolated-ttl.sh
W24 all|product/tools/merge-wake.py|s/any(x not in merged for x in w)/all(x not in merged for x in w)/|check-merge-wake.sh
W24 holds|product/tools/merge-wake.py|s/^        if has_all(.*/        if False:/|check-merge-wake.sh
W24 lost|product/tools/merge-wake.py|s/^        if lost:/        if False:/|check-merge-wake.sh
W24 line|product/tools/merge-wake.py|s/if ws and all(got) and len(ws) <= MANY:/if ws and any(got):/|check-merge-wake.sh
W24 fence|product/tools/merge-wake.py|s/^            fence = f.group(1); continue/            pass/|check-merge-wake.sh
W24 late|product/tools/merge-wake.py|s/t = max(merged/t = min(merged/|check-merge-wake.sh
W24 lane|product/tools/merge-wake.py|s/got = by\["branch"\] or by\["number"\]/got = by["number"] or by["branch"]/|check-merge-wake.sh
W24 empty|product/tools/merge-wake.py|s/ or not prs:/:/|check-merge-wake.sh
W24 queued|product/tools/merge-wake.py|s/^        if labels \& .*/        if False:/|check-merge-wake.sh
W24 clean|product/tools/merge-wake.py|s/^    s = re.sub(r"\[.x00.*/    s = str(s)/|check-merge-wake.sh
W24 unread|product/tools/merge-wake.py|s/^    if unread:/    if False:/|check-merge-wake.sh
W24 limit|product/tools/merge-wake.py|s/^    if len(prs) >= LIMIT:/    if False:/|check-merge-wake.sh
W24 html|product/tools/merge-wake.py|s/in re.sub(r"<!--.*flags=re.S)/in (body or "").replace("\\r", "")/|check-merge-wake.sh
W24 many|product/tools/merge-wake.py|s/^        if len(w) > MANY: .*/        if False:/|check-merge-wake.sh
W24 wired|product/tools/lead-watch.sh|s/^mw=/# mw=/|check-merge-wake.sh
W24 ran|product/tools/lead-watch.sh|/merge-wake.py did not run/d|check-merge-wake.sh
W24 once|product/tools/merge-wake.py|s/^            if k in mem:/            if False:/|check-merge-wake.sh
W24 unwritable|product/tools/merge-wake.py|s/o.post = False; print(f"ACT   wake: memory {clean/print(f"ACT   wake: memory {clean/|check-merge-wake.sh
W24 cap|product/tools/merge-wake.py|s/if posted >= POSTS:/if False:/|check-merge-wake.sh
4 cap|prototype/studio/tools/isolated.sh|s/COPY_CAP:-4} ))/COPY_CAP:-99} ))/|check-isolated-ttl.sh
A351 c2 lines|product/tools/checks-changed.py|s/^        if left:/        if False:/|check-checks-changed.sh
A351 c2 moved|product/tools/checks-changed.py|s/^            if to and (re.search.*/            if False:/|check-checks-changed.sh
A351 c2 wrap|product/tools/checks-changed.py|s/ or words(old) == words(nw):/:/|check-checks-changed.sh
A351 c2 off|product/tools/checks-changed.py|s/^            if OFF.search(l) and .*/            if False:/|check-checks-changed.sh
A351 c2 lists|product/tools/checks-changed.py|s/^                if more:/                if False:/|check-checks-changed.sh
A351 c2 ledger|product/tools/checks-changed.py|s/^        if path == LEDGER:/        if False:/|check-checks-changed.sh
A351 c2 gone|product/tools/checks-changed.py|s/^            if not ok:/            if False:/|check-checks-changed.sh
A351 c2 place|product/tools/checks-changed.py|s/ok = to and bool(RUN.*/ok = to/|check-checks-changed.sh
A351 c2 check|product/tools/checks-changed.py|s/^    elif not c + len(gone).*/    elif True:/|check-checks-changed.sh
A351 c2 reason|product/tools/checks-changed.py|s/^    if why:/    if True:/|check-checks-changed.sh
A351 c2 window|product/tools/checks-changed.py|s/s = max(0, k - 60)/s = 0/|check-checks-changed.sh
A351 c2 text|product/tools/checks-changed.py|s/ "--text",//|check-checks-changed.sh
A351 c2 moved to|product/tools/checks-changed.py|s/({"\*"} if RUN.match(path) else set())/{"*"}/|check-checks-changed.sh
A351 c2 like|product/tools/checks-changed.py|s/ and not PLAIN.match(l)$/ and "ok(" in l/|check-checks-changed.sh
A351 c2 pair|product/tools/checks-changed.py|s/best = max(pool, key=.*/best = pool[0] if pool else None/|check-checks-changed.sh
A351 c2 safe|product/tools/checks-changed.py|s/.replace("::", .*replace("##\[", "[^"]*")//|check-checks-changed.sh
A351 c2 limit|../../.github/workflows/pr-rules.yml|s/timeout 30 python3 -I "\$T.checks-changed/python3 -I "$T\/checks-changed/|check-checks-changed.sh
A351 c2 wired|../../.github/workflows/pr-rules.yml|s/^\( *\)run: printf .*checks-changed.py.*/\1run: true/|check-checks-changed.sh
5|product/tools/factory-board.sh|s/; gh() { bash "\$TOOLS\/gh.sh" "\$@"; }//|check-gh-fallback.sh
A348 clean all|product/tools/lane-cleanup.py|s/all(p in merged for p in prs)/any(p in merged for p in prs)/|check-lane-cleanup.sh
A348 clean dirty|product/tools/lane-cleanup.py|s/ and not git(path, "status", "--porcelain").strip()//|check-lane-cleanup.sh
A348 clean ahead|product/tools/lane-cleanup.py|s/ and not git(repo, "rev-list".*strip() and/ and/|check-lane-cleanup.sh
A348 clean pr|product/tools/lane-cleanup.py|s/clean = prs and not git/clean = not git/|check-lane-cleanup.sh
A348 clean status|product/tools/lane-cleanup.py|s/ or m.group(3) != "completed"//|check-lane-cleanup.sh
A348 clean idle|product/tools/lane-cleanup.py|s/ or int(idle\[-1\]) < IDLE_MIN//|check-lane-cleanup.sh
A348 clean need|product/tools/lane-cleanup.py|s/ or rest.split(.*)\[0\] != "none"//|check-lane-cleanup.sh
A348 clean link|product/tools/lane-cleanup.py|s/^PR = .*/PR = re.compile(r"#(\\d{2,})")/|check-lane-cleanup.sh
A348 clean stale|product/tools/lane-cleanup.py|s/^    if not 0 <= age <= STALE_MIN:/    if False:/|check-lane-cleanup.sh
A348 clean whole|product/tools/lane-cleanup.py|s/^    if "UNREADABLE" in head .*/    if False:/|check-lane-cleanup.sh
A348 clean lock|product/tools/lane-cleanup.py|s/"git", "--no-optional-locks", /"git", /|check-lane-cleanup.sh
A348 clean me|product/tools/lane-cleanup.py|s/ or os.path.realpath(path) == me//|check-lane-cleanup.sh
A348 clean wired|product/tools/lead-watch.sh|s/^cl=/# cl=/|check-lane-cleanup.sh
6|product/tools/check-docs.sh|/STATE TOO BIG/d|check-state-page.sh
A348 cap standbys|product/tools/capacity-watch.py|s/^    elif int(v) < MIN_STANDBYS:/    elif False:/|check-capacity-watch.sh
A348 cap given|product/tools/capacity-watch.py|s/^    if not (v.isascii.*/    if False:/|check-capacity-watch.sh
A348 cap disk|product/tools/capacity-watch.py|s/^    if gb < START_GB:/    if False:/|check-capacity-watch.sh
A348 cap remote|product/tools/capacity-watch.py|s/^    miss = len(fs) - .*/    miss = 0/|check-capacity-watch.sh
A348 cap odd|product/tools/capacity-watch.py|s/miss = len(fs) - len(plain) + /miss = /|check-capacity-watch.sh
A348 cap dead|product/tools/capacity-watch.py|s/"rev-list", "--objects", "--stdin"/"rev-list", "--objects", "--remotes=origin", "--stdin"/|check-capacity-watch.sh
A348 cap local|product/tools/capacity-watch.py|s/"rev-list", "--objects", "--stdin"/"rev-list", "--objects", "--branches", "--stdin"/|check-capacity-watch.sh
A348 cap copy|product/tools/capacity-watch.py|s/^    if any(os.path.basename(p) == ".git".*/    if False:/|check-capacity-watch.sh
A348 cap whole|product/tools/capacity-watch.py|s/os.walk(d, onerror=stop)/os.walk(d)/|check-capacity-watch.sh
A348 cap age|product/tools/capacity-watch.py|s/ or now - newest < o.age.*/:/|check-capacity-watch.sh
A348 cap ctime|product/tools/capacity-watch.py|s/st.st_mtime, st.st_ctime/st.st_mtime/|check-capacity-watch.sh
A348 cap cut|product/tools/capacity-watch.py|s/^    if c\["cut"\]:/    if False:/|check-capacity-watch.sh
A348 cap cr|product/tools/capacity-watch.py|s/and not set(.*) & set(p)\]/]/|check-capacity-watch.sh
A348 cap dark|product/tools/capacity-watch.py|s/^    if c.get("dark"):/    if False:/|check-capacity-watch.sh
A348 cap wired|product/tools/lead-watch.sh|s/^cp=/# cp=/|check-capacity-watch.sh
7|product/tools/check-docs.sh|s/if m > 30:/if False:/|check-state-page.sh
7 mine|product/tools/check-docs.sh|s/^  mine=1; c=""$/  mine=0; c=""/|check-state-page.sh
7 read|product/tools/check-docs.sh|s/^  if \[ -z "\$u" \]; then msg=/  if false; then msg=/|check-state-page.sh
7 tens|product/tools/check-docs.sh|s/\[0-9\]{2}:\[0-5\]\[0-9x\]) IST/[0-9]{2}:[0-5][0-9]) IST/|check-state-page.sh
7 base|product/tools/check-docs.sh|s/{ mine=0; c=/{ mine=1; c=/|check-state-page.sh
7 merges|product/tools/check-docs.sh|s/ git log -1 --no-merges --format=%ct "\$b..HEAD"/ git log -1 --format=%ct "$b..HEAD"/|check-state-page.sh
8|product/tools/lead-check-guard.sh|s/^\[ -z "\$why" \] \&\& exit 0/exit 0/|check-lead-cron.sh
9|product/tools/label-sweep.sh|s/^  if \[ "\$who" != "\$BOT" \]; then/  if true; then/|check-label-sweep.sh
9 sched|../../.github/workflows/label-guard.yml|/cron: "\*\/10 \* \* \* \*"/d|check-label-sweep.sh
9 off|product/tools/label-sweep.sh|s/was already off"; continue; }/was already off"; }/|check-label-sweep.sh
9 on|product/tools/label-sweep.sh|s/ = false \] / != x ] /|check-label-sweep.sh
9 left|product/tools/label-sweep.sh|s/left=\(.*\)labels") \&\& /left=\1labels"); left=${left:-[]}; /|check-label-sweep.sh
9 queued|../../.github/workflows/label-guard.yml|/event_name == .schedule./s/ .. (github.event.action == .labeled. \&\& github.event.label.name == .queued.)//|check-label-sweep.sh
9 guardq|../../.github/workflows/label-guard.yml|/review: approved.) .. (github.event.action/s/ .. github.event.label.name == .queued.)"/)"/|check-label-guard.sh
9 batch|../../.github/workflows/label-guard.yml|s/types: \[synchronize, labeled, opened\]/types: [synchronize, labeled]/|check-label-sweep.sh
9 ci|../../.github/workflows/label-guard.yml|/    workflows: \[ci\]/d|check-label-sweep.sh
9 reviewers|../../.github/workflows/label-guard.yml|/          REVIEWERS: \${{ vars.REVIEWERS }}/d|check-label-sweep.sh
9 dispatch|../../.github/workflows/label-guard.yml|s/ github.event_name == .workflow_dispatch. ..//|check-label-sweep.sh
10|product/tools/check-docs.sh|s/-gt 3 \]/-gt 999 ]/|check-rules-lag.sh
11|product/tools/push-guard.sh|s/^\( *\)\[ "\$h" = "\$want" \] \(..\)/\1true \2/|check-push-guard-fixtures.sh
11 records|product/tools/check-stale-paths.sh|/prototype\/\*-manifest\*.sha256/d|check-cleanup-checks.sh
12 who|../../.github/workflows/comment-run.yml|s/OWNER.MEMBER.COLLABORATOR) ;;/*) ;;/|check-comment-run.sh
12 if|../../.github/workflows/comment-run.yml|s/ \&\& contains(fromJSON([^)]*), github.event.comment.author_association)//|check-comment-run.sh
12 pr|../../.github/workflows/comment-run.yml|s/IS_PR" != yes/IS_PR" = never/|check-comment-run.sh
12 env|../../.github/workflows/comment-run.yml|s/line=\${BODY%%/BODY="${{ github.event.comment.body }}"; line=${BODY%%/|check-comment-run.sh
12 perm|../../.github/workflows/comment-run.yml|s/^  pull-requests: write/  pull-requests: write\n  contents: write/|check-comment-run.sh
12 caps|../../.github/workflows/comment-run.yml|s/( C\[1-9\]\[0-9\]?\\.\[1-9\]\[0-9\]?){1,8})/( C[0-9]{1,3}\\.[0-9]{1,3}){1,8})/|check-comment-run.sh
12 fork|../../.github/workflows/comment-run.yml|s/select(.head_repository.full_name == env.HREPO and .head_branch == env.HREF)/select(true)/|check-comment-run.sh
12 queue|../../.github/workflows/comment-run.yml|s/^jobs:/concurrency: { group: x, cancel-in-progress: false }\njobs:/|check-comment-run.sh
12 link|../../.github/workflows/comment-run.yml|s/select(.display_title == "nightly · " + env.TAG)/select(true)/|check-comment-run.sh
12 data|../../.github/workflows/comment-run.yml|s/( (six.checkpoint))?\$/( ([a-z]+))?$/|check-comment-run.sh
12 recheck|../../.github/workflows/comment-run.yml|s/^\( *\)\[\[ "\$CAPS" =~ .*$/\1true/|check-comment-run.sh
12 failed|../../.github/workflows/comment-run.yml|s/failure.timed_out.cancelled) ;;/*) ;;/|check-comment-run.sh
12 full who|../../.github/workflows/comment-run.yml|s/"\$line" = "\/run full"/"$line" == "\/run full"*/|check-comment-run.sh
12 full fork|../../.github/workflows/comment-run.yml|s/if \[ "\$hrepo" != "\$REPO" \]; then/if false; then/|check-comment-run.sh
12 full ref|../../.github/workflows/comment-run.yml|s/ci.yml\/dispatches" -f ref=main -f "inputs\[pr\]/ci.yml\/dispatches" -f ref="$head" -f "inputs[pr]/|check-comment-run.sh
12 full once|../../.github/workflows/comment-run.yml|s/if \[ "\$status" != completed \]; then reply "a full run/if false; then reply "a full run/|check-comment-run.sh
12 full reviewed|../../.github/workflows/comment-run.yml|s/if ! grep -qx .\[1-9\]\[0-9\]\*. <<< "\$ok"; then/if false; then/|check-comment-run.sh
12 full reviewer|../../.github/workflows/comment-run.yml|s/select(.user.login as \$l . (env.WHO . split(" ")) . index(\$l)) . select(.author_association/select(.author_association/|check-comment-run.sh
12 full names|../../.github/workflows/comment-run.yml|s/ . tr -cd .A-Za-z0-9 ().,_\\n-. . cut -c1-120/ /|check-comment-run.sh
13 start|product/tools/outside-deps-watch.py|s/min(sd).date() <= now.date()/False/|check-outside-deps-watch.sh
13 stuck|product/tools/outside-deps-watch.py|s/> timedelta(hours=48)/> timedelta(hours=9999)/|check-outside-deps-watch.sh
13 fallback|product/tools/outside-deps-watch.py|s/if not fb.strip() or/if False and/|check-outside-deps-watch.sh
13 decision|product/tools/outside-deps-watch.py|s/if not done and dd and/if False and/|check-outside-deps-watch.sh
14|product/tools/check-docs.sh|s/for M in "\$PH"\/rules\/rule-id-map-\*\.tsv; do/for M in; do/|check-rule-triage.sh
14 crash|product/tools/check-docs.sh|s/ .. echo "RULE MAP: the check of.*$//|check-rule-triage.sh
15 approve|product/tools/queue-gate.sh|s/+\$head\\b"/+"/|check-queue-gate.sh
15 sha|product/tools/queue-gate.sh|s/ . grep .\[0-9\]. . grep .\[a-f\]./ /|check-queue-gate.sh
15 who|product/tools/queue-gate.sh|s/select((.user.login as \$l . \$who . index(\$l)) and/select(true and/|check-queue-gate.sh
15 paths|product/tools/queue-gate.sh|s/^  \[ -z "\$bad" \]/  true/|check-queue-gate.sh
15 ci|product/tools/queue-gate.sh|s/^  ci; \[ "\$ci_state" = success \]/  ci; true/|check-queue-gate.sh
15 fresh|product/tools/queue-gate.sh|s/^  \[ -n "\$hit" \]/  false/|check-queue-gate.sh
15 queued|product/tools/queue-gate.sh|s/^  has queued .. /  false \&\& /|check-queue-gate.sh
15 sweep|product/tools/label-sweep.sh|s/^    if \[ "\$g" = 0 \]; then echo/    if false; then echo/|check-label-sweep.sh
15 queue|../../.mergify.yml|/check-success = queue-fresh/d|check-queue-gate.sh
15 pending|product/tools/queue-gate.sh|s/^  has "\$LABEL" .. \[ "\${LABELLING:-}" = 1 \]/  true/|check-queue-gate.sh
15 order|product/tools/queue-gate.sh|s/^  LABELLING=1 fresh .. return 2; did_fresh=1/  did_fresh=0/|check-queue-gate.sh
15 time|product/tools/queue-gate.sh|s/\[\[ "\$ts" > "\$run_started" \]\] .. continue/continue/|check-queue-gate.sh
15 shared|product/tools/queue-gate.sh|s/^    if \[ -n "\$both" \]; then/    if false; then/|check-queue-gate.sh
15 verdict|product/tools/queue-gate.sh|s/^    \[ "\$keep" = 1 \] .. last=\$l; done/    last=$l; done/|check-queue-gate.sh
15 comment|../../.github/workflows/queue-gate.yml|/comment.author_association/d|check-queue-gate.sh
15 dispatch|product/tools/queue-gate.sh|s/schedule.workflow_dispatch)/schedule)/|check-queue-gate.sh
15 gatewd|../../.github/workflows/queue-gate.yml|s/ .. github.event_name == .workflow_dispatch.$//|check-queue-gate.sh
15 full head|product/tools/queue-gate.sh|s/select(.title == \$t)/select(true)/|check-queue-gate.sh
15 full green|product/tools/queue-gate.sh|s/if \[ "\$st \$co" = "completed success" \]; then/if true; then/|check-queue-gate.sh
15 full main|product/tools/queue-gate.sh|s/^      grep -qx "\$sha" "\$H.m" .. continue/      true/|check-queue-gate.sh
15 full chain|product/tools/queue-gate.sh|s/git rev-list --first-parent "\$MAIN_REF" > /git rev-list "$MAIN_REF" > /|check-queue-gate.sh
15 full event|product/tools/queue-gate.sh|s/select(.event == "workflow_dispatch" and /select(/|check-queue-gate.sh
15 full branch|product/tools/queue-gate.sh|s/and .head_branch == "main" and/and/|check-queue-gate.sh
15 full file|product/tools/queue-gate.sh|s/ and ((.path \/\/ "") . split("@")\[0\]) == \$wf//|check-queue-gate.sh
15 full repo|product/tools/queue-gate.sh|s/and .head_repository.full_name == \$r)\( . {id, status\)/and true)\1/|check-queue-gate.sh
15 full records|product/tools/queue-gate.sh|s/^  records \&\& return 0/  true \&\& return 0/|check-queue-gate.sh
15 full reclabel|product/tools/queue-gate.sh|s/^records() { has records \&\& /records() { /|check-queue-gate.sh
15 full recfiles|product/tools/queue-gate.sh|s/^records() { has records \&\& .*/records() { has records; }/|check-queue-gate.sh
15 full unread|product/tools/queue-gate.sh|s/ \[ "\${full_state:-}" = unread \] \&\& exit 3; exit 1;;/ exit 1;;/|check-queue-gate.sh
15 full sweep3|product/tools/label-sweep.sh|s/^    if \[ "\$g" = 3 \]; then/    if false; then/|check-label-sweep.sh
15 full nottested|../../.github/workflows/ci.yml|s/, FULL_PR: "\${{ inputs.pr }}", GATE_B_NOT_TESTED: "[^"]*" }/, FULL_PR: "${{ inputs.pr }}" }/|check-queue-gate.sh
15 batch only|product/tools/queue-gate.sh|s/(map(select(. != "ci")) . if length > 0 then . else empty end) \/\/ ./map(select(. != "ci"))/|check-queue-gate.sh
15 batch unread|product/tools/queue-gate.sh|s/names=\$(failing "\$rid" all . sort -u); \[ -n "\$names" \] .. {[^}]*}/names=$(failing "$rid" all)/|check-queue-gate.sh
15 batch body|product/tools/queue-gate.sh|s/ + \[(.body \/\/ "") . scan(.*tonumber\]\() . index(\$n))\)/\1/|check-queue-gate.sh
15 batch pages|product/tools/queue-gate.sh|s/length < 100 or any(.\[\]; .number <= \$n)/true/|check-queue-gate.sh
15 full names|product/tools/queue-gate.sh|s/ 2>\/dev\/null . san . cut -c1-120 . grep \.; true; }/ 2>\/dev\/null; true; }/|check-queue-gate.sh
15 batch|product/tools/queue-gate.sh|s/^  if ! { judge \&\& covered; }; then/  if ! judge; then/|check-queue-gate.sh
15 batch part|product/tools/queue-gate.sh|s/ <<< "\$lines" .. miss=/ <<< "$lines" .. true .. miss=/|check-queue-gate.sh
15 batch word|product/tools/queue-gate.sh|s/grep -qE -- "(^.\[^A-Za-z0-9_-\])\$(sed .s\/\[().\]\/\\\\&\/g. <<< "\$n")(\[^A-Za-z0-9_-\].\\\$)"/grep -qF -- "$n"/|check-queue-gate.sh
15 batch who|product/tools/queue-gate.sh|s/^FULL_WF=\(.*\); TEAM=.*/FULL_WF=\1; TEAM=true/|check-queue-gate.sh
15 batch run|product/tools/queue-gate.sh|s/Batch failures covered: \*\$rid \*:"/Batch failures covered: *[0-9]* *:"/|check-queue-gate.sh
15 batch bot|product/tools/queue-gate.sh|s/select(.login == "mergify\[bot\]" and /select(/|check-queue-gate.sh
15 batch sweep|product/tools/queue-gate.sh|s/judge \&\& { \[ -z "\${LABELED_AT:-}" \] .. covered; } \&\&/judge \&\&/|check-queue-gate.sh
15 batch since|product/tools/queue-gate.sh|s/\[\[ "\$(cut -f2 <<< "\$c")" < "\$LABELED_AT" \]\] .. continue;;/true;;/|check-queue-gate.sh
15 batch rerun|product/tools/queue-gate.sh|s/sort_by(.completed_at \/\/ "0") . first) as \$f/sort_by(.completed_at \/\/ "0") . last) as $f/|check-queue-gate.sh
15 p743 held|product/tools/queue-gate.sh|s/^  if \[ "\$held_state" != failed \]; then   # no failed batch/  if false; then   #/|check-queue-gate.sh
15 p743 red|product/tools/queue-gate.sh|s/^    full "\$@"; \[ "\$full_state" = failure \] .. { why=\$full_why; return 1; }; /    /|check-queue-gate.sh
15 p743 cache|product/tools/queue-gate.sh|s/^  \[ "\${held_pr:-}" = "\$PR" \] .. return 0/  [ -n "${held_pr:-}" ] \&\& return 0/|check-queue-gate.sh
15 p743 norid|product/tools/queue-gate.sh|s/^  \[ "\$held_state" != failed \] .. \[ -n "\$held_rid" \] .. { why=[^}]*}/  true/|check-queue-gate.sh
15 p743 unread|product/tools/queue-gate.sh|s/^  held .. { full_state=unread; return 1; }/  if ! held; then return 1; fi/|check-queue-gate.sh
15 batch at|product/tools/label-sweep.sh|s/PR=\$pr LABELED_AT="\${at:-}" bash/PR=$pr bash/|check-label-sweep.sh
15 full reviewed|../../.github/workflows/ci.yml|s/^            grep -qx .\[1-9\]\[0-9\]\*. <<< "\$ok" .. {.*/            true/|check-queue-gate.sh
15 full wake|../../.github/workflows/queue-gate.yml|s/startsWith(github.event.workflow_run.display_title, .full-run PR #.)/true/|check-queue-gate.sh
15 full depth|../../.github/workflows/label-guard.yml|/^          fetch-depth: 0$/d|check-queue-gate.sh
15 full name|../../.github/workflows/ci.yml|s/format(.full-run PR #{0} {1}., inputs.pr, inputs.head)/inputs.head/|check-queue-gate.sh
15 lead soft|product/tools/queue-gate.sh|s/^    grep -qiEf "\$H.soft" <<< "\$f" .. continue$/    continue/|check-queue-gate.sh
15 lead hard|product/tools/queue-gate.sh|s/^    if grep -qiEf "\$H.hard" <<< "\$f"; then printf .%s\\n. "\$f"; continue; fi$/    true/|check-queue-gate.sh
15 lead rec|product/tools/queue-gate.sh|s/^    \[ "\$rec" = 1 \] \&\& continue$/    continue/|check-queue-gate.sh
15 lead label|product/tools/queue-gate.sh|s/^  records \&\& rec=1$/  rec=1/|check-queue-gate.sh
15 lead img|product/tools/queue-gate.sh|/^    grep -qiE .\/product\/tools\/. <<< "\$f" .. ! grep/d|check-queue-gate.sh
15 lead list|product/tools/queue-gate.sh|s/^  \[ -r "\$all" \] \&\& grep -q .^# --- records-exempt. "\$all" .. {[^}]*}$/  true/|check-queue-gate.sh
15 start rid|product/tools/queue-gate.sh|s/ \&\& held \&\& \[ "\$held_state" = failed \]; then start/ \&\& held; then start/|check-queue-gate.sh
15 deq unlabel|product/tools/queue-gate.sh|s/^          api -X DELETE "\$API\/repos\/\$REPO\/issues\/\$PR\/labels\/review%3A%20approved"/          true/|check-queue-gate.sh
15 proof deq|product/tools/queue-gate.sh|s/ \] .. has dequeued; then/ ]; then/|check-queue-gate.sh
15 start red|product/tools/queue-gate.sh|s/\[ "\$ci_state" = failure \] \&\& { echo "#\$PR: ci is red/false \&\& { echo "#$PR: ci is red/|check-queue-gate.sh
15 start|product/tools/queue-gate.sh|s/^  api -X POST "\$API\/repos\/\$REPO\/actions\/workflows\/ci.yml\/dispatches"/  true/|check-queue-gate.sh
15 start who|product/tools/queue-gate.sh|s/^  approved \(..\) { echo "#\$PR: no full run: \$why";/  true \1 { echo "x";/|check-queue-gate.sh
15 start wake|../../.github/workflows/queue-gate.yml|s/ .. (github.event.action == .labeled. \&\& github.event.label.name == .dequeued.)//|check-queue-gate.sh
LW speed answer|product/tools/lead-watch-pre.sh|s/return "\$(cat "\$PRE_DIR\/\$i.rc")"; fi/return 0; fi/|check-lead-watch-speed.sh
LW speed once|product/tools/lead-watch-pre.sh|s/ && mkdir "\$PRE_DIR\/\$i.taken" 2>\/dev\/null//|check-lead-watch-speed.sh
LW speed together|product/tools/lead-watch-pre.sh|s/ ) &$/ )/|check-lead-watch-speed.sh
LW speed order|product/tools/lead-watch-pre.sh|s/\[ "\$first" = 0 \] .. pre_wait "\$first"; //|check-lead-watch-speed.sh
LW speed rc|product/tools/lead-watch-pre.sh|s/ && grep -qxE .*i.rc"; then/; then/|check-lead-watch-speed.sh
LW speed disk|product/tools/lead-watch-pre.sh|s/PRE_FREE_KB:-1048576/PRE_NONE:-0/|check-lead-watch-speed.sh
LW speed ended|product/tools/lead-watch-pre.sh|s/i.rc" ] && continue /i.rc" ]; /|check-lead-watch-speed.sh
LW speed nofetch|product/tools/lead-watch.sh|s/; \[ -z "\$early" \] .. pre_off//|check-lead-watch-speed.sh
LW speed key|product/tools/lead-watch-pre.sh|s/%q /%s /|check-lead-watch-speed.sh
LW speed off|product/tools/lead-watch-pre.sh|s/ rm -rf "\${PRE_DIR:?}";//|check-lead-watch-speed.sh
LW speed step|product/tools/lead-watch.sh|/^nw=/d|check-lead-watch-speed.sh
LW speed fetch|product/tools/lead-watch.sh|s/^PRE_T0=.*fetch -q origin 2>.*/PRE_T0=0; early=/|check-lead-watch-speed.sh
LW speed sweep|product/tools/lead-watch.sh|s/ after bash .*lead-queue.sh" -- bash/ pre bash/|check-lead-watch-speed.sh
LW speed asks|product/tools/lead-watch.sh|s/^cm=.* --paginate/cm=$(gh api "x"/|check-lead-watch-speed.sh
LW speed shut|product/tools/lead-watch.sh|s/ACT "comments since.*/true/|check-lead-watch-speed.sh
LW speed cut|product/tools/lead-watch.sh|/ACT "comments since $since cut short/d|check-lead-watch-speed.sh
LW speed list|product/tools/lead-watch.sh|s/type == "array" and length > 0 and //|check-lead-watch-speed.sh
LW speed seconds|product/tools/fresh-lib.sh|s/ && w="\$s s · "//|check-lead-watch-speed.sh
LW speed gh|product/tools/gh.sh|/^\[ -n .*GH_FALLBACK=always$/d|check-lead-watch-speed.sh
16 source|product/tools/cockpit-data.py|s/                elif st != "open":/                elif False:/|check-lead-watch-board.sh
16 count|product/tools/lead-watch.sh|s/; echo "\$bw"; act=\$((act + \$(grep -c .^ACT. <<<"\$bw")))/; echo "$bw"/|check-lead-watch-board.sh
17 wall|product/tools/known-failures.py|s/(1 if b > int(row\["threshold"\]) else 0)/0/|check-known-failures.sh
17 count|product/tools/lead-watch.sh|s/; echo "\$kf"; act=\$((act + \$(grep -c .^ACT. <<<"\$kf")))/; echo "$kf"/|check-known-failures.sh
18|product/tools/queued-push-guard.sh|s/.name == "queued"/.name == "never"/|check-queued-push-guard.sh
18 bulk|product/tools/queued-push-guard.sh|s/--all.--branches.--mirror) bulk=all;;//|check-queued-push-guard.sh
19|product/tools/lead-read-guard.sh|s/^  \[ -z "\$files" \] \&\& return 0/  return 0/|check-lead-read-guard.sh
19 head|product/tools/lead-read-guard.sh|s/case "\$head" in "\$s"\*)/case "\$head" in *)/|check-lead-read-guard.sh
19 own|product/tools/lead-read-guard.sh|s/\$l != "" and (\$l == \$own or \$l == \$me)/true/|check-lead-read-guard.sh
19 curl|product/tools/lead-read-guard.sh|s/(gh\[\[:space:\]\]+api.curl)/(gh[[:space:]]+api)/|check-lead-read-guard.sh
19 identity|product/tools/lead-read-guard.sh|s/.platform\/identity\///|check-lead-read-guard.sh
19 ghrepo|product/tools/lead-read-guard.sh|s/\${r:-\${g:-\${cmdrepo:-\${GH_REPO:-\$here}}}}/${r:-$here}/|check-lead-read-guard.sh
20|product/tools/gmail-start-check.sh|s/^\[ "\$state" = ok \] \&\& exit 0/exit 0/|check-gmail-start-check.sh
21 check|product/tools/lead-act-check.sh|s/-gt "\$CHECK_MIN" \]/-gt 99999 ]/|check-lead-act-check.sh
21 board|product/tools/lead-act-check.sh|s/-gt "\$BOARD_MIN" \]/-gt 99999 ]/|check-lead-act-check.sh
22|product/tools/wip-guard.py|s/^MAX_WAITING, MAX_HOURS = 2, 24/MAX_WAITING, MAX_HOURS = 99, 9999/|check-wip-guard.sh
22 bug|product/tools/wip-guard.py|s/ & open_bugs(root):/ or True:/|check-wip-guard.sh
23|product/tools/ist-time-guard.py|s/                if not ok:/                if False:/|check-ist-time-guard.sh
24 deny|product/tools/conformance-check.py|s/    miss = \[x for x in want if x not in have\]/    miss = []/|check-conformance-check.sh
24 hooks|product/tools/conformance-check.py|s/"fail" if off else "pass"/"pass"/|check-conformance-check.sh
24 queue|product/tools/conformance-check.py|s/"pass" if mpc == cfg\["max_parallel_checks"\] else "fail"/"pass"/|check-conformance-check.sh
24 side|product/tools/conformance-check.py|s/"fail" if side else "pass"/"pass"/|check-conformance-check.sh
24 version|product/tools/conformance-check.py|s/ok = have is not None and have == str(want).lstrip("v")/ok = True/|check-conformance-check.sh
24 trig|product/tools/conformance-check.py|s/elif sorted(have or \[\]) != sorted(types):/elif False:/|check-conformance-check.sh
24 beat|product/tools/conformance-check.py|s/    if per_hour \* hb\["every_min"\] < 60:/    if False:/|check-conformance-check.sh
24 gate|product/tools/conformance-check.py|s/             if n == cfg\["gate_job"\] and k != cfg\["gate_job"\]\]/             if False]/|check-conformance-check.sh
25 merge|product/tools/pipeline-heartbeat.py|s/             > hb\["no_merge_min"\]\]/             > 99999]/|check-pipeline-heartbeat.sh
25 queue|product/tools/pipeline-heartbeat.py|s/             > hb\["queue_no_progress_min"\]\]/             > 99999]/|check-pipeline-heartbeat.sh
25 lane|product/tools/pipeline-heartbeat.py|s/        elif idle > hb\["stalled_lane_min"\]:/        elif False:/|check-pipeline-heartbeat.sh
25 nightly|product/tools/pipeline-heartbeat.py|s/ and not nights:/ and False:/|check-pipeline-heartbeat.sh
25 conf|product/tools/pipeline-heartbeat.py|s/        if failed or conformance.get("enforced") != "yes":/        if False:/|check-pipeline-heartbeat.sh
25 new|product/tools/pipeline-heartbeat.py|s/            if not o:/            if False:/|check-pipeline-heartbeat.sh
25 escalate|product/tools/pipeline-heartbeat.py|s/            elif not esc and mins(first, now) > hb\["escalate_after_min"\]:/            elif False:/|check-pipeline-heartbeat.sh
25 carry|product/tools/pipeline-heartbeat.py|s/    state = dict(p.get("alarm_state") or {})/    state = {}/|check-pipeline-heartbeat.sh
25 pages|product/tools/pipeline-heartbeat.py|s/        if old or not page\["pageInfo"\]\["hasNextPage"\]:/        if True:/|check-pipeline-heartbeat.sh
25 parked|product/tools/pipeline-heartbeat.py|s/        if p\["number"\] in away:   # parked: listed below, never a stalled lane/        if False:/|check-pipeline-heartbeat.sh
25 expired|product/tools/pipeline-heartbeat.py|s/^    if expired:/    if False:/|check-pipeline-heartbeat.sh
25 resume|product/tools/pipeline-heartbeat.py|s/^    if now.astimezone(IST).date() > day:/    if False:/|check-pipeline-heartbeat.sh
25 parkread|product/tools/pipeline-heartbeat.py|s/        if hb.get("parked_label", "parked") in p\["labels"\]:/        if False:/|check-pipeline-heartbeat.sh
25 parkpage|product/tools/pipeline-heartbeat.py|s/^                if len(cs) < 100:/                if True:/|check-pipeline-heartbeat.sh
25 trusted|product/tools/pipeline-heartbeat.py|s/ if c.get("author_association") in TRUSTED\]/]/|check-pipeline-heartbeat.sh
25 istdate|product/tools/pipeline-heartbeat.py|s/    posted = t(c\["created_at"\]).astimezone(IST).date()/    posted = t(c["created_at"]).date()/|check-pipeline-heartbeat.sh
26 off|product/tools/focus-check.py|s/ for x in subject if x not in items and x not in rows\]/ for x in subject if False]/|check-focus-list.sh
26 first|product/tools/focus-check.py|s/ else named\[:1\]) + / else []) + /|check-focus-list.sh
26 verb|product/tools/focus-check.py|s/ + \[x for x in VERB.findall(text) if known(x) and not exempt(x)\]$//|check-focus-list.sh
26 then|product/tools/focus-check.py|s/.\[Tt\]hen.merges,//|check-focus-list.sh
26 file|product/tools/focus-check.py|s/BRIEF_FILE.sub(file_row, brief)/brief/|check-focus-list.sh
26 cited|product/tools/focus-check.py|s/^        named = \[r for r in dict.fromkeys(filter(None, map(row_of, MD_FILE.findall(brief)))) if not exempt(r)\]/        named = []/|check-focus-list.sh
26 joined|product/tools/focus-check.py|s/^    while more.search(text):/    while False:/|check-focus-list.sh
26 ticks|product/tools/focus-check.py|s/(\[Rr\]ead.per.from)\\s+\[`\*\]\*(?:/(read)\\s+(?:/|check-focus-list.sh
26 own|product/tools/focus-check.py|s/(\[own.group(1)\] if own and known(own.group(1)) else named\[:1\])/named[:1]/|check-focus-list.sh
26 exempt|product/tools/focus-check.py|s/^    exempt = lambda r: .*/    exempt = lambda r: r in area/|check-focus-list.sh
26 notbuilder|product/tools/focus-check.py|s/(?!\[A-Za-z0-9-\])//|check-focus-list.sh
26 closed|product/tools/focus-check.py|s/^    if not items:/    if False:/|check-focus-list.sh
26 hook|product/tools/lane-preflight.sh|s/python3 -I "\$DIR\/focus-check.py")/cat >\/dev\/null)/|check-focus-list.sh
27|product/tools/check-docs.sh|/WORKFLOW LOCK: \$id changes the workflow/d|check-workflow-lock.sh
27 broken|product/tools/check-docs.sh|s/ \&\& printf [^;]*broken[^;]* \&\& continue$/ \&\& continue/|check-workflow-lock.sh
27 fix|product/tools/check-docs.sh|s/grep -qiE .\\bfix(es.ed.ing)?\\b. \&\& printf/true \&\& printf/|check-workflow-lock.sh
27 tooling|product/tools/check-docs.sh|s/^        \[ -n "\$areas" \] .. continue$/        continue/|check-workflow-lock.sh
27 closed|product/tools/check-docs.sh|/EXEMPT list in tools\/decision-impact.sh could not be read/d|check-workflow-lock.sh
28 allow|product/tools/waves.py|s/            elif wave\[i\]\[0\] not in ok and/            elif False and/|check-waves.sh
28 page|product/tools/waves.py|s/        if norm(old) != norm(gen_block(rows, st)):/        if False:/|check-waves.sh
28 cap|product/tools/waves.py|s/    if len(building) > CAP_BUILDING:/    if False:/|check-waves.sh
28 ids|product/tools/waves.py|s/        if miss or extra or dup:/        if False:/|check-waves.sh
28 pr|product/tools/waves.py|s/               if i in wave and wave\[i\]\[0\] not in ok and not wave\[i\]\[1\].startswith(.allow:.)\]/               if False]/|check-waves.sh
28 watch|product/tools/lead-watch.sh|/waves.py" wip --prs/d|check-waves.sh
28 flag|../../.github/workflows/pr-rules.yml|/labels\[\]=outside-wave/d|check-waves.sh
28 item|product/tools/brief-check.sh|s/^  if \[ -z "\$item" \]; then bad=/  if false; then bad=/|check-lane-preflight.sh
28 wave|product/tools/brief-check.sh|s/waves.py" allow /waves.py" active /|check-lane-preflight.sh
28 none|product/tools/brief-check.sh|s/waves.py" none-ok 2>\&1)/waves.py" active 2>\&1)/|check-lane-preflight.sh
30 stale|product/tools/runs-waiting.py|s/(stale if c and now - c >= timedelta(hours=FRESH_H) else fresh)/fresh/|check-runs-waiting.sh
30 board|product/tools/cockpit-data.py|s/ - len(stale)$//|check-runs-waiting.sh
31|product/tools/founder-click-guard.sh|s/^\[ -z "\$hits" \] \&\& exit 0/exit 0/|check-founder-click-guard.sh
31 state|product/tools/founder-click-guard.sh|s/^    hits = \[h for l in/    hits = [] and [h for l in/|check-founder-click-guard.sh
31 stop|product/tools/stop-check.sh|/founder-click-guard.sh" 2>\/dev\/null/d|check-founder-click-guard.sh
E-a age|product/tools/question-gate.py|s/        if age > limit:/        if False:/|check-question-gate.sh
E-a tooling|product/tools/question-gate.py|s/^PRODUCT_MIN, TOOLING_MIN, STALE_MIN = 20, 60, 35/PRODUCT_MIN, TOOLING_MIN, STALE_MIN = 20, 20, 35/|check-question-gate.sh
E-a wired|product/tools/stop-check.sh|/question-gate.py" --sle/d|check-question-gate.sh
HANG env|product/tools/hang-report.py|s/if d.get("environmentVariables"):/if False:/|check-hang-report.sh
HANG dir|product/tools/hang-report.py|s/^FILE = .*/FILE = re.compile(r"(.*)(:\\d+:\\d+)")/|check-hang-report.sh
HANG line|product/tools/hang-report.py|s/(f or "(line not shown)")/(f or s)/|check-hang-report.sh
HANG url|product/tools/hang-report.py|s/ or (None if re.search(.* else FILE/ or (FILE/|check-hang-report.sh
HANG fn|product/tools/hang-report.py|s/fn + " " if NAME.fullmatch(fn) else ""/fn + " "/|check-hang-report.sh
HANG sym|product/tools/hang-report.py|s/^SYMBOL = .*/SYMBOL = re.compile(r".+")/|check-hang-report.sh
HANG kind|product/tools/hang-report.py|s/if re.fullmatch(r"\[a-z_\]{1,20}", kind):/if True:/|check-hang-report.sh
HANG ask|product/tools/run-suites.sh|s/ --report-exclude-env --report-exclude-network --report-directory/ --report-directory/|check-hang-report.sh
HANG wired|product/tools/run-suites.sh|s/; askreport "\$pid" "\$rd" ) </ ) </|check-hang-report.sh
HANG raw|product/tools/run-suites.sh|s/ rm -rf "\${rd:?}"; }/ }/|check-hang-report.sh
HANG catch|product/tools/run-suites.sh|s/ \&\& \[ \$(( 16#.* -ne 0 \]//;s/^    \[ "\$(basename .*//;s/^    { tr .*//|check-hang-report.sh
31 watch|product/tools/lead-watch.sh|s/act=\$((act + \$(grep -c .^ACT. <<<"\$fc")))/true/|check-founder-click-guard.sh
33 E14|product/tools/check-docs.sh|s/        if miss: print(f"INDEX:/        if False: print(f"INDEX:/|check-idx-integrity.sh
33 E14 range|product/tools/check-docs.sh|s/            ids .= {f"P-{i}" for i in range(a, b + 1)}/            pass/|check-idx-integrity.sh
33 E14 rules|product/tools/check-docs.sh|s/^for f in \[os.path.join(ph, "RULES.md")\] + sorted(glob.glob(os.path.join(ph, "rules", "\*.md"))):/for f in [os.path.join(ph, "RULES.md")]:/|check-idx-integrity.sh
33 E14 decisions|product/tools/check-docs.sh|s/^for f in \[os.path.join(ph, "DECISIONS.md")\] + sorted(glob.glob(os.path.join(ph, "decisions", "\*.md"))):/for f in [os.path.join(ph, "DECISIONS.md")]:/|check-idx-integrity.sh
34|product/tools/image-size.sh|s/ --not "\$base"//|check-image-size.sh
35|product/tools/pr-suites-plan.sh|s/direct=true;; esac/direct=false;; esac/|check-pr-suites-job.sh
35 cap|product/tools/pr-suites-plan.sh|s/\[ "\$n" -gt "\$MAX" \] \&\& n=\$MAX/true/|check-pr-suites-job.sh
35 cancel|../../.github/workflows/pr-suites.yml|s/^  cancel-in-progress: .*/  cancel-in-progress: true/|check-pr-suites-job.sh
36 batch|../../.github/workflows/ci.yml|s/^  cancel-in-progress: .*/  cancel-in-progress: true/|check-pr-concurrency.sh
36 stale|../../.github/workflows/walks.yml|s/^  cancel-in-progress: .*/  cancel-in-progress: false/|check-pr-concurrency.sh
36 group|../../.github/workflows/module-cards.yml|/^  group: module-cards-/d|check-pr-concurrency.sh
36 comment|../../.github/workflows/review-rounds.yml|s/github.event.issue.number .. //|check-pr-concurrency.sh
36 deadlock|../../.github/workflows/review-rounds.yml|s/^jobs:$/concurrency:\n  group: review-rounds-${{ github.event.pull_request.number }}\njobs:/|check-pr-concurrency.sh
36 wfname|../../.github/workflows/review-rounds.yml|s/^jobs:$/concurrency:\n  group: ${{ github.workflow }}-${{ github.event.issue.number }}\njobs:/|check-pr-concurrency.sh
36 kind|../../.github/workflows/ci.yml|/^  kind:$/,/^    if:/{/^    if:/d}|check-pr-concurrency.sh
36 batchcancel|../../.github/workflows/guards.yml|s/^  cancel-in-progress: .*/  cancel-in-progress: true/|check-pr-concurrency.sh
36 rerun|product/tools/queue-gate.sh|s/^    \[ "\$now" = "\$head" \] .. {.*/    true/|check-queue-gate.sh
36 ready|../../.github/workflows/guards.yml|/^    types: \[opened, synchronize, reopened, ready_for_review\]$/d|check-pr-concurrency.sh
36 draft|../../.github/workflows/trace.yml|/SPD-2 item 5 (b): not on a draft/d|check-pr-concurrency.sh
35 report|../../.github/workflows/pr-suites.yml|/^        if: steps.setup.outcome == .success.$/{n;d;}|check-pr-suites-job.sh
35 batch|../../.github/workflows/pr-suites.yml|s/ \&\& !startsWith(github.event.pull_request.head.ref, .mergify\/.)//|check-pr-suites-job.sh
35 rename|product/tools/pr-suites-plan.sh|s/ diff --no-renames --name-only/ diff --name-only/|check-pr-suites-job.sh
761c build|product/tools/waves.py|s/    if len(building) < CAP_BUILDING and waiting:/    if False:/|check-waves.sh
761c qa|product/tools/waves.py|s/    if qa is not None and qa < CAP_QA and built:/    if False:/|check-waves.sh
761c view|product/tools/waves.py|s/^        if re.search(r"^UNREADABLE".*/        if False:/|check-waves.sh'
pyparse() { python3 -I -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "${@: -1}"; }   # "$sh -n FILE" for a .py
jsparse() { node --check "${@: -1}"; }   # "$sh -n FILE" for a .js (guard 36: app-view.js; bash -n cannot read JavaScript)
MUT="$MUT"'
E16 line|product/tools/deps-line-check.sh|s/^  exit 1$/  exit 0/|check-deps-line.sh
E16 new|product/tools/deps-line-check.sh|s/^        if n not in seen: out.add(n)/        if False: pass/|check-deps-line.sh
E16 alias|product/tools/deps-line-check.sh|s/ and not PLAIN.match(v):/ and False:/|check-deps-line.sh
E16 ci|../../.github/workflows/pr-rules.yml|/deps-line-check.sh" --base HEAD^1/d|check-deps-line.sh
CS3 low|product/tools/queue-depth.py|s/^    if bad \* 100 < LOW \* N:/    if False:/|check-queue-depth.sh
CS3 high|product/tools/queue-depth.py|s/^    elif bad \* 100 > HIGH \* N:/    elif False:/|check-queue-depth.sh
CS3 band|product/tools/queue-depth.py|s/^        want, why = cur, /        want, why = DEEP, /|check-queue-depth.sh
CS3 unread|product/tools/queue-depth.py|s/^        if len(found) < N:/        if not found:/|check-queue-depth.sh
CS3 cancel|product/tools/queue-depth.py|s/ or c not in ("success",) + FAILED:/ or c is None:/|check-queue-depth.sh
CS3 trace|product/tools/queue-depth.py|s/    except (Unreadable, OSError, TypeError, ValueError, AttributeError) as e:/    except Unreadable as e:/|check-queue-depth.sh
CS3 watch|product/tools/lead-watch.sh|s/\[ "\$qdr" = 3 \] \&\& ACT "queue depth/[ "$qdr" = 9 ] \&\& ACT "queue depth/|check-queue-depth.sh
36 stale|product/tools/app-view-check.sh|s/^STALE_MIN=15 /STALE_MIN=35 /|check-app-view.sh
36 rows|product/tools/app-view-check.sh|s/^sed -n 2p "\$f" .*/true/|check-app-view.sh
36 read|product/tools/lead-watch.sh|s/^  if ! grep -qE .(^. )rows=\[0-9\]+. <<<"\$first"; then$/  if false; then/|check-app-view.sh
36 click|product/tools/app-view.js|s/targets.forEach((t) => { t.click(); clicks++; });/clicks++;/|check-app-view.sh
36 any|product/tools/app-view.js|s/if (ownText(el) === SHOW_MORE)/if (el.tagName === "BUTTON" \&\& ownText(el) === SHOW_MORE)/|check-app-view.sh
36 jobs|product/tools/runs-waiting.py|s/ if x.get("status") == "in_progress")/)/|check-runs-waiting.sh'
MUT="$MUT"'
32|product/tools/nightly-watch.py|s/    if c == "success":/    if True:/|check-nightly-watch.sh
32 missed|product/tools/nightly-watch.py|s/    if newest is None or now - newest >= timedelta(hours=MISSED_H):/    if False:/|check-nightly-watch.sh
32 watch|product/tools/lead-watch.sh|s/act=\$((act + \$(grep -c .^ACT. <<<"\$nw")))/true/|check-nightly-watch.sh
32 parts|../../.github/workflows/nightly.yml|s/^      N: [0-9]*$/      N: 8/|check-nightly-watch.sh'
MUT="$MUT"'
ENF771 stop|product/tools/stop-check.sh|/resource-claim-guard.sh" 2>\/dev\/null/d|check-resource-claim-guard.sh
ENF771 deny|product/tools/resource-claim-guard.sh|s/    if s and CLAIM.search(s) and not NEG.search(s)/    if s and CLAIM.search(s)/|check-resource-claim-guard.sh
ENF771 near|product/tools/resource-claim-guard.sh|s/EVID.search(" ".join(sents\[max(0, i - 1):i + 2\]))/EVID.search(text)/|check-resource-claim-guard.sh'
MUT="$MUT"'
38 E7|product/tools/check-docs.sh|s/    if rid in stale or re.search/    if True or re.search/|check-rule-register.sh
38 E7 suffix|product/tools/check-docs.sh|s/        if f.removeprefix("\.\/") not in have:/        if not any(x.endswith(f) for x in files):/|check-rule-register.sh
38 E7 path|product/tools/check-docs.sh|s/^have = set(files) .*$/have = set(files)/|check-rule-register.sh
38 E7 stale|product/tools/check-docs.sh|s/^    KNOWN_STALE=" P-690 IDX-23 "/    KNOWN_STALE=" P-1 P-690 IDX-23 "/|check-rule-register.sh
37 E15 kind|product/tools/decision-impact.sh|s/scope.tooling)/scope.none)/|check-decision-impact.sh
37 E15 impact|product/tools/decision-impact.sh|s/^done . grep . \&\& bad=1$/done/|check-decision-impact.sh
37 E15 from|product/tools/decision-impact.sh|s/IMPACT_FROM=808/IMPACT_FROM=99999/|check-decision-impact.sh
37 E15 frozen|product/tools/decision-impact.sh|s/^EXEMPT_UPTO=764;/EXEMPT_UPTO=999;/|check-decision-impact.sh
38 hand|product/tools/lead-upkeep.py|s/    if beyond >= HAND_K:/    if False:/|check-lead-upkeep.sh
38 warn|product/tools/lead-upkeep.py|s/    elif beyond >= WARN_K:/    elif False:/|check-lead-upkeep.sh
38 given|product/tools/lead-upkeep.py|s/    if now is None:/    if False and now is None:/|check-lead-upkeep.sh
38 start|product/tools/lead-upkeep.py|s/(kilo(m.group(1)), "STATE current_lead:") if m else/(None, "x") if False else/|check-lead-upkeep.sh
38 secret|product/tools/lead-upkeep.py|s/    elif p.returncode == 3 and /    elif False and /|check-lead-upkeep.sh
38 group|product/tools/lead-upkeep.py|s/            os.killpg(p.pid, signal.SIGKILL)/            p.kill()/|check-lead-upkeep.sh
38 range|product/tools/lead-upkeep.py|s/    if beyond < 0:  /    if False:  /|check-lead-upkeep.sh
38 fail|product/tools/lead-upkeep.py|s/    if p.returncode == 0:/    if True:/|check-lead-upkeep.sh
38 notes|product/tools/lead-upkeep.py|s/    if not os.path.lexists(a.notes):/    if not os.path.isdir(a.notes):/|check-lead-upkeep.sh
38 source|product/tools/private-sync.sh|s/^if \[ ! -d "\$NOTES" \] .*then$/if false; then/|check-lead-upkeep.sh
38 rev-parse|product/tools/private-sync.sh|s/^if ! git rev-parse -q --verify HEAD .*then$/if false; then/|check-lead-upkeep.sh
38 note file|product/tools/private-sync.sh|s/ -type f ! -path / -type f -path /|check-lead-upkeep.sh
38 after copy|product/tools/private-sync.sh|s/^if \[ -z "\$(git ls-files -s -- notes\/side-session-notes\/ .*then$/if false; then/|check-lead-upkeep.sh
38 origin|product/tools/private-sync.sh|s/^if ! same_repo .*then$/if false; then/|check-lead-upkeep.sh
38 pull|product/tools/private-sync.sh|s/^if ! git pull -q --ff-only; then$/if ! git pull -q --ff-only \&\& false; then/|check-lead-upkeep.sh
38 dot path|product/tools/private-sync.sh|s/ grep -v -E .(^.\/)\[.\]. / cat /|check-lead-upkeep.sh
38 ahead|product/tools/private-sync.sh|s/ && \[ "\$ahead" = 0 \]; then$/; then/|check-lead-upkeep.sh
38 stored|product/tools/private-sync.sh|s/git config --get remote.origin.url/git remote get-url origin/|check-lead-upkeep.sh
38 slash|product/tools/private-sync.sh|s/local a="\${1%\/}" b="\${2%\/}"/local a="$1" b="$2"/|check-lead-upkeep.sh
38 symlink|product/tools/private-sync.sh|s/\$1 == "100644" .. \$1 == "100755"/$1 != "160000"/|check-lead-upkeep.sh
38 gitlink|product/tools/private-sync.sh|s/^if \[ -n "\$subs" \]; then$/if false; then/|check-lead-upkeep.sh
38 undo|product/tools/private-sync.sh|s/^undo() { git reset -q -- notes;/undo() { git reset -q --hard HEAD;/|check-lead-upkeep.sh
38 pushurl|product/tools/private-sync.sh|s/^  \[ -z "\$u" \] /  true /|check-lead-upkeep.sh
38 branch|product/tools/private-sync.sh|s/"HEAD:refs\/heads\/\${up#origin\/}"/HEAD/|check-lead-upkeep.sh
38 F4 upstream|product/tools/private-sync.sh|/^case "\$up" in origin\/?\*) ;; \*) echo "private-sync: refused, the working copy tracks no branch/d|check-lead-upkeep.sh
38 F4 pushinsteadof|product/tools/private-sync.sh|s/^  case "\$u" in "\$v"\*) same_repo/  case "$u" in nomatch) same_repo/|check-lead-upkeep.sh
38 F4 empty|product/tools/private-sync.sh|s/^  \[ -n "\$k" \] /  [ -n "$v" ] /|check-lead-upkeep.sh
38 F4 add|product/tools/private-sync.sh|s/^if ! adderr=\$(git add -A notes 2>\&1); then$/git add -A notes; if false; then/|check-lead-upkeep.sh
38 watch|product/tools/lead-watch.sh|s/echo "\$lc"; act=\$((act + \$(grep -c .^ACT. <<<"\$lc")))/echo "$lc"/|check-lead-upkeep.sh
38 watch2|product/tools/lead-watch.sh|s/echo "\$ps"; act=\$((act + \$(grep -c .^ACT. <<<"\$ps")))/echo "$ps"/|check-lead-upkeep.sh
29 machines|product/tools/flow-constraint.py|s/(mc.get("oldest_min") or 0) > BAR\["wait_min"\]/False/|check-flow-constraint.sh
29 culprit|product/tools/flow-constraint.py|s/ if y\["open"\] and not y.get("requeued")})/ if y["open"]})/|check-flow-constraint.sh
29 stale|product/tools/flow-constraint.py|s/ and age > BOARD_MAX_MIN else$/ and False else/|check-flow-constraint.sh
29 board|product/tools/flow-constraint.py|s/^BOARD_MAX_MIN = int(os.environ.get("FRESH_MAX_MIN") or 10) if .* else 10 /BOARD_MAX_MIN = 45 /|check-flow-constraint.sh
29 unread|product/tools/flow-constraint.py|s/^    if unmeasured:$/    if False:/|check-flow-constraint.sh
29 count|product/tools/lead-watch.sh|s/; echo "\$cs"; act=\$((act + \$(grep -c .^ACT. <<<"\$cs")))/; echo "$cs"/|check-flow-constraint.sh
761g gap|product/tools/lead-watch.sh|s/GAP_MAX:-15/GAP_MAX:-999/|check-lead-gap.sh
761g stall|product/tools/lead-watch.sh|s/STALL_MAX:-15/STALL_MAX:-40/|check-lead-gap.sh
761g guard|product/tools/lead-check-guard.sh|/norm "\$GAP")" \] .. exit 0$/d|check-lead-gap.sh
37 paths|product/tools/queue-blocked.py|s/^    return bool(files) and all(any(r.search(f) for r in CHECK_ONLY) for f in files)/    return True/|check-queue-blocked.sh
37 approve|product/tools/queue-blocked.py|s/^    return bool(re.match(.*/    return True/|check-queue-blocked.sh
37 head|product/tools/queue-blocked.py|s/approve\[sd\]?\\s+%s\\b" % re.escape(head)/approve" % ()/|check-queue-blocked.sh
37 trusted|product/tools/queue-blocked.py|s/c.get("author_association") not in TRUSTED or //|check-queue-blocked.sh
37 who|product/tools/queue-blocked.py|s/ or (c.get("user") or {}).get("login") not in who:/:/|check-queue-blocked.sh
37 source|product/tools/queue-blocked.py|s/ and main_like(r.get("head_branch"))\]/]/|check-queue-blocked.sh
37 measured|product/tools/queue-blocked.py|s/"" if note else "main.s guards green, "/"main.s guards green, "/|check-queue-blocked.sh
37 pages|product/tools/queue-blocked.py|s/^        if len(page) < 100 or enough(page):/        if True:/|check-queue-blocked.sh
37 rename|product/tools/queue-blocked.py|s/, f.get("previous_filename"))/,)/|check-queue-blocked.sh
37 running|product/tools/queue-blocked.py|s/ or any(r.get("status") != "completed" for r in mine)//|check-queue-blocked.sh
37 batchpr|product/tools/queue-blocked.py|s/ or str((p.get("head") or {}).get("ref") or "").startswith("mergify\/")//|check-queue-blocked.sh
37 label|product/tools/queue-blocked.py|s/^            if "review: approved" not in labels:$/            if True:/|check-queue-blocked.sh
37 cancelled|product/tools/queue-blocked.py|s/ and r.get("conclusion") not in ("cancelled", "skipped")//|check-queue-blocked.sh
37 window red|product/tools/queue-blocked.py|s/ and (r is last or (when(r.get("created_at")) or now) >= since)\]/ and r is last]/|check-queue-blocked.sh
37 reviewers|product/tools/queue-blocked.py|s/^            rv = gh("api", .*/            rv = ""/|check-queue-blocked.sh
37 cap|product/tools/queue-blocked.py|s/^    raise Unread("more than %d pages" % cap)/    return out/|check-queue-blocked.sh
37 ci|product/tools/queue-blocked.py|s/^    return max(mine, .*/    return True/|check-queue-blocked.sh
37 guards|product/tools/queue-blocked.py|s/^            if red:/            if False:/|check-queue-blocked.sh
37 batch|product/tools/queue-blocked.py|s/str(r.get("head_branch") or "").startswith("mergify\/merge-queue\/") and/str(r.get("head_branch") or "").startswith("never\/") and/|check-queue-blocked.sh
37 window|product/tools/queue-blocked.py|s/^WINDOW_H = 2 /WINDOW_H = 999 /|check-queue-blocked.sh
37 dequeued|product/tools/queue-blocked.py|s/.get("name") == "dequeued"/.get("name") == "never"/|check-queue-blocked.sh
37 green|product/tools/queue-blocked.py|s/^    if not why and not warn:/    if False:/|check-queue-blocked.sh
37 unread|product/tools/queue-blocked.py|s/^    if not why and not warn:/    if not why:/|check-queue-blocked.sh
37 draft|product/tools/queue-blocked.py|s/if p.get("draft") or /if False and p.get("draft") or /|check-queue-blocked.sh
37 read|product/tools/queue-blocked.py|s/^        if read:$/        if True:/|check-queue-blocked.sh
37 read who|product/tools/queue-blocked.py|s/ not in TRUSTED or not c.get("created_at"):/ is None:/|check-queue-blocked.sh
37 read edited|product/tools/queue-blocked.py|s/^        if (c.get("created_at") if u is None else u) != c.get("created_at"):/        if False:/|check-queue-blocked.sh
37 read head|product/tools/queue-blocked.py|s/^            if m and m.group(1).lower() == head.lower():$/            if m:/|check-queue-blocked.sh
37 read drop|product/tools/queue-blocked.py|s/^        for d in DROP:$/        for d in []:/|check-queue-blocked.sh
37 read code|product/tools/queue-blocked.py|s/^            if line.startswith("    ") or line.startswith(.\\t.):$/            if False:/|check-queue-blocked.sh
37 read blank|product/tools/queue-blocked.py|s/^LEAD_READ = re.compile(r"^\[ \\t\\v\\f\]\*lead read/LEAD_READ = re.compile(r"^[\\s\\xa0]*lead read/|check-queue-blocked.sh
37 read leads|product/tools/queue-blocked.py|s/^        if leads and (login not in leads or login == asc(str(author or ""))):$/        if False:/|check-queue-blocked.sh
37 read unread|product/tools/queue-blocked.py|s/^                ll = None$/                ll = ""; continue/|check-queue-blocked.sh
37 read org|product/tools/queue-blocked.py|s/^                    continue$/                    break/|check-queue-blocked.sh
37 read nul|product/tools/queue-blocked.py|s/^    if any("\\x00" in b for b in counted):/    if False:/|check-queue-blocked.sh
37 read ascii|product/tools/queue-blocked.py|s/^    return re.sub(r"\[A-Z\]", lambda m: m.group().lower(), x)$/    return x.lower()/|check-queue-blocked.sh
37 read empty|product/tools/queue-blocked.py|s/os.environ.get("QB_LEAD_LOGINS")/os.environ.get("LEAD_LOGINS")/|check-queue-blocked.sh
37 read asciire|product/tools/queue-blocked.py|s/, re.I . re.A)   # grep/, re.I)   # grep/|check-queue-blocked.sh
37 read split|product/tools/queue-blocked.py|s/\[^\\S\\x1c-\\x1f\]/\\s/|check-queue-blocked.sh
37 read 404|product/tools/queue-blocked.py|s/^                if e.notfound:$/                if True:/|check-queue-blocked.sh
37 read 404 text|product/tools/queue-blocked.py|s/returned error: 404\\b/never/|check-queue-blocked.sh
37 F2 head|product/tools/queue-blocked.py|s/% (n, title, head, head))/% (n, title, head[:7], head[:7]))/|check-queue-blocked.sh
37 count|product/tools/lead-watch.sh|s/; seen "\$qb"; act=\$((act + \$(grep -c .^ACT. <<<"\$qb")))/; seen "$qb"/|check-queue-blocked.sh
39 lanes|product/tools/owed-watch.py|s/        elif r < a.min:/        elif False:/|check-owed-watch.sh
39 unread|product/tools/owed-watch.py|s/        if r is None:/        if False and r is None:/|check-owed-watch.sh
39 board|product/tools/owed-watch.py|s/            raise ValueError("no backlog.by_lane")/            by = {}/|check-owed-watch.sh
39 done|product/tools/owed-watch.py|s/ and not DONE.search(c):/:/|check-owed-watch.sh
39 head|product/tools/owed-watch.py|s/^        if h:  /        if False:  /|check-owed-watch.sh
39 state|product/tools/owed-watch.py|s/^        print(f"ACT   starts owed not measured/        return; print(f"ACT   starts owed not measured/|check-owed-watch.sh
39 watch|product/tools/lead-watch.sh|s/echo "\$lr"; act=\$((act + \$(grep -c .^ACT. <<<"\$lr")))/echo "$lr"/|check-owed-watch.sh
39 watch2|product/tools/lead-watch.sh|s/echo "\$so"; act=\$((act + \$(grep -c .^ACT. <<<"\$so")))/echo "$so"/|check-owed-watch.sh
37 count|product/tools/queue-batches.py|s/ or any(r.get("status") != "completed" for r in runs\["check_runs"\]):/:/|check-lead-merge.sh
37 refuse|product/tools/lead-merge.sh|s/^if \[ "\$n" != 0 \] \&\& \[ -z "\$blank" \]; then$/if false; then/|check-lead-merge.sh
37 page|product/tools/queue-batches.py|s/ > len(runs\["check_runs"\]):   # one page only/ < 0:   # one page only/|check-lead-merge.sh
37 unread|product/tools/queue-batches.py|s/^        return 3$/        return 0/|check-lead-merge.sh
37 watch|product/tools/lead-watch.sh|s/; say "\$qb"$//|check-lead-merge.sh'
MUT="$MUT"'
LRG access|product/tools/lead-read-gate.sh|s/ or any(.\[\]; test(\$access)) or / or false or /|check-lead-read-gate.sh
LRG route|product/tools/lead-read-gate.sh|s/(\$w and any(.\[\]; test(\$route)))))/($w and false)))/|check-lead-read-gate.sh
LRG hunk|product/tools/lead-read-gate.sh|s/else .\[-1\] += \[\$l\] end/else .[-1] += [ if $l[0:1] == " " then empty else $l end ] end/|check-lead-read-gate.sh
LRG whole|product/tools/lead-read-gate.sh|s/(\$w and any(\$n\[\]; test(\$whole; "i"))) as \$all/false as $all/|check-lead-read-gate.sh
LRG paths|product/tools/lead-read-gate.sh|s/^    hit=\$(paths <<< "\$names" . tick)$/    hit=""/|check-lead-read-gate.sh
LRG head|product/tools/lead-read-gate.sh|s/grep -x "\$head" >\/dev\/null; then/grep . >\/dev\/null; then/|check-lead-read-gate.sh
LRG writer|product/tools/lead-read-gate.sh|s/select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")/select(true)/|check-lead-read-gate.sh
LRG edited|product/tools/lead-read-gate.sh|s/select(.created_at != null and (.updated_at \/\/ .created_at) == .created_at)/select(true)/|check-lead-read-gate.sh
LRG bot|product/tools/lead-read-gate.sh|s/ and .user.login == "mergify\[bot\]" and .head.repo.full_name == \$r//|check-lead-read-gate.sh
LRG page|product/tools/lead-read-gate.sh|s/-lt 100 \] \&\& break/-lt 100000 ] \&\& break/|check-lead-read-gate.sh
LRG block|product/tools/lead-read-gate.sh|s/if \[ "\$MODE" = block \]; then s=failure;/if false; then s=failure;/|check-lead-read-gate.sh
LRG closed|product/tools/lead-read-gate.sh|s/^    \*) echo "#\$PR: \$why"; \[ -n "\$head" \] .. return 2; s=failure;/    *) s=success;/|check-lead-read-gate.sh
LRG list|product/tools/lead-read-paths.txt|/^\/api\/src\/platform\/identity\/$/d|check-lead-read-gate.sh
LRG main|../../.github/workflows/lead-read.yml|s/^  pull_request_target:$/  pull_request:/|check-lead-read-gate.sh'
MUT="$MUT"'
40 parts round|product/tools/check-guards.sh|s/\$((part - 1)) \] .. continue$/$((part - 1)) ] \&\& true/|check-guard-parts.sh
40 parts tests|product/tools/check-guards.sh|s/^if \[ "\$part" = 1 \]; then$/if true; then/|check-guard-parts.sh
40 parts refuse|product/tools/check-guards.sh|s/\[ "\$part" -le "\$parts" \] .. {/false \&\& {/|check-guard-parts.sh
40 parts matrix|../../.github/workflows/guards.yml|s/^        part: \[1, 2, 3, 4\]$/        part: [1, 2, 3]/|check-guard-parts.sh
40 parts always|../../.github/workflows/guards.yml|s/always() \&\& //|check-guard-parts.sh
40 parts result|../../.github/workflows/guards.yml|s/\[ "\$PARTS" = success \]/[ -n "$PARTS" ]/|check-guard-parts.sh
37 merge read|product/tools/lead-merge.sh|s/; then post "Lead read the diff: <head sha>" (P-423)//|check-lead-merge.sh
37 merge product|product/tools/lead-merge.sh|s/; a product PR is never merged by hand: it goes through the queue//|check-lead-merge.sh
37 merge order|product/tools/lead-merge.sh|s/  3\. only after step 1.s "Lead read the diff: <head sha>" line is on that exact head, and only for a tooling or records PR: /  3. /|check-lead-merge.sh'
MUT="$MUT"'
E5 pure|product/tools/cleanup-pr-check.sh|s/^  \[ "\$r" = 0 \] .. bad=1$/  true/|check-cleanup-pr.sh
E5 list|product/tools/cleanup-pr-check.sh|s/^  if \[ "\$lists" -gt 0 \]; then/  if false; then/|check-cleanup-pr.sh
E5 bulk|product/tools/cleanup-pr-check.sh|s/^  if \[ "\$moved" -ge "\$BULK" \]; then/  if false; then/|check-cleanup-pr.sh
E5 stale|product/tools/cleanup-pr-check.sh|s/^bash "\$TOOLS\/check-stale-paths.sh"; r=\$?/r=0/|check-cleanup-pr.sh
E5 ci|../../.github/workflows/pr-rules.yml|/cleanup-pr-check.sh" --base HEAD^1/d|check-cleanup-pr.sh
E5 move|product/tools/check-pure-move.sh|s/ \&\& { \[ "\$st" != R100 \] .. \[ "\$om" = "\$nm" \]; }//|check-cleanup-checks.sh'
MUT="$MUT"'
38 part|product/tools/ready-gate.py|s/            elif p in merged:/            elif True:/|check-ready-gate.sh
38 pr|product/tools/ready-gate.py|s/        mm = re.match(r"Merge pull request #(\[0-9\]+) from ", lines\[0\]) if lines else None/        mm = re.match(r"(.*)", lines[0]) if lines else None/|check-ready-gate.sh
38 journey|product/tools/ready-gate.py|s/        if not pl.get("journeyExists"):/        if False:/|check-ready-gate.sh
38 switch|product/tools/ready-gate.py|s/    if now < until:/    if True:/|check-ready-gate.sh
38 queue|../../.mergify.yml|/-check-failure = completes-ready/d|check-ready-gate.sh
38 records|product/tools/ready-gate.py|s/    if NOT_A_PART.match(title or \"\"):/    if False:/|check-ready-gate.sh
38 landed|product/tools/ready-gate.py|s/ \"--first-parent\", \"-m\",//|check-ready-gate.sh'
MUT="$MUT"'
761 tls|product/tools/gh.sh|s/^  if \[ -z "\${GH_TLS_NOTE_ONCE:-}" \] .. .*/  if true; then/|check-gh-fallback.sh
761 quiet|product/tools/branch-sweep.sh|/^  \[ "\$t" -ge "\$recent" \] .. continue$/d|check-branch-sweep.sh
761 one|product/tools/branch-sweep.sh|s/^  stale=\$((stale + 1)); echo "\$b: /  stale=$((stale + 1)); echo "ACT   \$b: /|check-branch-sweep.sh
761r req|product/tools/queue-red.py|s/n for n in f if n in req/n for n in f/|check-queue-red.sh
761r ci|product/tools/queue-red.py|s/ . MERGIFY$//|check-queue-red.sh
761r ready|product/tools/queue-red.py|s/, "completes-ready"}/}/|check-queue-red.sh
761r skel|product/tools/queue-red.py|s/, "skeleton"//|check-queue-red.sh
761r prr|product/tools/queue-red.py|s/, "pr-rules"//|check-queue-red.sh'
MUT="$MUT"'
29 scope|product/tools/stop-check.sh|s/scope=1   # P-756/scope=   # P-756/|check-stop-check.sh
29 owner|product/tools/stop-check.sh|s/if \[ -z "\$scope" \] .. \[ -z "\$pats" \] .. printf/if false \&\& printf/|check-stop-check.sh
29 renames|product/tools/stop-check.sh|s/ --no-renames//|check-stop-check.sh
29 crash|product/tools/stop-check.sh|/a crash blocks (fail closed)/d|check-stop-check.sh
29 unknown|product/tools/stop-check.sh|s/^  esac; }$/    *) echo "^an-unknown-line-is-the-lead.s$";;\n  esac; }/|check-stop-check.sh
29 e7gone|product/tools/stop-check.sh|/E7: the branch deleted or renamed the enforcer/d|check-stop-check.sh
29 e7ran|product/tools/stop-check.sh|/E7 (#2599) could not run/d|check-stop-check.sh'
# OMG (Lead 5 on #2915 and #3035, 23 Nov): the own-migration guard; each row switches one of its rules off.
MUT="$MUT"'
OMG mark|product/tools/own-migration-guard.py|s/^MARK = re.compile(.*/MARK = re.compile(r"own-migration-never-marked")/|check-own-migration-guard.sh
OMG snap|product/tools/own-migration-guard.py|s/^                if before and after and/                if False and/|check-own-migration-guard.sh
OMG alldb|product/tools/own-migration-guard.py|s/^    every = {i: set(PSQLDB.findall(l))/    every = {} and {i: set(PSQLDB.findall(l))/|check-own-migration-guard.sh
OMG named|product/tools/own-migration-guard.py|s/^            v = re.escape(m.group(1))/            v = "no-such-list"/|check-own-migration-guard.sh
OMG counts|product/tools/own-migration-guard.py|s/^                    if not dbs: return True/                    return False/|check-own-migration-guard.sh
OMG step|product/tools/own-migration-guard.py|s/^                nxt = next((j for j, n2 in own/                nxt = len(lines) if 1 else next((j for j, n2 in own/|check-own-migration-guard.sh
OMG steploop|product/tools/own-migration-guard.py|s/^                            and any(k > j and d2 \& set(dbs) for k, d2 in loop_lines(lines, n2))), len(lines))/                            ), len(lines))/|check-own-migration-guard.sh
OMG stepdb|product/tools/own-migration-guard.py|s/^                            and dbs and set(PSQLDB.findall/                            and True or set(PSQLDB.findall/|check-own-migration-guard.sh
OMG late|product/tools/own-migration-guard.py|s/^                if pre and nxt < len(lines):/                if False:/|check-own-migration-guard.sh
A348 retry bot|product/tools/retry-watch.py|s/(c.get("user") or {}).get("login") != "github-actions\[bot\]"/False/|check-retry-watch.sh
A348 retry phrase|product/tools/retry-watch.py|s/ or not PHRASE.search(b):/:/|check-retry-watch.sh
A348 retry plain|product/tools/retry-watch.py|s/^    for l in PLAIN.findall(body):/    for l in []:/|check-retry-watch.sh
A348 retry unread|product/tools/retry-watch.py|s/in names or \["(no suite read)"\]:/in names:/|check-retry-watch.sh
A348 retry page|product/tools/retry-watch.py|s/page = page + 1 if last == since else 1/page = page + 1; last = since/|check-retry-watch.sh
A348 retry second|product/tools/retry-watch.py|s/page = page + 1 if last == since else 1/page = 1/|check-retry-watch.sh
A348 retry cut|product/tools/retry-watch.py|s/^        if not whole:/        if False:/|check-retry-watch.sh
A348 retry keep|product/tools/retry-watch.py|s/"found": found}, open/"found": {}}, open/|check-retry-watch.sh
A348 retry memory|product/tools/retry-watch.py|s/^    if why:/    if False:/|check-retry-watch.sh
A348 retry line|product/tools/retry-watch.py|s/^FIX = .*/FIX = re.compile(r"Retry fix\\s*:\\s*(.+)")/|check-retry-watch.sh
A348 retry hidden|product/tools/retry-watch.py|s/HIDDEN.sub("", (p/str((p/|check-retry-watch.sh
A348 retry closed|product/tools/retry-watch.py|s/^            if p\["state"\] == "open" or m:/            if True:/|check-retry-watch.sh
A348 retry back|product/tools/retry-watch.py|s/ if (m is None or m >= t) and not/ if not/|check-retry-watch.sh
A348 retry own|product/tools/retry-watch.py|s/ and not (m and str(n) in prs)//|check-retry-watch.sh
A348 retry search|product/tools/retry-watch.py|s/^        n += 1$/        return out, ""/|check-retry-watch.sh
A348 retry wired|product/tools/lead-watch.sh|s/^rw=/# rw=/|check-retry-watch.sh
A348 retry ran|product/tools/lead-watch.sh|/retry-watch.py did not run/d|check-retry-watch.sh
A334 order|product/tools/app-view-check.sh|s/ -k1,1nr -k2,2nr)$/ -k1,1nr)/|check-lead-watch-idle.sh
A334 cloud|product/tools/app-view-check.sh|s/^  lane = (\$0 ~ \/ · cloud · /  lane = (\$0 ~ \/ · /|check-lead-watch-idle.sh
A334 first|product/tools/night-checklist.py|s/^    rows.sort(key=lambda r: (r\[0\], r\[1\]))$/    rows.sort(key=lambda r: r[1])/|check-lead-watch-idle.sh
A334 proof|product/tools/night-checklist.py|s/^            done = p\["pr"\] in merged$/            done = True/|check-lead-watch-idle.sh
A334 prose|product/tools/night-checklist.py|s/ from ", s)$/", s) or re.search(r"\\(#(\\d+)\\)", s)/|check-lead-watch-idle.sh
A334 brackets|product/tools/app-view-check.sh|s/^  rs = why; gsub.*/  rs = why/|check-lead-watch-idle.sh
A334 wired|product/tools/lead-watch.sh|/night-checklist.py" 2>&1); echo/d|check-lead-watch-idle.sh
A348 act|product/tools/proof-number.py|s/^    if apps and rp.*/    if False:/|check-proof-number.sh
A348 4h|product/tools/proof-number.py|s/^HOURS = 4/HOURS = 0/|check-proof-number.sh
A348 ist|product/tools/proof-number.py|s/^    mid = now.astimezone(fm.IST).replace/    mid = now.replace/|check-proof-number.sh
A348 streak|product/tools/proof-number.py|s/map(fm.proven_at, hist.values())/[ev[-1] for ev in hist.values()]/|check-proof-number.sh
A348 shallow|product/tools/proof-number.py|s/^    shallow = set(open.*/    shallow = set()/|check-proof-number.sh
A348 live|product/tools/proof-number.py|s/^    if live != .*/    if False:/|check-proof-number.sh
A348 first|product/tools/proof-number.py|s/git("log", "--first-parent", "-s",/git("log", "-s",/|check-proof-number.sh
A348 app|product/tools/proof-number.py|s/"web.src", //|check-proof-number.sh
A348 paths|product/tools/proof-number.py|s/^        if not git("ls-tree".*/        if False:/|check-proof-number.sh
A348 edge|product/tools/proof-number.py|s/^    if today is None or rp.*/    if False:/|check-proof-number.sh
A348 date|product/tools/flow-measure.py|s/^RELEASE_END = datetime(2026, 12, 13/RELEASE_END = datetime(2026, 11, 30/|check-proof-number.sh
A348 fetch|product/tools/lead-watch.sh|/origin.main not fetched/d|check-proof-number.sh
A348 ran|product/tools/lead-watch.sh|/proof-number.py did not run/d|check-proof-number.sh
A348 wired|product/tools/lead-watch.sh|s/^pn=/# pn=/|check-proof-number.sh'
# SPD2 (P-802, #3035): migration slots; each row switches one of migration-slots.py's rules off.
MUT="$MUT"'
SPD2 stamp|product/tools/migration-slots.py|s/^        elif s.group(1) <= floor:/        elif False:/|test-spd-2.sh
SPD2 area|product/tools/migration-slots.py|s/^    return bool(x and y and (x \& y or x \& wide or y \& wide))/    return False/|test-spd-2.sh
SPD2 multi|product/tools/migration-slots.py|s/^    for rx in MULTI_FORMS:/    for rx in []:/|test-spd-2.sh
SPD2 slot|product/tools/migration-slots.py|s/^        if area not in (.shared., \*BARRIER) and f.mig-{area}. not in scopes:/        if False:/|test-spd-2.sh'
# OS-18 (P-530): the 🔴 Waiting on the founder line; each row switches one of founder-wait.py's rules off.
MUT="$MUT"'
OS18 wait|product/tools/founder-wait.py|s/^        if waited >= WAIT_MIN and (since is None or since >= EVERY_MIN):/        if since is None or since >= EVERY_MIN:/|check-founder-wait.sh
OS18 hourly|product/tools/founder-wait.py|s/^        if waited >= WAIT_MIN and (since is None or since >= EVERY_MIN):/        if waited >= WAIT_MIN:/|check-founder-wait.sh
OS18 scope|product/tools/founder-wait.py|s/^            scope = ln\[3:\].strip().startswith("Start here")/            scope = True/|check-founder-wait.sh
OS18 memory|product/tools/founder-wait.py|s/^            push = now$/            pass/|check-founder-wait.sh
OS18 wired|product/tools/lead-watch.sh|s/^act=\$((act + \$(grep -c .^ACT. <<<"\$fw")))/act=$act/|check-founder-wait.sh'

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
