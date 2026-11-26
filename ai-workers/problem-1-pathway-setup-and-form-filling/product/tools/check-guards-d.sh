#!/usr/bin/env bash
# OS-85 (Lead 2, 26 Nov, "no hot spot"): every OS PR added its mutation block at the same place in check-guards.sh, so each
# landing conflicted with the next and forced a merge of main and a fresh review round (rounds 3-6 on #3699, #3635, #3418,
# #3811). The rows now live in product/tools/guards.d/, one file per item, sourced in name order. This check fails a PR
# that writes a row or a MUT block in check-guards.sh again, adds a block or rows to the frozen guards.d/000-base.sh,
# names a file other than 000-base.sh or OS-<id>.sh, or puts anything in an item file but comments, MUT="$MUT"'<rows>'
# blocks and TESTS="$TESTS <tests>" lines (a reset of MUT, or a command, would hide or run something). Each rule is
# proven on a planted break first. US$0, no network.   bash product/tools/check-guards-d.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/gd.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
# The frozen size of 000-base.sh at OS-85 (26 Nov): its MUT blocks and its rows. Rows may be fixed or retired (fewer),
# never added: a new item writes guards.d/OS-<id>.sh.
BASE_BLOCKS=16; BASE_ROWS=663
judge() {  # judge <tools dir> → one line per problem, nothing when it holds
  python3 -I - "$1" "$BASE_BLOCKS" "$BASE_ROWS" <<'PY'
import os, re, sys
tools, nb, nr = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); out = []
ROW = re.compile(r"^[^#|\s][^|]*\|[^|]+\|.*\|[\w.-]+\.(sh|py)$")
def lines(p):
    try: return open(p, encoding="utf-8").read().split("\n")
    except OSError as e: out.append(f"{os.path.relpath(p, tools)} cannot be read ({type(e).__name__})"); return []
g = lines(os.path.join(tools, "check-guards.sh"))
for i, l in enumerate(g, 1):
    s = l.strip().rstrip("'")
    if re.match(r"^MUT=(\"\$MUT\")?'", l.strip()) or ROW.match(s):
        out.append(f"check-guards.sh:{i} holds a mutation row or block: put it in guards.d/OS-<id>.sh (OS-85)"); break
d = os.path.join(tools, "guards.d")
names = sorted(os.listdir(d)) if os.path.isdir(d) else []
if "000-base.sh" not in names: out.append("guards.d/000-base.sh is missing")
for n in names:
    if not re.fullmatch(r"000-base\.sh|OS-\d+[a-z0-9]*\.sh", n):
        out.append(f"guards.d/{n}: name it OS-<id>.sh (only 000-base.sh and OS-<id>.sh are read in a known order)"); continue
    L = lines(os.path.join(d, n))
    if n == "000-base.sh":
        blocks = sum(1 for l in L if l.strip() == "MUT=\"$MUT\"'") + sum(1 for l in L if l.startswith("MUT='"))
        rows = sum(1 for l in L if ROW.match(l.strip().rstrip("'")) or ROW.match(l.strip().lstrip("MUT='").rstrip("'")))
        if blocks > nb: out.append(f"guards.d/000-base.sh has {blocks} MUT blocks, frozen at {nb}: a new item writes guards.d/OS-<id>.sh")
        if rows > nr: out.append(f"guards.d/000-base.sh has {rows} rows, frozen at {nr}: a new item writes guards.d/OS-<id>.sh")
        continue
    inside = False; any_row = False
    for i, l in enumerate(L, 1):
        s = l.strip()
        if inside:
            if s.endswith("'"): inside = False; s = s[:-1]
            if s and not ROW.match(s): out.append(f"guards.d/{n}:{i} is not a row (guard|file|sed edit|test)")
            elif s: any_row = True
            continue
        if not s or s.startswith("#"): continue
        if s == "MUT=\"$MUT\"'": inside = True; continue
        if re.fullmatch(r"TESTS=\"\$TESTS( [\w.-]+\.(sh|py))+\"(\s+#.*)?", s): continue
        out.append(f"guards.d/{n}:{i} is neither a comment, a MUT=\"$MUT\"' block nor a TESTS=\"$TESTS ...\" line: {s[:60]!r}")
    if inside: out.append(f"guards.d/{n}: a MUT block is not closed with '")
    if not any_row and not any(l.strip().startswith("TESTS=") for l in L): out.append(f"guards.d/{n}: no row and no test")
print("\n".join(out))
PY
}
TOOLSR="$TOOLS"
# Planted breaks, each on a copy of the real files (the rule is shown to fail, not only to pass).
mk() { rm -rf "$T/c"; mkdir -p "$T/c/guards.d"; cp "$TOOLSR/check-guards.sh" "$T/c/"; cp "$TOOLSR/guards.d/"*.sh "$T/c/guards.d/"; }
mk; printf '# x\nMUT="$MUT"'"'"'\nOSX a|product/tools/x.sh|s/a/b/|check-x.sh'"'"'\n' >> "$T/c/check-guards.sh"
ok "a block written inline in check-guards.sh fails" "$(judge "$T/c" | grep -q 'check-guards.sh:.* holds a mutation row' && echo 1)" "$(judge "$T/c")"
mk; printf 'OSX a|product/tools/x.sh|s/a/b/|check-x.sh\n' >> "$T/c/check-guards.sh"
ok "a bare row in check-guards.sh fails" "$(judge "$T/c" | grep -q 'holds a mutation row' && echo 1)" "$(judge "$T/c")"
mk; printf 'MUT="$MUT"'"'"'\nOSX a|product/tools/x.sh|s/a/b/|check-x.sh'"'"'\n' >> "$T/c/guards.d/000-base.sh"
ok "a new block in the frozen 000-base.sh fails" "$(judge "$T/c" | grep -q 'frozen at' && echo 1)" "$(judge "$T/c")"
mk; sed -i "0,/^OS18 wired|/s//OSX extra|product\/tools\/x.sh|s\/a\/b\/|check-x.sh\nOS18 wired|/" "$T/c/guards.d/000-base.sh"
ok "a row added inside an existing block of 000-base.sh fails" "$(judge "$T/c" | grep -q 'rows, frozen at' && echo 1)" "$(judge "$T/c")"
mk; printf 'MUT="$MUT"'"'"'\nOSX a|product/tools/x.sh|s/a/b/|check-x.sh'"'"'\n' > "$T/c/guards.d/zz-extra.sh"
ok "a guards.d file not named OS-<id>.sh fails" "$(judge "$T/c" | grep -q 'zz-extra.sh: name it' && echo 1)" "$(judge "$T/c")"
mk; printf "MUT='OSX a|product/tools/x.sh|s/a/b/|check-x.sh'\n" > "$T/c/guards.d/OS-99.sh"
ok "an item file that resets MUT (hiding every row before it) fails" "$(judge "$T/c" | grep -q 'OS-99.sh:1 is neither' && echo 1)" "$(judge "$T/c")"
mk; printf 'MUT="$MUT"'"'"'\nOSX a|product/tools/x.sh|s/a/b/|check-x.sh'"'"'\nrm -rf "$TOOLS"\n' > "$T/c/guards.d/OS-99.sh"
ok "an item file that runs a command fails" "$(judge "$T/c" | grep -q 'OS-99.sh:3 is neither' && echo 1)" "$(judge "$T/c")"
mk; printf 'MUT="$MUT"'"'"'\nnot a row\n'"'"'\n' > "$T/c/guards.d/OS-99.sh"
ok "a line in a block that is not a row fails" "$(judge "$T/c" | grep -q 'OS-99.sh:2 is not a row' && echo 1)" "$(judge "$T/c")"
mk; printf '# OS-99: an item\nMUT="$MUT"'"'"'\nOS99 a|product/tools/x.sh|s/a/b/|check-x.sh\nOS99 b|../../.github/workflows/x.yml|s/a/b/|check-x.sh'"'"'\nTESTS="$TESTS check-x.sh"   # its test\n' > "$T/c/guards.d/OS-99.sh"
ok "a well-formed item file (comment, a block of rows, a TESTS line) passes" "$([ -z "$(judge "$T/c")" ] && echo 1)" "$(judge "$T/c")"
# The real files.
real=$(judge "$TOOLSR")
ok "the real check-guards.sh holds no row, 000-base.sh is within its frozen size, every item file is well formed" "$([ -z "$real" ] && echo 1)" "$real"
ok "check-guards.sh sources guards.d in name order (C locale)" "$(grep -q 'for gd in $(cd "$TOOLS/guards.d" 2>/dev/null \&\& LC_ALL=C ls -- \*.sh 2>/dev/null); do . "$TOOLS/guards.d/$gd"; done' "$TOOLSR/check-guards.sh" && echo 1)" "no loader line"
finish
