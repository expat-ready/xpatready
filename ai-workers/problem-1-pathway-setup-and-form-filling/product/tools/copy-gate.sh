#!/usr/bin/env bash
# LR-166 (founder A455, 28 Nov: "I don't want stale main copy ... Is there any layer which can get rid of?"): a copy over
# COPY_GATE_BEHIND (20) commits behind origin/main, or whose base (merge-base with origin/main) is over COPY_GATE_HOURS (24)
# older than main's tip, is refused, not warned. lead-watch.sh runs this on its own copy before any other step and exits 3
# on a refusal (so no check, and no check stamp, comes from stale tools); session-start.sh prints the same line.
#   copy-gate.sh [dir]   one line: "copy   gate ok: ..." exit 0, or "ACT   stale copy (LR-166): ... : <command>" exit 3
# The command: the recut (`git switch -C lead/<today IST> origin/main`) when nothing exists only here and no tracked file is
# changed; else a fresh clone beside this copy (work here is never touched). origin/main unreadable is a refusal too (fails
# closed). It fetches origin main first (COPY_GATE_NOFETCH=1: the caller just fetched); a failed fetch is said in the line.
# Env: COPY_GATE_BEHIND, COPY_GATE_HOURS, COPY_GATE_NOFETCH, NOW (epoch, tests). Test: check-copy-gate.sh.
set -u
D=${1:-.}; B=${COPY_GATE_BEHIND:-20}; H=${COPY_GATE_HOURS:-24}; M=origin/main; now=${NOW:-$(date +%s)}
g() { git -C "$D" "$@"; }
today() { TZ=Asia/Kolkata date -d "@$now" +%Y-%m-%d 2>/dev/null || TZ=Asia/Kolkata date -r "$now" +%Y-%m-%d; }
root=$(g rev-parse --show-toplevel 2>/dev/null) || { echo "ACT   stale copy (LR-166): $D is not a git copy: clone one: git clone https://github.com/expat-ready/xpatready.git"; exit 3; }
note=""
if [ -z "${COPY_GATE_NOFETCH:-}" ]; then
  # Bounded on HTTPS (lowSpeed) and on ssh (a connect and keep-alive limit, unless the caller set its own GIT_SSH_COMMAND).
  GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o ConnectTimeout=15 -o ServerAliveInterval=5 -o ServerAliveCountMax=3}" \
    g -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=20 fetch -q origin main 2>/dev/null || note=" (origin was not fetched now: judged on the origin/main held here)"
fi
clone="git clone https://github.com/expat-ready/xpatready.git \"$(dirname "$root")/xpatready-$(today)\" && cd \"$(dirname "$root")/xpatready-$(today)\" && git switch -c lead/$(today)"
g rev-parse -q --verify "$M^{commit}" >/dev/null && mb=$(g merge-base HEAD "$M" 2>/dev/null) \
  || { echo "ACT   stale copy (LR-166): $M is not readable in $root$note: git -C \"$root\" fetch origin main, or $clone"; exit 3; }
behind=$(g rev-list --count "HEAD..$M"); age_h=$(( ($(g log -1 --format=%ct "$M") - $(g log -1 --format=%ct "$mb")) / 3600 ))
line="${behind} behind $M, base ${age_h} h older than its tip"
if [ "$behind" -le "$B" ] && [ "$age_h" -le "$H" ]; then echo "copy   gate ok: $line$note (LR-166: at most $B behind, $H h)"; exit 0; fi
why=""; [ "$behind" -gt "$B" ] && why="over $B behind"; [ "$age_h" -gt "$H" ] && why="${why:+$why and }base over $H h old"
unpushed=$(g rev-list --count HEAD --not --remotes 2>/dev/null || echo "?"); dirty=$(g status --porcelain --untracked-files=no 2>/dev/null | head -1)
# switch -C also resets a local lead/<today> that is not checked out: one holding a commit not on main gets the clone command
# (as lead-age.sh recut, review of #3926 Major; review of LR-166).
extra=0; new="lead/$(today)"
[ "$(g branch --show-current 2>/dev/null)" != "$new" ] && g rev-parse -q --verify "refs/heads/$new" >/dev/null && extra=$(g rev-list --count "$new" --not "$M" 2>/dev/null || echo "?")
if [ "$unpushed" = 0 ] && [ -z "$dirty" ] && [ "$extra" = 0 ]; then
  cmd="git -C \"$root\" fetch origin main && git -C \"$root\" switch -C lead/$(today) $M && git -C \"$root\" config branch.lead/$(today).remote origin && git -C \"$root\" config branch.lead/$(today).merge refs/heads/lead/$(today)"
else cmd="$clone (this copy has ${unpushed} commit(s) only here${dirty:+ and changed files}$([ "$extra" = 0 ] || echo "; its $new holds $extra commit(s) not on main"): push them from it, never lost)"; fi
echo "ACT   stale copy (LR-166): $line ($why)$note: refused; $cmd"
exit 3
