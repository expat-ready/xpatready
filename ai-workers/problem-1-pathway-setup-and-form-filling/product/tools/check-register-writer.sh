#!/usr/bin/env bash
# LR-178 (Lead 13, 28 Nov): a PR that is not records-only and changes the lab register fails pr-rules. Runs
# register-writer.sh on planted file lists and the pr-rules.yml step as written with a stand-in gh; no network, US$0.
#   bash product/tools/check-register-writer.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/regw.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; W="$ROOTD/.github/workflows/pr-rules.yml"; PAT="leaves the lab register to the records lane (LR-178)"
REG="$PRODREL/design/lab-register-2026-11-27.md"
rw() { o=$(bash "$TOOLS/register-writer.sh" 2>&1); r=$?; }

rw < <(printf '%s\n' "$PRODREL/tools/x.sh" ".github/workflows/ci.yml"); ok "(1) a code PR that leaves the register alone passes" "$([ $r = 0 ] && grep -q 'not changed' <<<"$o" && echo 1)" "exit $r: $o"
rw < <(printf '%s\n' "$PRODREL/tools/x.sh" "$REG"); ok "(2) a code PR that changes the register fails, naming the file and the Register: line" "$([ $r = 1 ] && grep -q '^::error' <<<"$o" && grep -qF "$REG" <<<"$o" && grep -q 'Register: LR-NNN' <<<"$o" && echo 1)" "exit $r: $o"
rw < <(printf '%s\n' "$PRODREL/design/lab-register-renamed.md" "$REG"); ok "(2) a rename away from the register (its old name in the list) fails too" "$([ $r = 1 ] && echo 1)" "exit $r: $o"
rw < <(printf '%s\n' "x/$REG" "$REG.bak" "$PRODREL/design/lab-register-2026-11-27.mdx"); ok "(3) look-alike paths do not count" "$([ $r = 0 ] && echo 1)" "exit $r: $o"
rw < <(true); ok "(3) an empty list passes" "$([ $r = 0 ] && echo 1)" "exit $r: $o"
rw < "$T"; ok "(3) an unreadable list exits 2 with an ::error line (fail closed)" "$([ $r = 2 ] && grep -q '^::error' <<<"$o" && echo 1)" "exit $r: $o"
# (5) The register file the tool names exists. Checked only where the checkout has a lab register at all (a mutation copy
# of the tools holds none); a register moved to a new dated file while REG still names the old one turns this red.
REGPATH=$(sed -n 's/^REG="\(.*\)"$/\1/p' "$TOOLS/register-writer.sh"); HAVE=$(ls "$ROOTD/$PRODREL/design/"lab-register-*.md 2>/dev/null | head -1)
if [ -n "$HAVE" ]; then ok "(5) the register file register-writer.sh names exists (a move to a new dated file turns this red)" "$([ -n "$REGPATH" ] && [ -f "$ROOTD/$REGPATH" ] && echo 1)" "REG=$REGPATH; on disk: $(ls "$ROOTD/$PRODREL/design/"lab-register-*.md 2>/dev/null | xargs -n1 basename | tr '\n' ' ')"; fi

# (4) The pr-rules step as written: skipped on records-only PRs; a failed file read fails the step (LR-043).
grep -F -- "- name: a PR that is not records-only $PAT" "$W" >/dev/null; ok "(4) the step is in pr-rules.yml" "$([ $? = 0 ] && echo 1)"
C=$(grep -F -A1 -- "$PAT" "$W" | tail -1)
grep -qF -- "steps.rec.outputs.records != 'yes'" <<<"$C"; ok "(4) the step is skipped on a records-only PR (the records lane's own PRs)" "$([ $? = 0 ] && echo 1)" "$C"
S=$(awk -v pat="$PAT" 'index($0, "- name: ") && index($0, pat) {on = 1; next} on && /^      - (name|uses):|^      #|^  [a-z]/ {exit}
  on && /run: \|/ {blk = 1; next} on && blk {sub(/^          /, ""); print}' "$W" \
  | sed -e 's/\${{ github.repository }}/o\/r/g' -e 's/\${{ github.event.pull_request.number }}/77/g')
mkdir -p "$T/bin"; cat > "$T/bin/gh" <<'GH'
#!/bin/sh
[ -n "$DOWN" ] && exit 1
case "$*" in *"repos/o/r/pulls/77/files"*) cat "$FL";; *) exit 1;; esac
GH
chmod +x "$T/bin/gh"
st() { o=$(cd "$ROOTD" && PATH="$T/bin:$PATH" FL="$1" DOWN="${2:-}" T="$TOOLS" bash -c "$S" 2>&1); r=$?; }
printf '%s\n' "$PRODREL/tools/x.sh" > "$T/clean"; printf '%s\n' "$PRODREL/tools/x.sh" "$REG" > "$T/dirty"
st "$T/clean"; ok "(4) the step passes a code PR without the register" "$([ $r = 0 ] && echo 1)" "exit $r: $o"
st "$T/dirty"; ok "(4) the step fails a code PR with the register" "$([ $r != 0 ] && grep -q 'REGISTER WRITTEN BY A CODE PR' <<<"$o" && echo 1)" "exit $r: $o"
st "$T/clean" down; ok "(4) a failed file read fails the step (LR-043)" "$([ $r != 0 ] && echo 1)" "exit $r: $o"
finish
