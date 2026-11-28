#!/usr/bin/env bash
# LR-155 slice (audit top 15 no. 5 (c)): names-check.sh refuses a personal name in a PR's title or body, with the same
# pattern as the push guard. No name is written here (the push guard would refuse this file): the test takes the first
# name from push-guard.sh's NAMES_RE at run time. US$0, no network.
#   bash product/tools/check-names-check.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
C="$TOOLS/names-check.sh"
RE=$(sed -n "s/^NAMES_RE='\(.*\)'\$/\1/p" "$TOOLS/push-guard.sh" | head -1)
N=$(printf '%s' "$RE" | sed -E 's/^\\b\(//; s/[|)].*//')   # the first name in the pattern
ok "a name is read from push-guard.sh's NAMES_RE" "$([ -n "$N" ] && printf '%s' "$N" | grep -qE '^[A-Z][a-z]+$' && echo 1)" "got: $N"
t() { printf '%s' "$1" | bash "$C" 2>&1; }
out=$(t "pipeline: a tool fix
The founder asked for it; the tech lead read it."); r=$?
ok "a body with roles only passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
out=$(t "pipeline: a tool fix
Asked by $N on 28 Nov."); r=$?
ok "a name in the body fails, naming the line, the rule and the fix" "$([ $r = 1 ] && grep -q '^Rule AGENTS-5: .*line 2.*Fix: write the role' <<<"$out" && echo 1)" "exit $r: $out"
lower=$(printf '%s' "$N" | tr 'A-Z' 'a-z')
out=$(t "screens: for $lower"); r=$?
ok "a name in the title fails, in any case (line 1)" "$([ $r = 1 ] && grep -q 'line 1' <<<"$out" && echo 1)" "exit $r: $out"
out=$(t "pipeline: ${N}son and x${lower}y"); r=$?
ok "a longer word that contains a name passes (word boundaries)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
T=$(mktemp -d "${TMPDIR:-/tmp}/nc.XXXXXXXX"); trap 'rm -rf "${T:?}"' EXIT
cp "$C" "$T/"; printf '#!/bin/bash\n# no pattern here\n' > "$T/push-guard.sh"
out=$(printf 'x\n' | bash "$T/names-check.sh" 2>&1); r=$?
ok "no NAMES_RE in push-guard.sh: fails closed, exit 2, never a pass" "$([ $r = 2 ] && grep -q 'fails closed' <<<"$out" && echo 1)" "exit $r: $out"
ok "pr-rules runs names-check on the title and body of every PR, records too" "$(f="$TOOLS/../../../../.github/workflows/pr-rules.yml"; grep -qF 'run: printf '"'"'%s\n%s\n'"'"' "$TITLE" "$BODY" | bash "$T/names-check.sh"' "$f" && ! grep -B2 -F 'bash "$T/names-check.sh"' "$f" | grep -q "records != 'yes'" && echo 1)"
finish
