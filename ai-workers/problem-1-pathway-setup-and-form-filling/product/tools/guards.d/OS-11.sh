# OS-11 / A363, A368 (founder 24 Nov, #3506): the Lead's tools are main's (tools-fresh.py), its copy under 24 h old
# (copy-age.sh; takeover.sh refuses), its plan this cycle's (plan-fresh.py); founder-report.py prints no report without a yes.
TESTS="$TESTS check-tools-fresh.sh"
MUT="$MUT"'
A363 fetch|product/tools/tools-fresh.py|s/git(\*fetch, limit=10)/pass/|check-tools-fresh.sh
A363 head|product/tools/tools-fresh.py|s/ "--no-write-fetch-head",//|check-tools-fresh.sh
A363 keep|product/tools/tools-fresh.py|s/ --overlay//|check-tools-fresh.sh
A363 stage|product/tools/tools-fresh.py|s/ --worktree -- / --staged --worktree -- /|check-tools-fresh.sh
A363 old|product/tools/tools-fresh.py|s/ or git("log", "-1", .*strip()$//|check-tools-fresh.sh
A363 clash|product/tools/tools-fresh.py|s/^        stuck = .*/        stuck = []/|check-tools-fresh.sh
A363 merge|product/tools/tools-fresh.py|s/ "--first-parent", "--diff-merges=first-parent",//|check-tools-fresh.sh
A363 here|product/tools/tools-fresh.py|s/ or os.path.realpath(HERE) != .*/:/|check-tools-fresh.sh
A363 mode|product/tools/tools-fresh.py|s/"100755" if os.access(at(p), os.X_OK) else "100644")/want.get(p, ("", ""))[1])/|check-tools-fresh.sh
A368 fetched|product/tools/copy-age.sh|s/^  \[ "\${FETCHED:-}" = 1 \] .*/  :/|check-tools-fresh.sh
A368 unknown|product/tools/takeover.sh|/^  \[ "\$r" != 1 \] .*REFUSED: main/d|check-tools-fresh.sh
A363 edit|product/tools/tools-fresh.py|s/(old if mains else edited)/old/|check-tools-fresh.sh
A363 miss|product/tools/tools-fresh.py|s/^        missing = .*/        missing = []/|check-tools-fresh.sh
A363 floor|product/tools/tools-fresh.py|s/if len(want) < (1 if .*/if False:/|check-tools-fresh.sh
A363 report|product/tools/founder-report.py|s/^    if not a.fixture:.*/    if False:/|check-tools-fresh.sh
A363 stale|product/tools/founder-report.py|s/^    stale = .*/    stale = False/|check-tools-fresh.sh
A363 plan|product/tools/plan-fresh.py|s/if got == cycle:/if True:/|check-tools-fresh.sh
A363 seven|product/tools/plan-fresh.py|s/timedelta(hours=7))/timedelta(hours=0))/|check-tools-fresh.sh
A363 first|product/tools/lead-watch.sh|/^pf=/d|check-tools-fresh.sh
A368 hours|product/tools/copy-age.sh|s/^\[ "\$h" -lt 24 \]/true/|check-tools-fresh.sh
A368 own|product/tools/copy-age.sh|s/git rev-list --first-parent origin.main/git merge-base HEAD origin\/main/|check-tools-fresh.sh
A368 quiet|product/tools/copy-age.sh|s/^if \[ "\$lo" = 0 \]; then/if false; then/|check-tools-fresh.sh
A368 clock|product/tools/copy-age.sh|s/ \[ "\$t" -le "\$now" \] .*clock"//|check-tools-fresh.sh
A368 take|product/tools/takeover.sh|s/^  exit 3$/  :/|check-tools-fresh.sh
A368 watch|product/tools/lead-watch.sh|s/ \[ "\$r" = 1 \] \&\& ca="ACT .*; \[ "\$r" -gt 1 \]/ [ "$r" -gt 1 ]/|check-tools-fresh.sh
A368 start|product/tools/session-start.sh|s/ fe=1; grep -q "could not be reached" <<<"\$behind" \&\& fe=""; age=\$(FETCHED=\$fe bash "\$PH\/tools\/copy-age.sh" 2>\/dev\/null);;/;;/|check-tools-fresh.sh'
