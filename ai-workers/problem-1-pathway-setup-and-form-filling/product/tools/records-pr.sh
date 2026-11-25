#!/usr/bin/env bash
# The Lead's records PR in one command (OS-15; P-336 records by the Lead, P-440 RULES lags DECISIONS by at most 3 rows,
# P-526c no ruling lives only in an unmerged PR, P-402 own records PRs). One run:
#   1. refuses on main, and when a commit already on the branch (since origin/main) changes anything but records
#      (records-only.sh, the one definition), since such a PR would never reach the records queue;
#   2. with --as-of P-NNN (the Lead has folded DECISIONS rows up to NNN into RULES.md): rewrites only the "as of" part of
#      RULES.md's first line to `as of **P-NNN**, <d Mon HH:MM> IST`, refusing a number lower than today's or above
#      DECISIONS' newest; names every row between the old and the new number that RULES.md does not mention (a warning);
#   3. prints the RULES lag (P-440: at most 3), runs check-docs.sh and stops on any problem, committing nothing;
#   4. commits the changed records only (a non-record change is listed as left out, never committed), pushes the branch,
#      and opens its PR into main (ready, so records-label.yml labels it) or names the open one it updated.
# --dry-run edits, commits, pushes and posts nothing: it prints the files, the new first line, the lag and the PR it
# would open or update (one read). Every GitHub call goes through `gh api` (gh.sh's curl fallback covers only that).
#   bash product/tools/records-pr.sh [--dry-run] [--as-of P-NNN] [--title "records: ..."]
# Exit 0 done (or dry run printed), 1 a check failed (nothing committed), 2 refused or bad use.  Test: check-records-pr.sh.
set -uo pipefail
TOOLS="$(cd "$(dirname "$0")" && pwd)"; PRODUCT="$(cd "$TOOLS/.." && pwd)"
ROOT="$(git -C "$TOOLS" rev-parse --show-toplevel)" || exit 2; cd "$ROOT" || exit 2
gh() { ${RECORDS_GH:-bash "$TOOLS/gh.sh"} "$@"; }
REPO="${RECORDS_REPO:-expat-ready/xpatready}"; R="$PRODUCT/RULES.md"; D="$PRODUCT/DECISIONS.md"
DRY=0; ASOF=""; TITLE=""
while [ $# -gt 0 ]; do case "$1" in
  --dry-run) DRY=1; shift;;
  --as-of) [ $# -ge 2 ] || { echo "records-pr: --as-of needs P-NNN"; exit 2; }; ASOF="$2"; shift 2;;
  --title) [ $# -ge 2 ] || { echo "records-pr: --title needs a text"; exit 2; }; TITLE="$2"; shift 2;;
  *) echo "usage: records-pr.sh [--dry-run] [--as-of P-NNN] [--title \"records: ...\"]"; exit 2;;
esac; done
say() { echo "records-pr: $*"; }; refuse() { say "REFUSED: $*"; exit 2; }

BR=$(git symbolic-ref --short -q HEAD) || refuse "no branch checked out (detached HEAD)"
case "$BR" in main|master) refuse "on $BR: records go on the Lead's own branch, lead/<today> (P-388)";; esac
case "$BR" in lead/*) ;; *) say "note: $BR is not a lead/* branch; only the Lead writes records (P-521)";; esac
git fetch -q origin main 2>/dev/null || say "note: git fetch origin main failed; judging against the origin/main this copy has"
BASE=$(git merge-base HEAD origin/main 2>/dev/null) || refuse "no origin/main to compare with"

# 1. commits already on the branch must be records only
if [ -n "$(git rev-list "$BASE..HEAD")" ]; then
  k=$(bash "$TOOLS/records-only.sh" is-records "$BASE..HEAD")
  [ "$k" = yes ] || refuse "the branch's commits since origin/main change more than records: $(git -c core.quotePath=false diff --no-renames --name-only "$BASE...HEAD" | while IFS= read -r f; do [ "$(printf '%s\n' "$f" | bash "$TOOLS/records-only.sh" is-records --files)" = yes ] || printf '%s ' "$f"; done)— move them to their own PR"
fi

# 2. the RULES as-of line
newest=$(grep -oE '^\| P-[0-9]+ ' "$D" 2>/dev/null | grep -oE '[0-9]+' | sort -n | tail -1)
old=$(sed -nE '1s/.*as of \*\*P-([0-9]+)\*\*.*/\1/p' "$R" 2>/dev/null)
[ -n "$old" ] || refuse "RULES.md's first line has no 'as of **P-NNN**' (P-440)"
line1=$(head -1 "$R"); new1="$line1"; to="$old"
if [ -n "$ASOF" ]; then
  [[ "$ASOF" =~ ^P-([0-9]{1,5})$ ]] || refuse "--as-of must look like P-829, not '$ASOF'"
  to=$((10#${BASH_REMATCH[1]}))
  [ "$to" -ge "$old" ] || refuse "--as-of P-$to is below RULES.md's P-$old: the register never goes back"
  [ -n "$newest" ] && [ "$to" -gt "$newest" ] && refuse "--as-of P-$to is above DECISIONS.md's newest row, P-$newest"
  stamp="$(TZ=Asia/Kolkata date '+%-d %b %H:%M') IST"
  # only "as of **P-n**[, <time up to the next ; or )>]" changes; the rest of the line stays as the Lead wrote it
  new1=$(printf '%s\n' "$line1" | sed -E "s/as of \*\*P-[0-9]+\*\*(, [^;)]*)?/as of **P-$to**, $stamp/")
  # rows between the old and the new number that RULES.md does not name, alone or inside "P-a to P-b"
  n=$((old + 1)); while [ "$n" -le "$to" ]; do
    if ! grep -qE "P-$n([^0-9]|$)" "$R" && ! grep -oE 'P-[0-9]+ (to|-) P-[0-9]+' "$R" | awk -v n="$n" '{ split($0, a, /[^0-9]+/); if (a[2] + 0 <= n && n <= a[3] + 0) f = 1 } END { exit !f }'; then
      say "warning: P-$n (DECISIONS) is not named in RULES.md: fold it in, or name it, before claiming as of P-$to"
    fi; n=$((n + 1)); done
fi
lag=$(( ${newest:-$to} - to ))
say "RULES lag: as of P-$to, DECISIONS newest P-${newest:-?}: $lag row(s) behind (at most 3, P-440)"
[ "$new1" != "$line1" ] && say "RULES first line: $new1"

# the records to commit: changed or new files under the working tree, sorted into records and the rest
mapfile -t changed < <(git -c core.quotePath=false status --porcelain=v1 --untracked-files=all --no-renames | cut -c4- | sed 's/^"\(.*\)"$/\1/')
[ "$new1" != "$line1" ] && ! printf '%s\n' "${changed[@]}" | grep -qxF "${R#$ROOT/}" && changed+=("${R#$ROOT/}")
recs=(); left=()
for f in "${changed[@]}"; do [ -n "$f" ] || continue
  if [ "$(printf '%s\n' "$f" | bash "$TOOLS/records-only.sh" is-records --files)" = yes ]; then recs+=("$f"); else left+=("$f"); fi; done
for f in "${recs[@]}"; do say "record: $f"; done
for f in "${left[@]}"; do say "left out (not a record; its own PR): $f"; done
ahead=$(git rev-list --count "$BASE..HEAD")
[ "${#recs[@]}" -gt 0 ] || [ "$ahead" -gt 0 ] || { say "nothing to do: no changed record and no commit ahead of main"; exit 0; }

# the open PR from this branch, if any (one read; a failed read is said, never taken as "none")
owner=${REPO%%/*}; prs=$(gh api "repos/$REPO/pulls?state=open&head=$owner:$BR&per_page=5" --jq '.[].number' 2>&1); prc=$?
num=$(printf '%s\n' "$prs" | grep -E '^[0-9]+$' | head -1)
[ -z "$TITLE" ] && TITLE="records: the Lead's records, $(TZ=Asia/Kolkata date '+%-d %b %H:%M') IST"

if [ "$DRY" = 1 ]; then
  if [ "$prc" != 0 ]; then say "dry run: the PR read failed ($(printf '%s' "$prs" | head -1 | cut -c1-100)): it would open one or update the open one"
  elif [ -n "$num" ]; then say "dry run: would update #$num (push $BR)"
  else say "dry run: would open a PR $BR → main titled \"$TITLE\""; fi
  say "dry run: nothing edited, committed, pushed or posted"; exit 0
fi
[ "$prc" = 0 ] || { say "the PR read failed ($(printf '%s' "$prs" | head -1 | cut -c1-100)): nothing done, try again"; exit 1; }

# 3. apply the as-of line, then check-docs; a problem stops before any commit
if [ "$new1" != "$line1" ]; then
  { printf '%s\n' "$new1"; tail -n +2 "$R"; } > "$R.records-pr" && mv "$R.records-pr" "$R" || { say "could not write RULES.md"; exit 1; }
fi
cd_out=$(bash "$TOOLS/check-docs.sh" 2>/dev/null); cd_rc=$?   # its problems are on stdout
if [ "$cd_rc" != 0 ]; then say "check-docs.sh failed, nothing committed${ASOF:+ (the first line of RULES.md is already rewritten; a re-run with the same --as-of keeps it)}:"; printf '%s\n' "$cd_out" | sed 's/^/  /'; exit 1; fi
say "check-docs.sh: OK"

# 4. commit, push, open or update
if [ "${#recs[@]}" -gt 0 ]; then
  git add -- "${recs[@]}" && git commit -q -m "$TITLE" -m "records-pr.sh: ${#recs[@]} record file(s); RULES as of P-$to, lag $lag (P-440); check-docs OK." || { say "git commit failed"; exit 1; }
  say "committed $(git rev-parse --short HEAD): ${#recs[@]} file(s)"
fi
git push -q -u origin "$BR" 2>&1 | sed 's/^/  /'; [ "${PIPESTATUS[0]}" = 0 ] || { say "git push failed: the commit is local only; push again before stopping (P-557)"; exit 1; }
head=$(git rev-parse HEAD)
if [ -n "$num" ]; then say "updated #$num: head $head"; exit 0; fi
body="Records only (records-pr.sh, OS-15): $(git -c core.quotePath=false diff --name-only "$BASE...HEAD" | wc -l | tr -d ' ') file(s) since main. RULES as of P-$to; DECISIONS newest P-${newest:-?}; lag $lag (at most 3, P-440). check-docs.sh OK on $head.

Duplicate check: searched open PRs from $BR; none (P-526)."
url=$(gh api "repos/$REPO/pulls" -f title="$TITLE" -f head="$BR" -f base=main -f body="$body" --jq .html_url 2>&1) \
  || { say "opening the PR failed ($(printf '%s' "$url" | head -1 | cut -c1-120)); the branch is pushed: open it by hand"; exit 1; }
say "opened $url"
