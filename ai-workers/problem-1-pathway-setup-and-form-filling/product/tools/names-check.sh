#!/usr/bin/env bash
# LR-155 slice (memory-enforcement audit 27 Nov, top 15 no. 5 (c); AGENTS rule 5, P-504): a PR's title and body are public
# like its commits, so they carry no personal name either. The push guard scans commits (push-guard.sh NAMES_RE); this
# runs the same pattern, read from push-guard.sh (one definition: a name added there is caught here too), on the text on
# stdin. pr-rules runs it on every PR's title and body, records-only PRs included. Exit 0 clean; 1 a name, with the rule,
# the place and the fix (LR-051 form); 2 the pattern cannot be read or grep cannot run it (fails closed: pr-rules is red,
# never a silent pass).
#   printf '%s\n%s\n' "$TITLE" "$BODY" | bash product/tools/names-check.sh
# Measured 28 Nov: 0 hits on the 173 non-batch PRs since 20 Nov; the 108 hits were all Mergify batch bodies (mergify/*
# branches, which pr-rules skips). Test: check-names-check.sh. US$0, no network.
set -u
G="$(dirname "$0")/push-guard.sh"
RE=$(sed -n "s/^NAMES_RE='\(.*\)'\$/\1/p" "$G" 2>/dev/null | head -1)
[ -n "$RE" ] || { echo "Rule AGENTS-5: names-check cannot read NAMES_RE from $G, so the PR text was not checked (fails closed). Fix: restore the NAMES_RE='...' line in push-guard.sh."; exit 2; }
text=$(cat)
hits=$(printf '%s\n' "$text" | grep -niE -e "$RE"); rc=$?   # grep's own status, not a pipe's: 1 is clean, 2 an error
case $rc in
  0) ;;
  1) echo "names-check: no personal name in the PR title or body"; exit 0;;
  *) echo "Rule AGENTS-5: names-check could not run the NAMES_RE pattern from $G (grep exit $rc), so the PR text was not checked (fails closed). Fix: correct the NAMES_RE='...' line in push-guard.sh."; exit 2;;
esac
where=$(printf '%s\n' "$hits" | cut -d: -f1 | uniq | head -5 | awk '{ printf "%sline %s", (NR>1 ? ", " : ""), $1 }')
echo "Rule AGENTS-5: the PR title or body holds a personal name ($where; line 1 is the title), and PR text is public like a commit (P-504). Fix: write the role instead (the founder, the tech lead, the immigration expert, Client A), edit the PR, and pr-rules runs again."
exit 1
