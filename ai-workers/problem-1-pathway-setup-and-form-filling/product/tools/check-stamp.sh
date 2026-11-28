#!/usr/bin/env bash
# LR-168 (founder A455, 28 Nov: the gap alarm must not depend on a Mac session; "we have unlimited machines in the GitHub").
# The Lead's check stamp, pushed to GitHub, and its judge, run by .github/workflows/lead-gap.yml every 10 min.
#   check-stamp.sh push [dir]        lead-watch.sh's last step in the Lead's copy: one commit on refs/heads/lead/check-stamp
#                                    (a branch of its own, no history but stamps, no working-tree or index change: git
#                                    plumbing) holding lead-check-stamp.json {"epoch","ist","head","behind"}; fast-forward
#                                    only (never forced), one retry after a refetch; prints one line, exit 0 pushed, 1 not.
#   check-stamp.sh judge FILE [now]  the workflow's verdict on a stamp file: "<success|failure> <description>" (exit 0);
#                                    over STAMP_MAX (20) min, missing, unreadable or in the future is failure.
# Env: CHECK_STAMP_REMOTE (origin), STAMP_MAX (20), NOW (tests). Test: check-check-stamp-push.sh.
set -u
B=refs/heads/lead/check-stamp; F=lead-check-stamp.json; MAX=${STAMP_MAX:-20}
ist() { TZ=Asia/Kolkata date -d "@$1" '+%d %b %H:%M IST' 2>/dev/null || TZ=Asia/Kolkata date -r "$1" '+%d %b %H:%M IST'; }
case "${1:-}" in
  judge)
    now=${3:-${NOW:-$(date +%s)}}
    [ -r "${2:-}" ] && [ -s "$2" ] || { echo "failure no Lead check stamp pushed yet (lead/check-stamp): the Lead's checks are not running (LR-168)"; exit 0; }
    e=$(python3 -I -c 'import json,sys
d=json.load(open(sys.argv[1])); e=d["epoch"]
print(e if isinstance(e,int) and not isinstance(e,bool) else "")' "$2" 2>/dev/null)
    [ -n "$e" ] || { echo "failure the Lead check stamp is unreadable (LR-168)"; exit 0; }
    age=$(( (now - e) / 60 ))
    [ "$age" -lt 0 ] && { echo "failure the Lead check stamp is $(( -age )) min in the future (LR-168)"; exit 0; }
    if [ "$age" -gt "$MAX" ]; then echo "failure last Lead check $age min ago at $(ist "$e") (over $MAX min): checks are missed (LR-168)"
    else echo "success last Lead check $age min ago at $(ist "$e") (LR-168)"; fi; exit 0;;
  push)
    D=${2:-.}; R=${CHECK_STAMP_REMOTE:-origin}; g() { git -C "$D" "$@"; }
    now=${NOW:-$(date +%s)}; head=$(g rev-parse HEAD 2>/dev/null) || { echo "check stamp not pushed: $D is not a git copy"; exit 1; }
    behind=$(g rev-list --count HEAD..origin/main 2>/dev/null || echo -1)
    for try in 1 2; do
      g -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=15 fetch -q "$R" "+$B:refs/remotes/check-stamp/tip" 2>/dev/null; par=$(g rev-parse -q --verify refs/remotes/check-stamp/tip 2>/dev/null)
      blob=$(printf '{"epoch": %s, "ist": "%s", "head": "%s", "behind": %s}\n' "$now" "$(ist "$now")" "$head" "$behind" | g hash-object -w --stdin) || break
      tree=$(printf '100644 blob %s\t%s\n' "$blob" "$F" | g mktree) || break
      c=$(GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-lead-watch}" GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-lead-watch@localhost}" GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-lead-watch}" GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-lead-watch@localhost}" \
        g commit-tree "$tree" ${par:+-p "$par"} -m "Lead check stamp $(ist "$now") (LR-168)") || break
      if err=$(g -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=15 push -q "$R" "$c:$B" 2>&1); then echo "check stamp pushed: $(ist "$now") to lead/check-stamp (${c:0:9}, LR-168)"; exit 0; fi
    done
    echo "check stamp NOT pushed to lead/check-stamp (LR-168; git: $(printf '%s\n' "${err:-no commit made}" | { grep -iE 'fatal|error|rejected|denied|refused|^ *!' || printf '%s\n' "${err:-no commit made}"; } | grep -v '^ *$' | head -1 | cut -c1-160)): GitHub's gap alarm will go red in $MAX min unless the next check pushes"; exit 1;;
  *) echo "usage: check-stamp.sh push [dir] | judge FILE [now]"; exit 2;;
esac
