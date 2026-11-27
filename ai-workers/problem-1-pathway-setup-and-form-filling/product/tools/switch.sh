#!/usr/bin/env bash
# OS-86 / LR-143 (founder A417, 27 Nov): the account-switch checklist, enforced. Rules and ledger: rules/account-switch.md.
#   switch.sh detect           SessionStart (session-start.sh): oauthAccount.accountUuid in ~/.claude.json against the last
#                              one seen (a sha256 prefix in SWITCH_DIR, outside the repository). Changed: opens a switch
#                              and prints "ACCOUNT SWITCH DETECTED" and the checklist. Same account with a switch still
#                              open and no baseline: a reminder. No file, no account id, first sight: silent. Exit 0 always.
#   switch.sh baseline <pct>   AS-4: the minute-0 meter (get_usage, typed by the Lead); fills "New meter at minute 0".
#   switch.sh gate             lane-preflight.sh --hook: exit 1 (refused, with why) while a switch is open with no
#                              baseline, or within 2 h of the baseline at 4 starts in 15 min or 12 in all; else 0 and the
#                              start is counted (before lane-preflight's own disk and load checks). No switch open: 0,
#                              silent. The state is per machine: a fresh cloud container never opens a switch.
#   switch.sh close-prep <pct> AS-1, the old side (lead-watch at weekly >= 94%): writes the ledger row once (old meter) and
#                              checks STATE.md and RESUME-ON-NEW-ACCOUNT.md are committed and pushed. Exit 0 "close-prep:
#                              done", else 1 naming what is left (lead-watch prints it as an ACT). Under 94: "not yet", 0.
#   switch.sh close [<pct>]    AS-11: fills the burn (pct - baseline) and the lanes started, then closes the switch only
#                              when the newest ledger row has every column (the Lead writes "Work lost" and "Lesson").
#   switch.sh status           one line.
# Env: SWITCH_DIR (default ~/.claude/xr-switch), CLAUDE_JSON (default ~/.claude.json), SWITCH_RULES (the rules file),
# NOW (epoch, tests). Test: check-switch.sh.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; PH="$(cd "$HERE/.." && pwd)"
D="${SWITCH_DIR:-$HOME/.claude/xr-switch}"; CJ="${CLAUDE_JSON:-$HOME/.claude.json}"; RF="${SWITCH_RULES:-$PH/rules/account-switch.md}"
now=${NOW:-$(date +%s)}; mkdir -p "$D" 2>/dev/null
ist() { TZ=Asia/Kolkata date -d "@$1" '+%Y-%m-%d %H:%M' 2>/dev/null || TZ=Asia/Kolkata date -r "$1" '+%Y-%m-%d %H:%M'; }
pct_ok() { [[ "${1:-}" =~ ^[0-9]{1,3}$ ]] && [ "$((10#$1))" -le 100 ]; }
opened() { sed -n 's/^opened=//p' "$D/open" 2>/dev/null; }
base() { [ -s "$D/baseline" ] && cut -d' ' -f1,2 "$D/baseline"; }
checklist() { grep -E '^\| AS-[0-9]+ \|' "$RF" 2>/dev/null | awk -F'|' '{gsub(/^ +| +$/, "", $2); gsub(/^ +| +$/, "", $3); gsub(/^ +| +$/, "", $4); print "  " $2 " (" $3 "): " $4}'; }
# The ledger's newest row as fields 1..7 (python: markdown cells may hold "|" only escaped; ours never do).
row() { python3 -I - "$RF" "$@" <<'PY'
import sys
f, op = sys.argv[1], sys.argv[2:]
L = open(f, encoding="utf-8").read().split("\n")
i = max((k for k, l in enumerate(L) if l.startswith("| 20") and l.count("|") == 8), default=None)
if op[0] == "get":
    print("" if i is None else "\t".join(c.strip() for c in L[i].strip("|").split("|")))
elif op[0] == "add":
    j = max((k for k, l in enumerate(L) if l.startswith("|")), default=len(L) - 1)
    L.insert(j + 1, "| " + " | ".join(op[1:]) + " |"); open(f, "w", encoding="utf-8").write("\n".join(L))
elif op[0] == "set":   # set <column 1..7> <value>: only a cell that is "—" (never overwrite what is written)
    if i is None: sys.exit(1)
    c = [x.strip() for x in L[i].strip("|").split("|")]; n = int(op[1]) - 1
    if c[n] == "—": c[n] = op[2]
    L[i] = "| " + " | ".join(c) + " |"; open(f, "w", encoding="utf-8").write("\n".join(L))
PY
}
case "${1:-}" in
  detect)
    [ -s "$CJ" ] || exit 0
    u=$(jq -r '.oauthAccount.accountUuid // empty' "$CJ" 2>/dev/null); [ -n "$u" ] || exit 0
    h=$(printf '%s' "$u" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-16)
    last=$(cat "$D/account" 2>/dev/null)
    if [ -z "$last" ]; then echo "$h" > "$D/account"; exit 0; fi
    if [ "$last" != "$h" ]; then
      echo "$h" > "$D/account"; printf 'opened=%s\n' "$now" > "$D/open"; rm -f "$D/baseline" "$D/starts" "$D/prepped"   # the next close-prep writes the next row
      echo "ACCOUNT SWITCH DETECTED ($(ist "$now") IST): this session runs on a different Claude account than the last one seen on this machine (OS-86, founder A417)."
      echo "Lane starts are refused until the minute-0 meter is recorded: get_usage, then bash product/tools/switch.sh baseline <weekly %> (AS-4)."
      echo "The checklist (product/rules/account-switch.md):"; checklist; exit 0
    fi
    if [ -s "$D/open" ] && [ ! -s "$D/baseline" ]; then
      echo "ACCOUNT SWITCH OPEN since $(ist "$(opened)") IST with no baseline: get_usage, then bash product/tools/switch.sh baseline <weekly %> (AS-4); lane starts are refused until then."; fi
    exit 0;;
  baseline)
    pct_ok "${2:-}" || { echo "usage: switch.sh baseline <weekly % 0-100>" >&2; exit 2; }
    [ -s "$D/open" ] || { echo "switch: no account switch is open; nothing recorded"; exit 1; }
    echo "$((10#$2)) $now" > "$D/baseline"; : > "$D/starts"
    [ -n "$(row get)" ] && [ "$(row get | cut -f3)" = "—" ] || row add "$(ist "$(opened)")" "not recorded" — — — — —
    row set 3 "$((10#$2))% ($(TZ=Asia/Kolkata date -d "@$now" +%H:%M 2>/dev/null || TZ=Asia/Kolkata date -r "$now" +%H:%M))"
    w=""; [ "$((10#$2))" -gt 5 ] && w=" Above 5%: stop and ask the founder whether this account was used this week (AS-4)."
    echo "switch: baseline ${2}% recorded at $(ist "$now") IST; lane starts allowed, at most 4 in 15 min and 12 in the first 2 h.$w"; exit 0;;
  gate)
    [ -s "$D/open" ] || exit 0
    if [ ! -s "$D/baseline" ]; then
      echo "Lane start refused (OS-86, founder A417): an account switch is open since $(ist "$(opened)") IST and the minute-0 meter is not recorded. Run get_usage, then bash product/tools/switch.sh baseline <weekly %> (AS-4)."; exit 1; fi
    bt=$(cut -d' ' -f2 "$D/baseline"); [ $((now - bt)) -ge 7200 ] && exit 0
    n15=$(awk -v t=$((now - 900)) '$1 > t' "$D/starts" 2>/dev/null | wc -l | tr -d ' '); nall=$(wc -l < "$D/starts" | tr -d ' ')
    [ "$nall" -ge 12 ] && { echo "Lane start refused (OS-86, AS-9): 12 lanes already started in the first 2 h after the switch; the next start is allowed at $(ist $((bt + 7200))) IST."; exit 1; }
    [ "$n15" -ge 4 ] && { echo "Lane start refused (OS-86, AS-8/AS-9): 4 lanes started in the last 15 min; read get_usage and start the next wave after 15 min, only if this wave cost under 4%."; exit 1; }
    echo "$now" >> "$D/starts"; exit 0;;
  close-prep)
    pct_ok "${2:-}" || { echo "usage: switch.sh close-prep <weekly % 0-100>" >&2; exit 2; }
    [ "$((10#$2))" -ge 94 ] || { echo "close-prep: not yet (${2}% weekly; AS-1 starts at 94%)"; exit 0; }
    left=""
    if [ ! -s "$D/prepped" ] || [ $((now - $(cat "$D/prepped"))) -gt 518400 ]; then   # one row per week's switch
      row add "$(ist "$now") (prep)" "$((10#$2))% ($(ist "$now" | cut -c12-))" — — — — —; echo "$now" > "$D/prepped"
      echo "close-prep: ledger row written in $(basename "$RF") (old meter ${2}%); commit it with the records"; fi
    R=$(git -C "$PH" rev-parse --show-toplevel 2>/dev/null)
    for f in STATE.md RESUME-ON-NEW-ACCOUNT.md; do
      [ -n "$(git -C "$R" status --porcelain -- "$PH/$f" 2>/dev/null)" ] && left="$left $f has uncommitted changes;"; done
    if ahead=$(git -C "$R" rev-list --count @{u}..HEAD 2>/dev/null); then [ "$ahead" = 0 ] || left="$left this branch has ${ahead} commit(s) not pushed;"
    else left="$left this branch has no upstream (push it with -u);"; fi
    if [ -n "$left" ]; then echo "close-prep: not done:$left then tell every lane to push and leave a hand-over comment (AS-1)"; exit 1; fi
    echo "close-prep: done (${2}% weekly): STATE and RESUME pushed, ledger row written; lanes: finish the step, push, hand-over comment (AS-1); then AS-2 at \"switching now\""; exit 0;;
  close)
    [ -s "$D/open" ] || { echo "switch: no account switch is open"; exit 0; }
    [ -s "$D/baseline" ] || { echo "switch: not closed: no baseline (AS-4)"; exit 1; }
    read -r bp bt < "$D/baseline"
    if pct_ok "${2:-}"; then row set 4 "$((10#$2 - bp)) points (${bp}% → ${2}%)"; fi
    [ $((now - bt)) -ge 7200 ] && row set 5 "$(wc -l < "$D/starts" | tr -d ' ')"
    r=$(row get); miss=""
    i=0; for name in "Switch" "Old meter at close-prep" "New meter at minute 0" "Burn first 2 h" "Lanes started first 2 h" "Work lost" "Lesson"; do
      i=$((i + 1)); v=$(printf '%s' "$r" | cut -f$i); [ -n "$v" ] && [ "$v" != "—" ] || miss="$miss \"$name\";"; done
    [ -z "$miss" ] || { echo "switch: not closed: the ledger row in $(basename "$RF") has no$miss (AS-11; the Lead writes Work lost and Lesson; burn needs: switch.sh close <weekly % now>, lanes: 2 h after the baseline)"; exit 1; }
    rm -f "$D/open" "$D/baseline" "$D/starts"; echo "switch: switch closed; commit the ledger row with the records"; exit 0;;
  status)
    if [ -s "$D/open" ]; then echo "switch: open since $(ist "$(opened)") IST; baseline $(base || echo none); starts $(wc -l < "$D/starts" 2>/dev/null | tr -d ' ' || echo 0)"
    else echo "switch: none open"; fi; exit 0;;
  *) echo "usage: switch.sh detect|baseline <pct>|gate|close-prep <pct>|close [<pct>]|status" >&2; exit 2;;
esac
