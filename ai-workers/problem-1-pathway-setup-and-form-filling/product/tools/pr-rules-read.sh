#!/usr/bin/env bash
# LR-043 (lab bundle A3, "PR rules fail closed"): the first step of pr-rules' jobs. Reads the PR's body and title from
# GitHub as they are NOW and hands them to the later steps as BODY and TITLE (through $GITHUB_ENV, under a random
# delimiter the body cannot contain). Why not the event: a re-run replays the event of its first run, so it read the old
# body and failed a PR whose body had since been fixed (#2282, 19 Nov: a false failure). Fails closed: when the read
# fails, or the answer is not this PR, it exits 1 with an error and sets nothing, so the check is red, never a pass on
# an empty or stale body. A PR with no body is read as an empty body (the body rules then fail it).
#   N=<pr number> GITHUB_REPOSITORY=o/r GITHUB_ENV=<file> bash product/tools/pr-rules-read.sh
# Needs gh (GH_TOKEN) and jq. US$0. Test: product/tools/check-pr-rules-closed.sh.
set -u
fail() { echo "::error title=pr-rules (LR-043)::$1, so the rules cannot be checked and pr-rules fails (fail closed)"; exit 1; }
case "${N:-}" in ''|*[!0-9]*) fail "no PR number (N=${N:-})";; esac
[ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${GITHUB_ENV:-}" ] || fail "GITHUB_REPOSITORY or GITHUB_ENV is not set"
j=$(gh api "repos/$GITHUB_REPOSITORY/pulls/$N") || fail "GitHub did not answer for PR #$N"
num=$(printf '%s' "$j" | jq -r '.number // empty' 2>/dev/null) || fail "GitHub's answer for PR #$N is not JSON"
[ "$num" = "$N" ] || fail "GitHub's answer is not PR #$N (got: ${num:-nothing})"
body=$(printf '%s' "$j" | jq -r '.body // ""') && title=$(printf '%s' "$j" | jq -r '.title // ""') || fail "the body or title of PR #$N cannot be read"
d="PRRULES_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
[ ${#d} -gt 30 ] || fail "no random delimiter"
case "$body$title" in *"$d"*) fail "the body holds the delimiter";; esac
{ printf 'BODY<<%s\n%s\n%s\n' "$d" "$body" "$d"; printf 'TITLE<<%s\n%s\n%s\n' "$d" "$title" "$d"; } >> "$GITHUB_ENV" || fail "GITHUB_ENV cannot be written"
echo "read PR #$N now: title and a body of $(printf '%s' "$body" | wc -l | tr -d ' ') line(s)"
