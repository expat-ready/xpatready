#!/usr/bin/env python3
"""Affected suites by module (SPD-2 item 2, P-802, founder 22 Nov): a PR's suite check runs the suites mapped to the
modules its change touches, plus the always-run set; the merge batch and the nightly still run every suite.

    git diff --name-only <base>...<head> | python3 product/tools/module-suites.py
    prints "<suite>\t<reason>" per chosen suite (the format of select-suites.mjs, so run-suites.sh reads either).

The map is the module cards (P-615, the one map of the modules; no second map file): a file in a card's `paths:` picks
the suites on that card's `Tests.` line and on the `Tests:` lines of its row files (<card>.rows/<ROW>.md, P-712).
#2370's capability -> module -> file -> suite graph is not on main yet; when it is, select-suites.mjs reads it
(SELECT_SUITES_GRAPH) for the files outside every card.
Every other file goes to select-suites.mjs --direct unchanged (tests, engine, contracts, samples, a check_* file, the
barrier files main.ts, core.ts and studio.ts, a card that lists no suite, a file no card owns); so does a module file
whose card names no existing suite. The always-run set is select-suites.mjs's smoke set (read from it: one list), and
its pure guards (GUARDS, guardSrc: always for a change to api/src, engine or p2, Lead 12, 24 Nov) are added for a module
file the same way, read from it too; a guardSrc this file cannot read stops it (exit 2) rather than drop the guards.
Reads files only; US$0. Test: product/tools/test-spd-2.sh."""
import importlib.util, os, re, subprocess, sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = subprocess.run(["git", "-C", TOOLS, "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
STUDIO = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
PROTO = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/"
BARRIER = {STUDIO + "api/src/" + f for f in ("main.ts", "core.ts", "studio.ts")}   # .mergify.yml barrier_files: every module builds on them


def load_cards():
    spec = importlib.util.spec_from_file_location("module_cards", os.path.join(TOOLS, "module-cards.py"))
    mc = importlib.util.module_from_spec(spec)
    os.environ.setdefault("ROOT", ROOT)
    mc.ROOT = ROOT
    spec.loader.exec_module(mc)
    mc.ROOT = ROOT
    mods, _ = mc.modules()
    return mc, mods


def suites_on_disk():
    out = {}
    for d in (STUDIO + "tests", STUDIO + "tests/runtime", PROTO + "tests"):
        p = os.path.join(ROOT, d)
        if os.path.isdir(p):
            for n in os.listdir(p):
                if re.match(r"check_.*\.(ts|cjs)$", n):
                    out.setdefault(n, d + "/" + n)
    return out


def card_suites(card):
    """Suite file names on a card's Tests. line and its row files' Tests: lines."""
    names = []
    text = open(os.path.join(ROOT, card), encoding="utf-8").read()
    m = re.search(r"^\*\*Tests\.\*\*(.*)$", text, re.M)
    lines = [m.group(1)] if m else []
    rows = os.path.join(ROOT, card[:-3] + ".rows")
    if os.path.isdir(rows):
        for r in sorted(os.listdir(rows)):
            if r.endswith(".md"):
                lines += [l[len("Tests:"):] for l in open(os.path.join(rows, r), encoding="utf-8") if l.startswith("Tests:")]
    for l in lines:
        names += re.findall(r"(check_[\w.-]+?\.(?:ts|cjs))\b", l)
    return list(dict.fromkeys(names))


def smoke():
    t = open(os.path.join(TOOLS, "select-suites.mjs"), encoding="utf-8").read()
    m = re.search(r"const SMOKE = \[([^\]]*)\]", t)
    return re.findall(r'"([^"]+)"', m.group(1)) if m else []


def guards():
    """select-suites.mjs's GUARDS names and guardSrc test, read from it (one rule): [] and None when it has no GUARDS."""
    t = open(os.path.join(TOOLS, "select-suites.mjs"), encoding="utf-8").read()
    g = re.search(r"^const GUARDS = \[([^\]]*)\]", t, re.M)
    if not g:
        return [], None
    names = re.findall(r'"([^"]+)"', g.group(1))
    m = re.search(r"^const guardSrc = \(f\) => /(.+?)/\.test\(f\) && \[([^\]]*)\]\.some\(\(d\) => f\.startsWith\(d\)\);$", t, re.M)
    if not m or not names:
        raise ValueError("select-suites.mjs: GUARDS or guardSrc changed shape; module-suites.py cannot read it")
    P = PROTO.rstrip("/").rsplit("/", 1)[0]
    sub = {"${S}": STUDIO.rstrip("/"), "${PR}": PROTO.rstrip("/"), "${P}": P}
    dirs = []
    for d in re.findall(r"`([^`]*)`", m.group(2)):
        for k, v in sub.items():
            d = d.replace(k, v)
        if "${" in d:
            raise ValueError(f"select-suites.mjs: guardSrc directory {d!r} not readable")
        dirs.append(d)
    if not dirs:
        raise ValueError("select-suites.mjs: guardSrc names no directory")
    ext = re.compile(m.group(1))
    return names, lambda f: bool(ext.search(f)) and any(f.startswith(d) for d in dirs)


def main(files):
    mc, mods = load_cards()
    disk = suites_on_disk()
    try:
        gnames, gsrc = guards()
    except ValueError as e:
        print(f"module-suites: {e}", file=sys.stderr); return 2
    picked, rest = {}, []
    for f in files:
        if f in BARRIER or not mc.in_src(f):
            rest.append(f); continue
        owners = mc.owners(f, mods)
        names = [s for o in owners for s in card_suites(mods[o][0]) if s in disk]
        if not names:
            rest.append(f); continue
        for o in owners:
            for s in card_suites(mods[o][0]):
                if s in disk:
                    picked.setdefault(s, f"module {o} ({os.path.basename(f)}): on its card")
        if gsrc and gsrc(f):   # select-suites.mjs adds these for --direct files itself
            for s in gnames:
                if s in disk:
                    picked.setdefault(s, f"pure guard: always for a change to api/src, engine or p2 ({os.path.basename(f)})")
    out = dict(picked)
    if rest:
        r = subprocess.run(["node", os.path.join(TOOLS, "select-suites.mjs"), "--direct"], input="\n".join(rest) + "\n",
                           capture_output=True, text=True, cwd=ROOT)
        if r.returncode:
            print(f"module-suites: select-suites.mjs --direct failed: {r.stderr.strip()[:300]}", file=sys.stderr); return 2
        for line in r.stdout.splitlines():
            if "\t" in line:
                s, why = line.split("\t", 1)
                out.setdefault(s, why)
    if out or files:
        for s in smoke():
            if s in disk: out.setdefault(s, "always-run set (select-suites.mjs smoke)")
    for s, why in out.items():
        print(f"{s}\t{why}")
    return 0


if __name__ == "__main__":
    fs = [l.strip() for l in sys.stdin if l.strip()]
    # Any change gets the always-run set (docs only too); pr-suites.yml runs suites only for a code change (change-kind.sh).
    sys.exit(main(fs))
