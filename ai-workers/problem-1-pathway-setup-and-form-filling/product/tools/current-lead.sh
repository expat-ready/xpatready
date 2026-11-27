#!/bin/bash
# Who is the tech lead now (founder, 6 Nov ~03:00 IST: lanes always report to the current Lead). Prints the one
# `current_lead: <session id> <title>` line without its prefix; --id prints the session id only.
# The line lives in CURRENT-LEAD.md (public, one line; private split PS-1b, design/private-split-plan-2026-11-27.md),
# since STATE.md moves to the private repository; until it has gone, a ref whose newest change is to STATE.md is read there.
# The Lead's records reach main once a day (P-336), so this reads the freshest STATE.md on GitHub: origin/main and every
# origin/lead/* branch, taking the one whose last STATE.md commit is newest; a copy with no origin reads its own file.
# Exit 1 when that STATE.md has no current_lead line or more than one (check-docs.sh refuses both).
# --where prints where the line was read (refs/remotes/origin/main, refs/remotes/origin/lead/<name>, or "STATE.md (this
# copy)") instead of the line; check-docs.sh uses it when main's STATE.md has no line (the Lead keeps STATE on lead/*).
# Usage: bash product/tools/current-lead.sh [--id | --where] [--no-fetch]
id_only=0; where=0; fetch=1; for a in "$@"; do case "$a" in --id) id_only=1;; --where) where=1;; --no-fetch) fetch=0;; esac; done
cd "$(dirname "$0")/.." || exit 2
pre="$(git rev-parse --show-prefix 2>/dev/null)"; rel="${pre}STATE.md"; crel="${pre}CURRENT-LEAD.md"
# The file a ref holds the line in: of CURRENT-LEAD.md and STATE.md, the one with a line whose last change to a
# current_lead: line on that ref is newer (a tie goes to CURRENT-LEAD.md), so an unrelated STATE.md edit never makes an
# older line win on that ref (#3924 review note). A hand-over made with an older handover.sh rewrites STATE.md only; the
# newer STATE.md line then still wins after a merge brings an older CURRENT-LEAD.md along (#3924 review). Refs stay ordered
# by any commit to either file: -G there walks every old lead/* branch's history (8.3 s instead of 1.3 s, #3941 review).
line_of() { local f l t bt=-1 bl=""
  for f in "$crel" "$rel"; do l=$(git show "$1:$f" 2>/dev/null | grep '^current_lead: ') || continue
    t=$(git log -1 --format=%ct -G'^current_lead: ' "$1" -- ":/$f" 2>/dev/null); t=${t:-0}; [ "$t" -gt "$bt" ] && { bt=$t; bl=$l; }; done
  [ -n "$bl" ] && printf '%s\n' "$bl"; }
best=""
if git remote get-url origin >/dev/null 2>&1; then
  [ "$fetch" = 1 ] && git fetch -q origin main 'refs/heads/lead/*:refs/remotes/origin/lead/*' 2>/dev/null
  # Newest STATE.md or CURRENT-LEAD.md commit first; read refs only until one has the line (a blob:none CI copy fetches
  # each file it reads; line_of's -G walks only that ref's two files).
  while read -r t ref; do
    line_of "$ref" >/dev/null && { best=$ref; break; }
  done < <(for ref in $(git for-each-ref --format='%(refname)' refs/remotes/origin/main 'refs/remotes/origin/lead/'); do
    t=$(git log -1 --format=%ct "$ref" -- STATE.md CURRENT-LEAD.md 2>/dev/null); [ -n "$t" ] && echo "$t $ref"; done | sort -s -k1,1nr)
fi
if [ -n "$best" ]; then lines=$(line_of "$best"); src="$best"
elif [ -f CURRENT-LEAD.md ]; then lines=$(grep '^current_lead: ' CURRENT-LEAD.md 2>/dev/null); src="CURRENT-LEAD.md (this copy)"
else lines=$(grep '^current_lead: ' STATE.md 2>/dev/null); src="STATE.md (this copy)"; fi
n=$(printf '%s' "$lines" | grep -c '^current_lead: ')
[ "$n" -eq 1 ] || { echo "current-lead: $src has $n current_lead lines, needs exactly one; ask with ListAgents (the \"Lead N ·\" row not ended or standby; numbers restart per series, P-433, so never the highest number)" >&2; exit 1; }
v=${lines#current_lead: }
if [ "$where" = 1 ]; then echo "$src"; exit 0; fi
# A session id first (letters, "_", then at least 8 of [A-Za-z0-9_-]: local_<uuid>, session_<id>), then a title naming
# "Lead N"; "current_lead: Lead 21 · … Lead 20" would give --id "Lead" and route every lane nowhere (#1136 Devin review).
echo "$v" | grep -qE '^[A-Za-z]+_[A-Za-z0-9_-]{8,} .*Lead [0-9]+' || { echo "current-lead: $src's current_lead line does not start with a session id, then a title naming \"Lead N\": $v" >&2; exit 1; }
if [ "$id_only" = 1 ]; then echo "${v%% *}"; else echo "$v"; fi
