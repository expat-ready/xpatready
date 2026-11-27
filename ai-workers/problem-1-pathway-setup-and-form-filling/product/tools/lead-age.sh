#!/usr/bin/env bash
# LR-156 (founder A433/A434, 27 Nov: "whether it should be always on the live main or cutting every 24 h ... best in class,
# industry standard ... implement so it never gets missed"; design: design/stale-pointers-research-2026-11-27.md).
# Trunk-based development: what the Lead RUNS is always live main; what it WRITES lives on a lead/<date> branch under 24 h,
# cut from origin/main (P-388). A Lead copy is stale when its merge-base with origin/main is over LEAD_STALE_HOURS (24)
# older than main's tip, or it is over LEAD_STALE_BEHIND (200) commits behind.
#   lead-age.sh [line]         one line: "lead copy: <branch> · base <h> h old · <n> behind origin/main"; exit 1 when stale
#   lead-age.sh stale          exit 0 when this lead/* copy is stale, 1 otherwise (lane.sh whoami: lead-stale); silent
#   lead-age.sh recut          session-start.sh in the Lead's copy, after its fetch. On lead/*: when nothing is unpushed
#                              (every commit on a remote branch), no tracked file is changed, and either its own commits
#                              are all in origin/main and main moved on (a branch of an earlier day only), or the base is
#                              over 24 h older than main's tip; never after a failed fetch (LEAD_FETCH_FAILED), never over
#                              an existing local lead/<today> holding commits not on main:
#                              `git switch -C lead/<today IST> origin/main`, the upstream set to
#                              origin/lead/<today>, one line printed. When it cannot (unpushed or changed files): a LOUD
#                              warning with the exact commands. Never loses work: it refuses whenever a commit exists only
#                              here or a tracked file is changed.
#   lead-age.sh watch [sec]    the zero-token watch line (Monitor): every 180 s, prints "STALE-COPY ..." when the copy
#                              turns stale (and again when it changes), nothing otherwise. No API call, no tokens.
#   lead-age.sh ci <base> <head>   a records or lead/* PR whose merge-base with the base is over 24 h older than the base
#                              tip fails, naming the recut command (exit 1); ci-json reads the same from GitHub's compare
#                              answer on stdin (pr-rules.yml: its checkout holds 2 commits, so no git history there).
# Env: LEAD_STALE_HOURS, LEAD_STALE_BEHIND, LEAD_MAIN (origin/main), NOW (epoch, tests). Test: check-lead-age.sh.
set -u
H=${LEAD_STALE_HOURS:-24}; B=${LEAD_STALE_BEHIND:-200}; M=${LEAD_MAIN:-origin/main}; now=${NOW:-$(date +%s)}
today() { TZ=Asia/Kolkata date -d "@$now" +%Y-%m-%d 2>/dev/null || TZ=Asia/Kolkata date -r "$now" +%Y-%m-%d; }
br=$(git branch --show-current 2>/dev/null)
measure() {  # → $mb $age_h $behind $mine (commits on HEAD not in main); 1 when main is unreadable
  git rev-parse -q --verify "$M^{commit}" >/dev/null || return 1
  mb=$(git merge-base HEAD "$M" 2>/dev/null) || return 1
  # Against main's tip, not the clock (review of #3926, m3): a quiet main (no merges for a day) never makes a copy stale.
  age_h=$(( ($(git log -1 --format=%ct "$M") - $(git log -1 --format=%ct "$mb")) / 3600 ))
  behind=$(git rev-list --count "HEAD..$M"); mine=$(git rev-list --count "$M..HEAD"); }
is_stale() { [ "$age_h" -gt "$H" ] || [ "$behind" -gt "$B" ]; }
recut_cmd() { echo "git fetch origin main && git switch -C lead/$(today) $M && git config branch.lead/$(today).remote origin && git config branch.lead/$(today).merge refs/heads/lead/$(today)"; }
case "${1:-line}" in
  line)
    measure || { echo "lead copy: $M not readable here (git fetch origin main)"; exit 1; }
    l="lead copy: ${br:-detached} · base ${age_h} h old · ${behind} behind $M"
    if is_stale; then echo "$l · STALE (over ${H} h or ${B} behind): $(recut_cmd) (LR-156, P-388)"; exit 1; fi
    echo "$l"; exit 0;;
  stale)
    case "$br" in lead/*) ;; *) exit 1;; esac
    measure || exit 1; is_stale;;
  recut)
    case "$br" in lead/*) ;; *) exit 0;; esac
    measure || exit 0
    new="lead/$(today)"
    # The fetch failed: origin/main may be old, so no recut on it (review of #3926, m3); the age line still prints.
    [ -n "${LEAD_FETCH_FAILED:-}" ] && { echo "Lead copy not checked for a recut: GitHub could not be reached at session start (LR-156)."; exit 0; }
    want=""
    [ "$age_h" -gt "$H" ] && want="its base is ${age_h} h older than main's tip (over ${H} h)"
    # Records all on main and main moved on: only for a branch of an earlier day. Today's branches (lead/<today>-x, which
    # a standby or a just-cut branch may be on in the same copy) are recut only on age (review of #3926, m2).
    case "$br" in "lead/$(today)"*) ;; *)
      [ -z "$want" ] && [ "$mine" = 0 ] && [ "$behind" -gt 0 ] && want="its records are all on main and main moved on ${behind} commit(s)";; esac
    [ -n "$want" ] || exit 0
    unpushed=$(git rev-list --count HEAD --not --remotes 2>/dev/null || echo "?")
    dirty=$(git status --porcelain --untracked-files=no 2>/dev/null | head -5 | cut -c4- | paste -sd ' ' -)
    if [ "$unpushed" != 0 ] || [ -n "$dirty" ]; then
      echo "⚠️ STALE LEAD COPY, NOT RECUT (LR-156, P-388): ${br} should be recut because ${want}, but ${unpushed} commit(s) exist only here${dirty:+ and tracked files are changed: $dirty}. Push or commit them first (git push -u origin ${br}), then: $(recut_cmd). Until then this copy runs stale tools and writes stale records."
      exit 0; fi
    # An existing local lead/<today> that is not checked out is reset by switch -C: refuse when it holds any commit not on
    # main (review of #3926, Major: an unpushed record there would be left only in the reflog).
    if [ "$br" != "$new" ] && git rev-parse -q --verify "refs/heads/$new" >/dev/null; then
      extra=$(git rev-list --count "$new" --not "$M" 2>/dev/null || echo "?")
      if [ "$extra" != 0 ]; then
        echo "⚠️ STALE LEAD COPY, NOT RECUT (LR-156, P-388): ${br} should be recut because ${want}, but the branch $new already exists here with ${extra} commit(s) not on main. Push and land them, or switch to it (git switch $new), then: $(recut_cmd)"
        exit 0; fi; fi
    git switch -q -C "$new" "$M" 2>/dev/null || { echo "⚠️ STALE LEAD COPY: the recut to $new failed; run: $(recut_cmd)"; exit 0; }
    git config "branch.$new.remote" origin; git config "branch.$new.merge" "refs/heads/$new"
    echo "Lead copy recut (LR-156, P-388): $br → $new from $M ($(git rev-parse --short=9 HEAD)), because ${want}. Skills and hooks that changed take effect in the next session."
    exit 0;;
  watch)
    last=""; while :; do
      git fetch -q origin main 2>/dev/null
      now=${NOW:-$(date +%s)}; cur=""
      case "$(git branch --show-current 2>/dev/null)" in lead/*) measure && is_stale && cur="STALE-COPY $behind behind $M, base ${age_h} h old: recut (LR-156)";; esac
      [ -n "$cur" ] && [ "$cur" != "$last" ] && echo "$cur"; last=$cur
      [ "${2:-}" = once ] && exit 0; sleep "${2:-180}"
    done;;
  ci)
    base=${2:?base}; head=${3:?head}; mb=$(git merge-base "$base" "$head" 2>/dev/null) || { echo "lead-age: no merge-base of $base and $head (fetch-depth?)"; exit 1; }
    gap_h=$(( ($(git log -1 --format=%ct "$base") - $(git log -1 --format=%ct "$mb")) / 3600 ))
    if [ "$gap_h" -gt "$H" ]; then
      echo "REFUSED (LR-156, P-388): this records PR's branch was cut from main ${gap_h} h before main's tip (over ${H} h). Records are written on a lead/<date> branch cut from origin/main the same day. Recut and carry the records over: git fetch origin main && git switch -C lead/<today IST> origin/main, then cherry-pick the record commits and open a new PR."
      exit 1; fi
    echo "lead-age: the branch was cut ${gap_h} h before main's tip (at most ${H})"; exit 0;;
  ci-json)   # stdin: GitHub's compare JSON (repos/<r>/compare/<base>...<head>): base_commit and merge_base_commit dates
    gap_h=$(python3 -I -c 'import json,sys
from datetime import datetime
d = json.load(sys.stdin); t = lambda c: datetime.fromisoformat(c["commit"]["committer"]["date"].replace("Z", "+00:00")).timestamp()
print(int((t(d["base_commit"]) - t(d["merge_base_commit"])) // 3600))' 2>/dev/null) || { echo "lead-age: the compare answer could not be read"; exit 1; }
    if [ "$gap_h" -gt "$H" ]; then
      echo "REFUSED (LR-156, P-388): this records PR's branch was cut from main ${gap_h} h before main's tip (over ${H} h). Records are written on a lead/<date> branch cut from origin/main the same day. Recut and carry the records over: git fetch origin main && git switch -C lead/<today IST> origin/main, then cherry-pick the record commits and open a new PR."
      exit 1; fi
    echo "lead-age: the branch was cut ${gap_h} h before main's tip (at most ${H})"; exit 0;;
  *) echo "usage: lead-age.sh [line|stale|recut|watch [sec|once]|ci <base> <head>|ci-json]" >&2; exit 2;;
esac
