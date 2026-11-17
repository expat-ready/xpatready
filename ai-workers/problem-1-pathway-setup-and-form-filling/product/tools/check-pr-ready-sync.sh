#!/usr/bin/env bash
# #2086 follow-up (P-685, P-678): pr-ready.sh marks a draft ready only on a member's "Reviewer: Approve <head>" line
# and only if the head did not move while the comments were read; private-sync.sh pushes only to a private
# expat-ready/private, refuses the added secret shapes, and pushes a commit an earlier run failed to push; neither puts
# the token on curl's command line; decision-impact.sh exempts P-685. GitHub is a stand-in curl and gh; the private
# remote is a local bare repository. US$0, no network.   bash product/tools/check-pr-ready-sync.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/fx"; FX="$T/fx"; export FX
cat > "$T/bin/gh" <<'EOF'
#!/usr/bin/env bash
[ "$1 $2" = "auth token" ] && { echo tok-SECRET-123; exit 0; }; exit 1
EOF
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FX/argv"; m=GET; u=""
while [ $# -gt 0 ]; do case "$1" in -X) m=$2; shift;; -d) shift;; -H) case "$2" in @*) cat "${2#@}" >> "$FX/headers";; esac; shift;; http*) u=$1;; esac; shift; done
case "$m $u" in
  "GET "*/pulls/7) k=$(cat "$FX/reads" 2>/dev/null || echo 0); k=$((k + 1)); echo $k > "$FX/reads"
    if [ "$k" -gt 1 ] && [ -f "$FX/pull2.json" ]; then cat "$FX/pull2.json"; else cat "$FX/pull.json"; fi;;
  "GET "*/issues/7/comments*page=1) cat "$FX/comments.json";;
  "GET "*/issues/7/comments*) echo '[]';;
  "POST "*/graphql) echo MUTATION >> "$FX/log"; echo '{"data":{"markPullRequestReadyForReview":{"pullRequest":{"isDraft":false}}}}';;
  "GET "*/repos/expat-ready/private) cat "$FX/meta.json";;
  *) echo "unexpected $m $u" >> "$FX/log"; exit 22;;
esac
EOF
command -v rsync >/dev/null || cat > "$T/bin/rsync" <<'EOF'
#!/usr/bin/env bash
src=""; dst=""; for a in "$@"; do case "$a" in -*|.DS_Store) ;; *) [ -z "$src" ] && src=$a || dst=$a;; esac; done
rm -rf "$dst" && mkdir -p "$dst" && cp -R "$src". "$dst"
EOF
chmod +x "$T/bin/"*; export PATH="$T/bin:$PATH"
H=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; H2=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
pull() { printf '{"state":"open","draft":true,"head":{"sha":"%s"},"node_id":"PR_x"}' "$1"; }
comment() { printf '[{"author_association":"%s","body":"Independent review.\\nReviewer: Approve %s\\n"}]' "$1" "$2" > "$FX/comments.json"; }
ready() { rm -f "$FX/log" "$FX/reads" "$FX/argv" "$FX/headers"; out=$(PR_READY_REPO=o/r bash "$TOOLS/pr-ready.sh" 7 2>&1); r=$?; }
rm -f "$FX/pull2.json"; pull $H > "$FX/pull.json"

comment MEMBER $H; ready
ok "pr-ready: a member's Approve on the head marks the draft ready" "$([ $r = 0 ] && grep -q MUTATION "$FX/log" && echo 1)" "exit $r: $out"
ok "pr-ready: the token is never on curl's command line, it reaches curl as a header file" "$(! grep -q tok-SECRET "$FX/argv" && grep -q 'Authorization: Bearer tok-SECRET-123' "$FX/headers" && echo 1)" "$(cat "$FX/argv")"
comment NONE $H; ready
ok "pr-ready: an outsider's Approve line (author_association NONE) does not count" "$([ $r = 1 ] && ! grep -q MUTATION "$FX/log" 2>/dev/null && echo 1)" "exit $r: $out"
comment CONTRIBUTOR $H; ready
ok "pr-ready: a contributor's Approve line does not count (OWNER, MEMBER, COLLABORATOR only)" "$([ $r = 1 ] && ! grep -q MUTATION "$FX/log" 2>/dev/null && echo 1)" "exit $r: $out"
comment OWNER $H; pull $H2 > "$FX/pull2.json"; ready
ok "pr-ready: a push while the comments are read (head moved) is refused" "$([ $r = 1 ] && echo "$out" | grep -q 'moved from' && ! grep -q MUTATION "$FX/log" 2>/dev/null && echo 1)" "exit $r: $out"
rm -f "$FX/pull2.json"

# private-sync: HOME and TMPDIR in the throwaway folder; the real remote URL is rewritten to a local bare repository.
unset GIT_CONFIG_SYSTEM XDG_CONFIG_HOME; export HOME="$T/home" GIT_CONFIG_GLOBAL="$T/home/.gitconfig";   # never the real git config (review m3)
 NOTES="$HOME/Library/Application Support/Claude/side-session-notes"; mkdir -p "$NOTES" "$T/tmp"
git init -q --bare "$T/bare.git"; git -C "$T" init -q seed; git -C "$T/seed" -c user.email=t@t -c user.name=t commit -q --allow-empty -m seed
git -C "$T/seed" push -q "$T/bare.git" HEAD:main 2>/dev/null; git -C "$T/bare.git" symbolic-ref HEAD refs/heads/main
git config --global url."$T/bare.git".insteadOf https://github.com/expat-ready/private.git
git config --global user.email t@t; git config --global user.name t; git config --global commit.gpgsign false
sync() { rm -f "$FX/argv"; out=$(TMPDIR="$T/tmp" bash "$TOOLS/private-sync.sh" 2>&1); r=$?; }
count() { git -C "$T/bare.git" rev-list --count main; }
echo '{"full_name":"expat-ready/private","private":false}' > "$FX/meta.json"; echo note > "$NOTES/a.md"; sync
ok "private-sync: a remote that is not private is refused before any clone or push" "$([ $r = 4 ] && [ "$(count)" = 1 ] && [ ! -d "$T/tmp/private-home" ] && echo 1)" "exit $r: $out"
echo '{"full_name":"someone/private","private":true}' > "$FX/meta.json"; sync
ok "private-sync: a repository other than expat-ready/private is refused" "$([ $r = 4 ] && [ "$(count)" = 1 ] && echo 1)" "exit $r: $out"
echo '{"full_name":"expat-ready/private","private":true}' > "$FX/meta.json"
for s in "ghs_$(printf 'A%.0s' {1..36})" "xoxb-$(printf '1%.0s' {1..24})" "sk-proj-$(printf 'b%.0s' {1..24})" "sk_live_$(printf 'c%.0s' {1..24})"; do
  echo "key $s" > "$NOTES/k.md"; sync
  ok "private-sync: a note holding a ${s:0:8}… key is refused" "$([ $r = 3 ] && [ "$(count)" = 1 ] && echo 1)" "exit $r: $out"
done
rm -f "$NOTES/k.md"
printf '#!/bin/sh\nexit 1\n' > "$T/bare.git/hooks/pre-receive"; chmod +x "$T/bare.git/hooks/pre-receive"; sync
ok "private-sync: a push that fails exits non-zero" "$([ $r != 0 ] && [ "$(count)" = 1 ] && echo 1)" "exit $r: $out"
rm -f "$T/bare.git/hooks/pre-receive"; sync
ok "private-sync: the next run with nothing new pushes the commit the failed run made (Devin on #2086)" "$([ $r = 0 ] && [ "$(count)" = 2 ] && echo "$out" | grep -q 'pushed' && echo 1)" "exit $r: $out"
ok "private-sync: the token is never on curl's command line" "$(! grep -q tok-SECRET "$FX/argv" && echo 1)" "$(cat "$FX/argv")"
sync
ok "private-sync: a run with nothing new and nothing ahead says so and pushes nothing" "$([ $r = 0 ] && [ "$(count)" = 2 ] && echo "$out" | grep -q 'nothing new' && echo 1)" "exit $r: $out"
git -C "$T/tmp/private-home" remote set-url origin "$T/bare.git"; sync
ok "private-sync: a working copy whose origin is not the private home is refused" "$([ $r = 4 ] && echo 1)" "exit $r: $out"

grep -q ' P-684 P-685 P-686 ' "$TOOLS/decision-impact.sh"; ok "decision-impact: P-685 (pr-ready.sh, a tooling row) is exempt" "$([ $? = 0 ] && echo 1)"
finish
