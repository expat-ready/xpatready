#!/usr/bin/env bash
# LR-081: branch-classes.py sorts remote branches into classes and removes only the SAFE ones (merged with the same tip,
# or contained in main), one at a time, on --delete --yes, re-reading each tip first. Stand-ins for git and gh; nothing
# real is read or removed. US$0, no network.   bash product/tools/check-branch-classes.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/bcls.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
BC="$TOOLS/branch-classes.py"
printf '%s\trefs/heads/%s\n' a1 main b1 claude/merged-same b2 claude/merged-moved c1 claim/PF-1 d1 claude/open-one e1 claude/closed-one f1 lead/no-pr g1 claude/contained h1 claude/x-records > "$T/heads"
printf '%s\t%s\t%s\t%s\t%s\n' claude/merged-same b1 closed 2026-11-01 main claude/merged-moved b0 closed 2026-11-01 main claude/open-one d1 open "" main \
  claude/open-one d0 closed 2026-11-01 main claude/closed-one e1 closed "" main claude/x-records h1 closed 2026-11-01 claude/x-base > "$T/prs"
printf '%s\t%s\n' b2 diverged c1 behind e1 diverged f1 ahead g1 identical d1 behind h1 diverged > "$T/cmp"
cat > "$T/git" <<'EOF'
#!/usr/bin/env bash
# stand-in: "remote get-url origin" prints $STUB_URL; "ls-remote --heads origin refs/heads/<b>" answers from $STUB/tips;
# "push --force-with-lease=refs/heads/<b>:<sha> origin --delete <b>" is logged whole; $STUB/refuse names a refused branch
case "$1" in
  remote) echo "${STUB_URL:-https://github.com/expat-ready/xpatready.git}";;
  ls-remote) b=${4#refs/heads/}; awk -F'\t' -v b="$b" '$1 == b {print $2 "\trefs/heads/" b}' "$STUB/tips";;
  push) b="${*: -1}"; echo "$b $2" >> "$STUB/deleted"; ! grep -qxF "$b" "$STUB/refuse" 2>/dev/null;;
  *) exit 9;;
esac
EOF
chmod +x "$T/git"; export STUB="$T" BRANCH_GIT="$T/git" BRANCH_GH=false
run() { o=$(python3 -I "$BC" --heads "$T/heads" --prs "$T/prs" --compare "$T/cmp" --list "$T/list" "$@" 2>&1); rc=$?; }
has() { grep -qF -- "$1" <<<"$o"; }
cls() { awk -F'\t' -v b="$1" '$2 == b {print $1}' "$T/list"; }

run
ok "report: counts per class, main counted, nothing removed" "$([ "$rc" = 0 ] && has '9 remote heads (main included); open 1, merged 1, contained 2, merged+ 1, closed 2, nopr 1' && [ ! -e "$T/deleted" ] && echo 1)" "$o"
ok "a merged PR with exactly the tip is merged (safe)" "$([ "$(cls claude/merged-same)" = merged ] && echo 1)" "$(cat "$T/list")"
ok "a merged PR, then a push not in main: merged+ (kept)" "$([ "$(cls claude/merged-moved)" = merged+ ] && echo 1)" "$(cat "$T/list")"
ok "an open PR wins over a tip already in main" "$([ "$(cls claude/open-one)" = open ] && echo 1)" "$(cat "$T/list")"
ok "a tip in main (behind or identical) with no PR is contained (safe)" "$([ "$(cls claim/PF-1)" = contained ] && [ "$(cls claude/contained)" = contained ] && echo 1)" "$(cat "$T/list")"
ok "closed unmerged and no-PR branches with own commits are kept" "$([ "$(cls claude/closed-one)" = closed ] && [ "$(cls lead/no-pr)" = nopr ] && echo 1)" "$(cat "$T/list")"
ok "a PR merged into a branch other than main, same tip, not in main: closed (kept)" "$([ "$(cls claude/x-records)" = closed ] && echo 1)" "$(cat "$T/list")"
ok "main is never classified" "$([ -z "$(cls main)" ] && [ "$(wc -l < "$T/list")" = 8 ] && echo 1)" "$(cat "$T/list")"
ok "what is left and the claim/* count" "$(has 'leaves 6 heads; claim/* 1, of them left 0' && echo 1)" "$o"
run --delete; ok "--delete without --yes removes nothing" "$([ "$rc" = 1 ] && has 'needs --yes' && [ ! -e "$T/deleted" ] && echo 1)" "$o"
run --delete --yes --classes merged,nopr; ok "only merged and contained can be removed" "$([ "$rc" = 1 ] && has 'not nopr' && [ ! -e "$T/deleted" ] && echo 1)" "$o"
printf '%s\t%s\n' claude/merged-same b1 claim/PF-1 c9 claude/contained g1 claude/open-one d1 > "$T/tips"
run --delete --yes
ok "delete: a safe branch on an unchanged tip is removed" "$([ "$rc" = 0 ] && has 'removed claude/merged-same (merged' && has 'removed claude/contained (contained' && echo 1)" "$o"
ok "delete: a tip that moved since the report is kept" "$(has 'kept claim/PF-1: tip moved c1 -> c9' && ! grep -qx 'claim/PF-1' "$T/deleted" && echo 1)" "$o"
ok "delete: open, merged+, closed and no-PR branches are never touched" "$([ "$(cut -d' ' -f1 "$T/deleted" | sort | tr '\n' ' ')" = 'claude/contained claude/merged-same ' ] && echo 1)" "$(cat "$T/deleted")"
ok "delete: the push is tied to the checked tip (force-with-lease)" "$(grep -qxF 'claude/merged-same --force-with-lease=refs/heads/claude/merged-same:b1' "$T/deleted" && echo 1)" "$(cat "$T/deleted")"
ok "delete: a moved tip is a keep, not a failure (exit 0)" "$([ "$rc" = 0 ] && has 'removed 2, kept 1 (0 failed)' && echo 1)" "$o"
rm -f "$T/deleted"; echo claude/merged-same > "$T/refuse"; run --delete --yes
ok "delete: a refused push keeps the branch and exits 1" "$([ "$rc" = 1 ] && has 'kept claude/merged-same: delete refused' && has '(1 failed)' && echo 1)" "$o"
rm -f "$T/refuse" "$T/deleted"; STUB_URL=https://github.com/someone/else.git run --delete --yes
ok "delete: an origin that is not the repository: nothing done" "$([ "$rc" = 1 ] && has 'not expat-ready/xpatready; nothing done' && [ ! -e "$T/deleted" ] && echo 1)" "$o"
rm -f "$T/deleted"; { cat "$T/prs"; printf 'claude/contained\tg1\topen\t\tmain\n'; } > "$T/prs-now"; run --delete --yes --prs-now "$T/prs-now"
ok "delete: a PR opened since the report keeps its branch (PR list read again)" "$(has 'kept claude/contained: now open, not contained' && ! grep -q '^claude/contained ' "$T/deleted" && grep -q '^claude/merged-same ' "$T/deleted" && echo 1)" "$o"
rm -f "$T/deleted"; : > "$T/tips"; run --delete --yes --classes merged
ok "delete: a branch already gone is reported, not pushed" "$(has 'gone claude/merged-same: already removed' && [ ! -e "$T/deleted" ] && echo 1)" "$o"
o=$(python3 -I "$BC" --heads "$T/nope" --prs "$T/prs" 2>&1); rc=$?
ok "unreadable data: exit 1, nothing classified" "$([ "$rc" = 1 ] && grep -q 'data unreadable' <<<"$o" && echo 1)" "$o"
finish
