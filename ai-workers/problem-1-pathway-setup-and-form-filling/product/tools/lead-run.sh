#!/bin/bash
# Runs one of the Lead's tools from main's newest copy, never from the Lead's own branch (A363, founder 24 Nov: the Lead's
# branch had left main on 11 Nov; 153 tools were missing there and the rules on main could not run). From any copy, however
# old (no file of that copy is used):
#   git fetch -q origin main && git show origin/main:ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lead-run.sh | bash -s -- lead-watch.sh 30
#   ... -- takeover.sh       ... -- founder-report.py --short ...
# Each main sha gets its own small clone (shared objects, only product's tools and text records, about 15 MB; qa's pictures are not in it), complete before it is used and never
# changed after, so a run that is reading it is safe. STATE.md and state/ in it are links to this copy's own: the Lead's
# records stay the Lead's; everything else (DECISIONS, boards, cycle-plan) is main's. The tool runs in this copy's root.
# "lead-watch.sh gap" makes no network call: it runs from the newest clone already there.
# A fetch that fails runs nothing (exit 3). Clones this tool made and that are over 3 h old are removed, the newest 3 kept.
# Test: check-lead-run.sh.   Env: LEAD_RUN_DIR (where the clones are).
set -uo pipefail
PR=ai-workers/problem-1-pathway-setup-and-form-filling/product
BASE="${LEAD_RUN_DIR:-/private/tmp/claude-$(id -u)/lead-run}"
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "lead-run: not in a git copy" >&2; exit 3; }
tool="${1:-}"; case "$tool" in */*|""|.*) echo "lead-run: name a file of product/tools, e.g. lead-watch.sh" >&2; exit 2;; esac; shift
mkdir -p "$BASE" || exit 3
if [ "$tool" = lead-watch.sh ] && [ "${1:-}" = gap ]; then
  sha=$(for d in "$BASE"/*/; do d=${d%/}; [ -e "$d/.git/lead-run" ] && echo "$(cat "$d/.git/lead-run") ${d##*/}"; done | sort -rn | head -1 | cut -d' ' -f2)
  [ -n "$sha" ] || { echo "ACT   watchdog: no copy of main's tools here yet: run lead-run.sh lead-watch.sh once"; exit 1; }
else
  git -C "$ROOT" fetch -q origin main 2>/dev/null || { echo "ACT   tools: origin/main could not be fetched: nothing was run (an old tool is never run for a new one)"; exit 3; }
  sha=$(git -C "$ROOT" rev-parse FETCH_HEAD)
fi
D="$BASE/$sha"; now=$(date +%s)
if [ ! -e "$D/.git/lead-run" ]; then
  N=$(mktemp -d "$BASE/new.XXXXXXXX") || exit 3
  { git clone -q --shared --no-checkout "$ROOT" "$N/c" && git -C "$N/c" remote set-url origin "$(git -C "$ROOT" remote get-url origin)" \
    && git -C "$N/c" fetch -q --no-tags "$ROOT" "$sha" && git -C "$N/c" update-ref refs/remotes/origin/main "$sha" \
    && git -C "$N/c" sparse-checkout set --no-cone "/$PR/tools/" "/$PR/state/" "/$PR/rules/" "/$PR/*.md" "/$PR/*.json" "/$PR/design/*.md" "/$PR/design/*.tsv" "/$PR/design/*.json" "/$PR/qa/*.md" "/$PR/cockpit/*.json*" "/$PR/cockpit/*.tsv" "!/$PR/history/" "!/$PR/screens/" \
    && git -C "$N/c" checkout -q --detach "$sha"; } 2>/dev/null || { echo "ACT   tools: main's tools could not be copied (disk?): nothing was run"; rm -rf "${N:?}"; exit 3; }
  rm -rf "${N:?}/c/$PR/state" "${N:?}/c/$PR/STATE.md"; ln -s "$ROOT/$PR/state" "$N/c/$PR/state"; ln -s "$ROOT/$PR/STATE.md" "$N/c/$PR/STATE.md"
  echo "$now" > "$N/c/.git/lead-run"; mv "$N/c" "$D" 2>/dev/null; rm -rf "${N:?}"   # another run may have made it first: theirs is the same
  [ -e "$D/.git/lead-run" ] || { echo "ACT   tools: main's tools could not be copied: nothing was run"; exit 3; }
fi
[ "$(readlink "$D/$PR/STATE.md")" = "$ROOT/$PR/STATE.md" ] || { rm -f "${D:?}/$PR/STATE.md" "${D:?}/$PR/state"; ln -s "$ROOT/$PR/state" "$D/$PR/state"; ln -s "$ROOT/$PR/STATE.md" "$D/$PR/STATE.md"; }
[ "${1:-}" = gap ] || echo "$now" > "$D/.git/lead-run"
i=0; for x in $(for d in "$BASE"/*/; do d=${d%/}; [ -e "$d/.git/lead-run" ] && echo "$(cat "$d/.git/lead-run"):${d##*/}"; done | sort -rn); do
  i=$((i + 1)); [ "$i" -gt 3 ] && [ $((now - ${x%%:*})) -gt 10800 ] && grep -qxE '[0-9a-f]{40}' <<<"${x#*:}" && rm -rf "${BASE:?}/${x#*:}"; done
[ -f "$D/$PR/tools/$tool" ] || { echo "lead-run: no $tool in product/tools on main ${sha:0:9}" >&2; exit 2; }
cd "$ROOT" || exit 3; export LEAD_RUN_ROOT="$ROOT"
case "$tool" in *.py) exec python3 -I "$D/$PR/tools/$tool" "$@";; *) exec bash "$D/$PR/tools/$tool" "$@";; esac
