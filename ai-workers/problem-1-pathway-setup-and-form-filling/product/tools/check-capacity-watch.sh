#!/usr/bin/env bash
# A348 (founder 24 Nov): capacity-watch.py (standbys, disk, old exports with "on remote"). Pass and fail case for each, on a
# made-up folder and repository; it never deletes. US$0, no network.   bash product/tools/check-capacity-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/cw.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
g() { git -C "$T/repo" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
git init -q -b main "$T/repo"; echo one > "$T/repo/a"; echo two > "$T/repo/b"; g add -A; g commit -qm x; g update-ref refs/remotes/origin/main main
R="$T/root"; seq=0
run() { seq=$((seq + 1)); st="$T/s${S:-$seq}"; o=$(LEAD_STANDBYS="${N-2}" python3 -I "$TOOLS/capacity-watch.py" --state "$st" --root "$R" --repo "$T/repo" --free-gb "${G:-8}" --big 4096 ${X:-} 2>&1); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }
not() { ! grep -qF -- "$1" <<<"$o" && echo 1; }
old() { find "$1" -exec touch -h -t 202001010000 {} +; }
mkdir -p "$R"
run; ok "pass: 2 standbys, 8 GB, nothing big: no ACT" "$([ "$(not ACT)" = 1 ] && has 'capacity standbys 2 · 8.0 GB free')" "$o"
N=1 run; ok "fail: one standby" "$(has 'ACT   capacity: 1 standby Lead, under 2')" "$o"
N='' run; ok "fail: standbys not given" "$(has 'ACT   capacity: standbys not given')" "$o"
N=two run; ok "fail: standbys not a number" "$(has 'ACT   capacity: standbys not given')" "$o"
G=6.9 run; ok "fail: under 7 GB" "$(has 'ACT   capacity: 6.9 GB free, under 7')" "$o"
G=7 run; ok "pass: 7 GB" "$(not ACT)" "$o"
mk() { mkdir -p "$R/$1"; cp "$T/repo/a" "$T/repo/b" "$R/$1/"; }
mk e1; old "$R/e1"; run
ok "every file on an origin branch: on remote: yes" "$([ "$(has 'ACT   capacity: 1 old exports')" = 1 ] && has "on remote: yes: $R/e1")" "$o"
G=10 run; ok "pass: 10 GB free, nothing is listed" "$(not ACT)" "$o"
echo three > "$R/e1/c"; old "$R/e1"; run; ok "fail: one file on no branch: on remote: no" "$(has 'on remote: no (1 of 3 files on no origin branch)')" "$o"
mkdir "$R/e1/node_modules"; echo x > "$R/e1/node_modules/z"; old "$R/e1"; run; ok "a rebuilt folder does not count against it" "$(has 'on remote: no (1 of 3')" "$o"
ln -s /etc/hosts "$R/e1/l"; old "$R/e1"; run; ok "a link is not a file on the remote" "$(has 'on remote: no (2 of 4')" "$o"
touch "$R/e1/a"; run; ok "pass: touched under 6 h ago, not listed" "$(not ACT)" "$o"
rm -rf "${R:?}/e1"; mkdir -p "$R/-Users-x/u1/scratchpad"; mk -Users-x/u1/scratchpad/e2; old "$R"; run
ok "a session's scratchpad entry is listed, not the session's own folder" "$([ "$(has 'ACT   capacity: 1 old exports')" = 1 ] && has "$R/-Users-x/u1/scratchpad/e2")" "$o"
rm -rf "${R:?}/-Users-x"; git clone -q "$T/repo" "$R/c" 2>/dev/null; old "$R/c"; run; ok "a clean git copy with every commit on origin: yes" "$(has "on remote: yes: $R/c")" "$o"
echo new > "$R/c/n"; old "$R/c"; run; ok "fail: a git copy with an uncommitted file: no" "$(has 'on remote: no (1 files not committed)')" "$o"
git -C "$R/c" -c user.email=t@t -c user.name=t -c commit.gpgsign=false add -A; git -C "$R/c" -c user.email=t@t -c user.name=t -c commit.gpgsign=false commit -qm y; old "$R/c"; run
ok "fail: a git copy with a commit on no origin branch: no" "$(has 'is on no origin branch)')" "$o"
git -C "$R/c" checkout -q -b tmp HEAD~1; old "$R/c"; run; ok "fail: an unpushed commit on another branch of it: no" "$(has 'is on no origin branch)')" "$o"
n=$(find "$R" | wc -l); S=keep run; echo z > "$R/big"; head -c 9000 /dev/zero > "$R/big"; old "$R/big"; S=keep run
ok "read once an hour: the second check repeats the first listing" "$(not "$R/big")" "$o"
ok "nothing was deleted" "$([ "$(find "$R/c" | wc -l)" -le "$n" ] && [ -d "$R/c" ] && echo 1)"
X="--budget -1" run; ok "fail: out of time is an ACT, never an empty list" "$(has 'ACT   capacity: the listing stopped')" "$o"
R="$T/none" run; ok "fail: an unreadable folder is an ACT" "$(has 'ACT   capacity: not measured')" "$o"
sed -n '/^# 1e\. Capacity/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir -p "$T/t"
step() { printf 'print("""%s""")\n' "$1" > "$T/t/capacity-watch.py"; o=$( ( TOOLS="$T/t"; STATE_DIR="$T/s"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { :; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
step 'capacity x'; ok "lead-watch.sh prints its line, no ACT counted" "$([ "$(has 'capacity x')" = 1 ] && has 'acts=0')" "$o"
step 'ACT   capacity: x'; ok "lead-watch.sh counts its ACT line" "$(has 'acts=1')" "$o"
step Traceback; ok "fail: a capacity-watch.py that dies is an ACT" "$(has 'ACT   capacity: capacity-watch.py did not run')" "$o"
ok "it deletes and moves nothing but its own state file" "$(! grep -nE 'rmtree|unlink|os\.remove|shutil\.move|rename\(' "$TOOLS/capacity-watch.py" && [ "$(grep -c 'os.replace(' "$TOOLS/capacity-watch.py")" = 1 ] && echo 1)"
finish
