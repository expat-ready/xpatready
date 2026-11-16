#!/usr/bin/env bash
# The eight guards of 6 Nov, B134's label sweep (7 Nov), B170a's engine test PDFs (L1, 11 Nov), D3's comment trigger (P-506, 12 Nov), rule triage (guard 14) and B194's queue gate (guard 15, 16 Nov), B193 part 2's Lead hooks (16-21, 16 Nov) (founder, ~03:00 IST: "fix it so that it becomes a hard rule and it never messes up"), each
# with its test. --mutate also proves each test fails without its guard: in a throwaway copy of the tools, the guard is
# switched off by one edit and its test must go red. Run by .github/workflows/guards.yml. US$0, no network.
#   bash product/tools/check-guards.sh [--mutate]
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; P=ai-workers/problem-1-pathway-setup-and-form-filling
TESTS="check-current-lead.sh check-items.sh check-handover.sh check-label-guard.sh check-lane-preflight.sh check-isolated-ttl.sh check-gh-fallback.sh check-state-page.sh check-lead-cron.sh check-lead-heartbeat.sh check-label-sweep.sh check-rules-lag.sh check-push-guard-fixtures.sh check-comment-run.sh check-outside-deps-watch.sh check-rule-triage.sh check-queue-gate.sh check-queued-push-guard.sh check-lead-read-guard.sh check-gmail-start-check.sh check-lead-act-check.sh check-wip-guard.sh check-ist-time-guard.sh check-lead-watch-board.sh"
bad=0
for t in $TESTS; do bash "$TOOLS/$t" > "${TMPDIR:-/tmp}/guard-$$.log" 2>&1; r=$?; echo "$( [ $r = 0 ] && echo PASS || echo FAIL )  $t ($(tail -1 "${TMPDIR:-/tmp}/guard-$$.log"))"
  [ $r = 0 ] || { bad=1; grep '^FAIL' "${TMPDIR:-/tmp}/guard-$$.log" | sed 's/^/      /'; }; done
rm -f "${TMPDIR:-/tmp}/guard-$$.log"
[ "${1:-}" = --mutate ] || exit $bad
# guard | file the edit goes in | sed edit that switches the guard off (no | or ' in it: .. stands for || and . for ') | the test that must then fail
MUT='1|product/tools/check-docs.sh|/CURRENT LEAD: STATE.md has/d|check-current-lead.sh
2|product/tools/label-guard.sh|s/^# No review for the head.*/exit 0/|check-label-guard.sh
2 walk|product/tools/label-guard.sh|s/^  c=\$next; merges=.*/  exit 0/|check-label-guard.sh
2 who|product/tools/label-guard.sh|s/^team=.*/team=true/|check-label-guard.sh
2 labeled|../../.github/workflows/label-guard.yml|s/types: \[synchronize, labeled, opened\]/types: [synchronize, opened]/|check-label-guard.sh
2 after|../../.github/workflows/label-guard.yml|s/^\( *AFTER: \).*/\1${{ github.event.after }}/|check-label-guard.sh
3|product/tools/lane-preflight.sh|/under ${min} GB;/d|check-lane-preflight.sh
4 ttl|prototype/studio/tools/isolated.sh|s/\$(( TTL \* \${ISOLATED_TTL_UNIT:-60} ))/999999/|check-isolated-ttl.sh
4 cap|prototype/studio/tools/isolated.sh|s/COPY_CAP:-4} ))/COPY_CAP:-99} ))/|check-isolated-ttl.sh
5|product/tools/factory-board.sh|s/; gh() { bash "\$TOOLS\/gh.sh" "\$@"; }//|check-gh-fallback.sh
6|product/tools/check-docs.sh|/STATE TOO BIG/d|check-state-page.sh
7|product/tools/check-docs.sh|s/if m > 30:/if False:/|check-state-page.sh
8|product/tools/lead-check-guard.sh|s/^\[ -z "\$why" \] \&\& exit 0/exit 0/|check-lead-cron.sh
9|product/tools/label-sweep.sh|s/^  if \[ "\$who" != "\$BOT" \]; then/  if true; then/|check-label-sweep.sh
9 sched|../../.github/workflows/label-guard.yml|/cron: "\*\/10 \* \* \* \*"/d|check-label-sweep.sh
9 queued|../../.github/workflows/label-guard.yml|/event_name == .schedule./s/ .. (github.event.action == .labeled. \&\& github.event.label.name == .queued.)//|check-label-sweep.sh
9 guardq|../../.github/workflows/label-guard.yml|/review: approved.) .. (github.event.action/s/ .. github.event.label.name == .queued.)"/)"/|check-label-guard.sh
9 batch|../../.github/workflows/label-guard.yml|s/types: \[synchronize, labeled, opened\]/types: [synchronize, labeled]/|check-label-sweep.sh
9 ci|../../.github/workflows/label-guard.yml|/    workflows: \[ci\]/d|check-label-sweep.sh
10|product/tools/check-docs.sh|s/-gt 3 \]/-gt 999 ]/|check-rules-lag.sh
11|product/tools/push-guard.sh|s/^\( *\)\[ "\$h" = "\$want" \] \(..\)/\1true \2/|check-push-guard-fixtures.sh
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
15 sweep|product/tools/label-sweep.sh|s/^  if \[ "\$e" = 0 \] .. PR=/  if false \&\& PR=/|check-label-sweep.sh
15 queue|../../.mergify.yml|/check-success = queue-fresh/d|check-queue-gate.sh
15 pending|product/tools/queue-gate.sh|s/^  has "\$LABEL" .. \[ "\${LABELLING:-}" = 1 \]/  true/|check-queue-gate.sh
15 order|product/tools/queue-gate.sh|s/^  LABELLING=1 fresh .. return 2; did_fresh=1/  did_fresh=0/|check-queue-gate.sh
15 time|product/tools/queue-gate.sh|s/\[\[ "\$ts" > "\$run_started" \]\] .. continue/continue/|check-queue-gate.sh
15 shared|product/tools/queue-gate.sh|s/^    if \[ -n "\$both" \]; then/    if false; then/|check-queue-gate.sh
15 verdict|product/tools/queue-gate.sh|s/^    \[ "\$keep" = 1 \] .. last=\$l; done/    last=$l; done/|check-queue-gate.sh
15 comment|../../.github/workflows/queue-gate.yml|/comment.author_association/d|check-queue-gate.sh
16 source|product/tools/cockpit-data.py|s/                elif st != "open":/                elif False:/|check-lead-watch-board.sh
16 count|product/tools/lead-watch.sh|s/; echo "\$bw"; act=\$((act + \$(grep -c .^ACT. <<<"\$bw")))/; echo "$bw"/|check-lead-watch-board.sh
16|product/tools/queued-push-guard.sh|s/.name == "queued"/.name == "never"/|check-queued-push-guard.sh
17|product/tools/lead-read-guard.sh|s/^  \[ -z "\$files" \] \&\& return 0/  return 0/|check-lead-read-guard.sh
17 head|product/tools/lead-read-guard.sh|s/case "\$head" in "\$s"\*)/case "\$head" in *)/|check-lead-read-guard.sh
18|product/tools/gmail-start-check.sh|s/^\[ "\$state" = ok \] \&\& exit 0/exit 0/|check-gmail-start-check.sh
19 check|product/tools/lead-act-check.sh|s/-gt "\$CHECK_MIN" \]/-gt 99999 ]/|check-lead-act-check.sh
19 board|product/tools/lead-act-check.sh|s/-gt "\$BOARD_MIN" \]/-gt 99999 ]/|check-lead-act-check.sh
20|product/tools/wip-guard.py|s/^MAX_WAITING, MAX_HOURS = 2, 24/MAX_WAITING, MAX_HOURS = 99, 9999/|check-wip-guard.sh
20 bug|product/tools/wip-guard.py|s/ & open_bugs(root):/ or True:/|check-wip-guard.sh
21|product/tools/ist-time-guard.py|s/                if not ok:/                if False:/|check-ist-time-guard.sh'
pyparse() { python3 -I -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "${@: -1}"; }   # "$sh -n FILE" for a .py
echo "--- each test without its guard (must FAIL)"
while IFS='|' read -r g f edit t; do
  M=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$M" ] || { echo "no temp dir: nothing was checked"; exit 2; }; mkdir -p "$M/$P/product" "$M/$P/prototype/studio" "$M/.claude" "$M/.github/workflows" "$M/$P/product/qa"
  cp -R "$TOOLS" "$M/$P/product/"; cp -R "$ROOTD/$P/prototype/studio/tools" "$M/$P/prototype/studio/"
  cp "$ROOTD/$P/product/qa/CAPABILITIES.md" "$M/$P/product/qa/"; cp -R "$ROOTD/.claude/skills" "$ROOTD/.claude/settings.json" "$M/.claude/"
  cp "$ROOTD/.github/workflows/"*.yml "$M/.github/workflows/"; cp "$ROOTD/.mergify.yml" "$M/"; git -C "$M" init -q   # every workflow: check-label-guard parses two
  for x in $(cd "$ROOTD" && ls packages/xfa-engine/fixtures/synthetic/*.pdf packages/xfa-engine/src/__tests__/fixtures/*.pdf 2>/dev/null); do mkdir -p "$M/$(dirname "$x")"; cp "$ROOTD/$x" "$M/$x"; done   # guard 11 needs the real bytes
  before=$(cksum < "$M/$P/$f"); sed -i.bak "$edit" "$M/$P/$f"; rm -f "$M/$P/$f.bak"
  sh=bash; head -1 "$M/$P/$f" | grep -q zsh && sh=zsh; case "$f" in *.yml) sh=true;; *.py) sh=pyparse;; esac   # a .yml is parsed by its test; a .py by ast (B192)
  if [ "$before" = "$(cksum < "$M/$P/$f")" ]; then echo "FAIL  guard $g: the edit '$edit' changed nothing in $f"; bad=1
  elif ! $sh -n "$M/$P/$f" 2>"$M/log"; then echo "FAIL  guard $g: the edit '$edit' breaks $f's syntax, so its test failing proves nothing ($(head -1 "$M/log"))"; bad=1
  elif bash "$M/$P/product/tools/$t" > "$M/log" 2>&1; then echo "FAIL  guard $g: $t still passes with the guard off"; bad=1
  else echo "PASS  guard $g off → $t fails ($(tail -1 "$M/log"); first: $(grep -m1 '^FAIL' "$M/log" | cut -c7-90))"; fi
  rm -rf "$M"
done <<< "$MUT"
exit $bad
