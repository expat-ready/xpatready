#!/usr/bin/env bash
# The Lead's start read (OS-16; P-615, P-440b): check-docs.sh sums the files product/LEAD-START.md lists (bytes / 4),
# prints the total, warns over 40k and fails over 70k or on a row naming a missing file, section or part. Throwaway
# copies, US$0.   bash product/tools/check-start-read.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/sread.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
docs_copy "$T/c"; Q="$T/c/$PRODREL"; cp "$TOOLS/start-read.py" "$Q/tools/"
run() { o=$(bash "$Q/tools/check-docs.sh" 2>/dev/null); rc=$?; }
has() { grep -qF -- "$1" <<<"$o"; }
big() { python3 -I -c 'import sys; open(sys.argv[1], "w").write("x" * int(sys.argv[2]))' "$1" "$2"; }   # a file of $2 bytes
rules() { printf '# R (as of **P-10**, x)\n\n| ID | Rule | Enforced by | As of |\n|---|---|---|---|\n| P-10 | r | prose | x |\n' > "$Q/RULES.md"; }
table() { { echo '# Start'; echo; echo '| # | File | Part | Why |'; echo '|---|---|---|---|'; local i=0; for r in "$@"; do i=$((i + 1)); echo "| $i | $r | why |"; done; } > "$Q/LEAD-START.md"; }
rules

run; ok "no LEAD-START.md: no start-read line, docs OK" "$([ "$rc" = 0 ] && ! has 'start read' && ! has 'START READ' && echo 1)" "$o"
big "$Q/A.md" 4000; table '`A.md` | all'; run
ok "under 40k: the total and each row's share print, exit 0" "$([ "$rc" = 0 ] && has 'start read: 1000 tokens (bytes / 4) over 1 row(s) of LEAD-START.md; warn over 40000, fail over 70000 (P-615): A.md 1.0k' && has 'docs OK' && ! has WARN && echo 1)" "$o"
big "$Q/A.md" 164000; run; ok "over 40k: a WARN line, still exit 0" "$([ "$rc" = 0 ] && has 'WARN  START READ: 41000 tokens is over the 40000 target' && echo 1)" "$o"
big "$Q/A.md" 160000; run; ok "exactly 40k: no WARN" "$([ "$rc" = 0 ] && ! has WARN && echo 1)" "$o"
big "$Q/A.md" 200000; mkdir -p "$T/c/top"; big "$T/c/top/X.md" 84000; table '`A.md` | all' '`top/X.md` | all'; run
ok "over 70k, summed over rows (one at the root): fails, names the fix" "$([ "$rc" = 1 ] && has 'start read: 71000 tokens' && has 'top/X.md 21.0k' && has 'START READ: 71000 tokens is over 70000 (P-615)' && echo 1)" "$o"
big "$Q/A.md" 4; table '`A.md` | all' '`GONE.md` | all'; run; ok "a row naming a missing file fails" "$([ "$rc" = 1 ] && has 'names GONE.md, which is not in product/ or at the root' && echo 1)" "$o"
table '`../../x.md` | all'; run; ok "a path out of the repository fails" "$([ "$rc" = 1 ] && has 'needs one backticked path inside the repository' && echo 1)" "$o"
table '`A.md` | some'; run; ok "an unknown Part fails" "$([ "$rc" = 1 ] && has "Part 'some' is not all" && echo 1)" "$o"
{ echo '| # | File | Part | Why |'; echo '|---|---|---|---|'; } > "$Q/LEAD-START.md"; run; ok "a table with no rows fails" "$([ "$rc" = 1 ] && has 'has no rows' && echo 1)" "$o"
python3 -I -c 'import sys
x = "y" * 396
open(sys.argv[1], "w").write("# B\n" + "z" * 8000 + "\n## Owners (who)\n" + x + "\n### Sub\n" + x + "\n## Later\n" + "z" * 8000 + "\n## Now\n" + x + "\n# Top\n" + "z" * 8000 + "\n")' "$Q/B.md"
table '`B.md` | § Owners · § Now'; run
ok "sections: from the heading to the next one at its level or above, subsections in, the rest out" "$([ "$rc" = 0 ] && has 'start read: 305 tokens' && echo 1)" "$o"
table '`B.md` | § Owners · § Gone'; run; ok "a missing section fails and names it" "$([ "$rc" = 1 ] && has "B.md has no heading starting 'Gone'" && echo 1)" "$o"
{ echo '| # | Date | Decision |'; echo '|---|---|---|'; printf '| P-12 | d | %0396d |\n' 0; printf '| P-11 | d | %0396d |\n' 0; printf '| P-10 | d | %08000d |\n' 0; printf '| P-9 | d | %08000d |\n' 0; } > "$Q/DECISIONS.md"
table '`DECISIONS.md` | rows newer than RULES as-of'; run
ok "DECISIONS rows newer than RULES' as-of only" "$([ "$rc" = 0 ] && has 'start read: 206 tokens' && echo 1)" "$o"
printf '# R, no marker\n' > "$Q/RULES.md"; run; ok "rows newer than as-of with no as-of on RULES: fails" "$([ "$rc" = 1 ] && has "first line has no 'as of **P-NNN**'" && echo 1)" "$o"
rules
printf 'import sys\nsys.exit(3)\n' > "$T/crash.py"; cp "$Q/tools/start-read.py" "$T/keep.py"; cp "$T/crash.py" "$Q/tools/start-read.py"; table '`A.md` | all'; run
ok "start-read.py failing with no output: check-docs fails" "$([ "$rc" = 1 ] && has 'start-read.py failed and printed nothing' && echo 1)" "$o"
cp "$T/keep.py" "$Q/tools/start-read.py"
# the real list: every row resolves on this copy, and the total is printed
R="$(cd "$TOOLS/../../../.." && pwd)"; o=$(python3 -I "$TOOLS/start-read.py" --product "$TOOLS/.." --root "$R" 2>&1); rc=$?
ok "the real LEAD-START.md: every row resolves, under the fail line" "$([ "$rc" = 0 ] && has 'start read: ' && ! has 'START READ: ' && echo 1)" "$o"
finish
