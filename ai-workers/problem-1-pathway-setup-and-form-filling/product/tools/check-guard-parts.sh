#!/usr/bin/env bash
# The guards run in parts (Lead 5, 23 Nov: 363 mutation rows no longer fit one 45-minute job; run 137634775496 was
# cancelled at the limit). check-guards.sh --mutate --part i/n runs every n-th mutation row from row i (round robin) and the
# plain tests in part 1 only; guards.yml runs the parts as a matrix and one closing job named "guards" is green only when
# every part succeeded. This proves the parts cover every test and every row exactly once, for any n, and the wiring.
#   bash product/tools/check-guard-parts.sh            US$0, no network; --list runs nothing
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/gparts.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
G="$TOOLS/check-guards.sh"; W="$TOOLS/../../../../.github/workflows/guards.yml"
# What the parts must cover, read independently of --list: the TESTS line plus its two extra tests, and the MUT rows as
# bash builds them.
eval "$(grep '^TESTS=' "$G")"; want_t=$(printf 'TEST %s\n' $TESTS check-deps-line.sh check-pr-concurrency.sh | sort)
MUT=""; eval "$(sed -n '/^MUT=/,/--- each test without its guard/p' "$G" | sed '$d')"
want_r=$(printf '%s\n' "$MUT" | grep -c .)
bash "$G" --mutate --part 1/1 --list > "$T/all" 2>&1; r=$?
ok "--list --part 1/1: every test once and every mutation row once ($want_r rows), exit 0, nothing run" "$([ $r = 0 ] && [ "$(grep '^TEST ' "$T/all" | sort)" = "$want_t" ] && [ "$(grep -c '^ROW ' "$T/all")" = "$want_r" ] && [ "$(grep -c '^ROW ' "$T/all")" = "$(grep '^ROW ' "$T/all" | cut -d' ' -f2 | sort -u | wc -l | tr -d ' ')" ] && echo 1)" "exit $r; $(grep -c '^ROW ' "$T/all") rows listed, $want_r wanted; $(head -3 "$T/all")"
for n in 2 3 4 5 7; do
  : > "$T/u"; for i in $(seq 1 $n); do bash "$G" --mutate --part "$i/$n" --list >> "$T/u" 2>&1; done
  ok "parts 1..$n together cover every test and every row exactly once" "$([ "$(sort "$T/u")" = "$(sort "$T/all")" ] && echo 1)" "$(diff <(sort "$T/all") <(sort "$T/u") | head -4)"
done
ok "the plain tests run in part 1 only" "$(! bash "$G" --mutate --part 2/4 --list | grep -q '^TEST ' && bash "$G" --mutate --part 1/4 --list | grep -q '^TEST ' && echo 1)" "tests listed outside part 1"
for bad in 0/4 5/4 x 3 1/0; do bash "$G" --mutate --part "$bad" --list > /dev/null 2>&1; r=$?
  ok "--part $bad is refused (exit 2), never a silent empty part" "$([ $r = 2 ] && echo 1)" "exit $r"; done
# guards.yml: the matrix, the closing job, the limit
w=$(python3 - "$W" <<'PY'
import sys, re, yaml
d = yaml.safe_load(open(sys.argv[1])); j = d.get("jobs") or {}; out = []
p, g = j.get("part") or {}, j.get("guards") or {}
parts = ((p.get("strategy") or {}).get("matrix") or {}).get("part") or []
n = len(parts)
if parts != list(range(1, n + 1)) or n < 2: out.append("matrix part is not 1..N: %r" % parts)
if (p.get("strategy") or {}).get("fail-fast") is not False: out.append("part: fail-fast is not false (a red part would cancel the others)")
if p.get("timeout-minutes") != 45: out.append("part: timeout-minutes is not 45")
run = " ".join(str(s.get("run", "")) for s in p.get("steps") or [])
if not re.search(r"check-guards\.sh --mutate --part \$\{\{ matrix\.part \}\}/%d\b" % n, run): out.append("part: no check-guards.sh --mutate --part ${{ matrix.part }}/%d" % n)
if g.get("name", "guards") != "guards": out.append("the closing job is not named guards")
if g.get("needs") not in ("part", ["part"]): out.append("guards: does not need part")
if "always()" not in str(g.get("if", "")): out.append("guards: no always(), so a failed or cancelled part would leave it skipped (skipped reads as passing)")
gs = " ".join(str(s.get("run", "")) + str(s.get("env", "")) for s in g.get("steps") or [])
if "needs.part.result" not in gs or "success" not in gs: out.append("guards: does not require needs.part.result == success")
if any("uses" in s for s in g.get("steps") or []): out.append("guards: checks out or runs an action (it should only judge the parts)")
print("; ".join(out) or "ok")
PY
)
ok "guards.yml: a matrix of parts 1..N (no fail-fast, 45 min each) running --part i/N, and one closing job named guards, run always(), green only when needs.part.result is success" "$([ "$w" = ok ] && echo 1)" "$w"
finish
