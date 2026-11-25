#!/usr/bin/env bash
# A348 (founder 24 Nov): capacity-watch.py (standbys, disk, old exports with "on remote"). Pass and fail case for each, on a
# made-up folder and remote; it never removes anything, and a wrong "yes" is the fault that matters. US$0, no network.
#   bash product/tools/check-capacity-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/cw.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }
trap 'chmod -R u+rwx "${T:?}" 2>/dev/null; rm -rf "${T:?}"' EXIT
gi() { git -C "$1" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "${@:2}"; }
git init -q --bare -b main "$T/hub"; git init -q -b main "$T/repo"; gi "$T/repo" remote add origin "$T/hub"
echo one > "$T/repo/a"; echo two > "$T/repo/b"; gi "$T/repo" add -A; gi "$T/repo" commit -qm x; gi "$T/repo" push -q origin main 2>/dev/null
gi "$T/repo" checkout -q -b gone; echo dead > "$T/repo/d"; gi "$T/repo" add -A; gi "$T/repo" commit -qm y; gi "$T/repo" push -q origin gone 2>/dev/null; git -C "$T/hub" branch -qD gone
gi "$T/repo" checkout -q -b local main; echo mine > "$T/repo/l"; gi "$T/repo" add -A; gi "$T/repo" commit -qm z
seq=0; at=$(( $(date +%s) + 12 * 3600 ))   # the clock is 12 h ahead, so what the test just made is old
run() { seq=$((seq + 1)); o=$(LEAD_STANDBYS="${N-2}" python3 -I "$TOOLS/capacity-watch.py" --state "$T/s${S:-$seq}" --root "$R" --repo "${RP:-$T/repo}" --free-gb "${G:-8}" --big 4096 --now "${NOW:-$at}" ${X:-} 2>&1); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }; not() { ! grep -qF -- "$1" <<<"$o" && echo 1; }
new() { seq=$((seq + 1)); R="$T/root$seq"; mkdir "$R"; }
mk() { mkdir -p "$R/$1"; cp "$T/repo/a" "$T/repo/b" "$R/$1/" 2>/dev/null || { echo one > "$R/$1/a"; echo two > "$R/$1/b"; }; }
yes_() { ok "$1" "$(has "on remote: yes: $R/$2")" "$o"; }
no_() { ok "fail: $1" "$([ "$(not 'on remote: yes')" = 1 ] && has "on remote: $2")" "$o"; }
new; run; ok "pass: 2 standbys, 8 GB, nothing big: no ACT" "$([ "$(not ACT)" = 1 ] && has 'capacity standbys 2 · 8.0 GB free')" "$o"
N=1 run; ok "fail: one standby" "$(has 'ACT   capacity: 1 standby Lead, under 2')" "$o"
for v in '' two '²'; do N="$v" run; ok "fail: standbys '$v' is not given, and the disk line still prints" "$([ "$(has 'ACT   capacity: standbys not given')" = 1 ] && has '8.0 GB free')" "$o"; done
G=6.9 run; ok "fail: under 7 GB" "$(has 'ACT   capacity: 6.9 GB free, under 7')" "$o"
G=7 run; ok "pass: 7 GB" "$(not ACT)" "$o"
new; mk e; run; yes_ "every file on a branch of the remote: yes" e
ok "one ACT that counts it and says nothing is removed" "$(has 'ACT   capacity: 1 old exports over 0 MB (read 0 min ago; look again before any removal; nothing is removed here)')" "$o"
G=10 run; ok "pass: 10 GB free, nothing is listed" "$(not ACT)" "$o"
NOW=$((at - 7 * 3600)) run; ok "pass: put there under 6 h ago, not listed" "$(not export)" "$o"
find "$R" -exec touch -h -t 202001010000 {} +; NOW=$((at - 7 * 3600)) run; ok "pass: extracted now with old file times (tar) is not old" "$(not export)" "$o"
X='--big 99999999' run; ok "pass: under the size limit, not listed" "$(not export)" "$o"
RP="$T/none" run; no_ "a repository that cannot be read" 'unknown ('
new; mk e; echo new > "$R/e/c"; run; no_ "one file on no branch" 'no (1 of 3 files on no branch of the remote)'
new; mk e; echo dead > "$R/e/d"; run; no_ "a file only on a branch deleted on the remote, its local copy kept" 'no (1 of 3'
new; mk e; echo mine > "$R/e/l"; run; no_ "a file only on a local branch" 'no (1 of 3'
for d in dist node_modules __pycache__; do new; mk e; mkdir "$R/e/$d"; echo hand > "$R/e/$d/w"; run; no_ "a file of one's own in $d" 'no (1 of 3'; done
new; mk e; ln -s /etc/hosts "$R/e/l"; run; no_ "a link" 'no (1 of 3'
new; mk e; mkdir "$R/e/secret"; echo w > "$R/e/secret/w"; chmod 000 "$R/e/secret"; run; ok "fail: a folder that cannot be read whole has its own ACT, never yes" "$([ "$(not 'on remote: yes')" = 1 ] && has "ACT   capacity: 1 folders hold something that cannot be read, size unknown, never called on remote: $R/e")" "$o"; chmod 755 "$R/e/secret"
new; mk e; mk -x/u1/w; chmod 000 "$R/-x/u1"; run; ok "fail: one unreadable session folder is said and stops nothing else" "$([ "$(has "on remote: yes: $R/e")" = 1 ] && has "never called on remote: $R/-x/u1")" "$o"; chmod 755 "$R/-x/u1"
new; mk e; printf 'UNSAVED' > "$R/e/a"$'\r'; run; no_ "a file name ending in a carriage return" 'no (1 of 3'
new; mk e; printf 'UNSAVED' > "$R/e/a"$'\n'"b"; run; no_ "a file name holding a line end" 'no (1 of 3'
new; echo small > "$R/small.log"; mkdir -p "$R/-x/u1/scratchpad"; echo s > "$R/-x/u1/scratchpad/s.txt"; X='--big 99999999' run; ok "pass: small files are not listed" "$(not export)" "$o"
new; head -c 9000 /dev/zero > "$R/big.bin"; run; no_ "a big file at the root on no branch" 'no (1 of 1'
new; mk e; mkdir "$T/away$seq"; head -c 9000 /dev/zero > "$T/away$seq/z"; ln -s "$T/away$seq" "$R/l"; run; ok "pass: a link to a folder is not walked" "$(not ": $R/l")" "$o"
new; mk e; chmod 000 "$R/e/a"; run; no_ "a file that cannot be read" 'unknown ('; chmod 644 "$R/e/a"
new; git clone -q "$T/hub" "$R/c" 2>/dev/null; run; no_ "a git copy, however clean" 'unknown (a git copy: look by hand)'
new; mk e; mkdir -p "$R/e/sub"; echo 'gitdir: /x' > "$R/e/sub/.git"; run; no_ "a worktree inside" 'unknown (a git copy'
new; mkdir -p "$R/e/x/y"; : > "$R/e/.k"; head -c 9000 /dev/zero > "$R/e/z"; run; no_ "an empty file and zeros on no branch" 'no (2 of 2'
gi "$T/repo" remote set-url origin "$T/nohub"; new; mk e; run; no_ "a remote that cannot be asked" 'unknown ('; gi "$T/repo" remote set-url origin "$T/hub"
new; mk -Users-x/u1/scratchpad/e2; mk -Users-x/u1/work; run; ok "a session's scratchpad entry and its other folders are listed, never the session's own folder" "$([ "$(has 'ACT   capacity: 2 old exports')" = 1 ] && [ "$(has ": $R/-Users-x/u1/scratchpad/e2")" = 1 ] && has ": $R/-Users-x/u1/work")" "$o"
new; S=k run; mk e; S=k run; ok "read once an hour: the second check repeats the first listing" "$(not export)" "$o"
S=k NOW=$((at + 3601)) run; ok "and reads again after it" "$(has "$R/e")" "$o"
mk f; cp -R "$R" "$T/rootother"; R="$T/rootother" S=k NOW=$((at + 3700)) run; ok "a listing of another folder is never reused" "$(has "$T/rootother/f")" "$o"
new; mkdir "$R/e"; cp "$T/repo/a" "$R/e/"; X='--budget 0.0' run; ok "fail: out of time is never yes" "$(not 'remote: yes')" "$o"
new; mk e; X='--budget -1' run; ok "fail: out of time is an ACT, never an empty list" "$([ "$(not 'remote: yes')" = 1 ] && has 'ACT   capacity: the listing stopped')" "$o"
R="$T/none" run; ok "fail: an unreadable folder is an ACT" "$(has 'ACT   capacity: not measured')" "$o"
new; mk e; b=$(cd "$R" && find . -exec ls -ldT {} + 2>/dev/null || find . -exec stat -c '%n %Y %Z' {} +); run; a=$(cd "$R" && find . -exec ls -ldT {} + 2>/dev/null || find . -exec stat -c '%n %Y %Z' {} +); ok "nothing in the folder is changed" "$([ "$a" = "$b" ] && echo 1)"
ok "its code removes and moves nothing but its own state file" "$(! grep -nE 'rmtree|unlink|os\.remove|shutil\.move|rename\(' "$TOOLS/capacity-watch.py" && [ "$(grep -c 'os.replace(' "$TOOLS/capacity-watch.py")" = 1 ] && echo 1)"
sed -n '/^# 1e\. Capacity/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir -p "$T/t"
step() { printf 'print("""%s""")\n' "$1" > "$T/t/capacity-watch.py"; o=$( ( TOOLS="$T/t"; STATE_DIR="$T/s"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { echo "seen: $1"; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
step 'capacity x'; ok "lead-watch.sh prints its line and hands it on, no ACT counted" "$([ "$(has 'seen: capacity x')" = 1 ] && has 'acts=0')" "$o"
step 'ACT   capacity: x'; ok "lead-watch.sh counts its ACT line" "$(has 'acts=1')" "$o"
step Traceback; ok "fail: a capacity-watch.py that dies is an ACT" "$(has 'ACT   capacity: capacity-watch.py did not run')" "$o"
finish
