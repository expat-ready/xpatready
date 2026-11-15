#!/usr/bin/env python3
"""Module cards (P-615 (3)): a PR that changes files in a module also changes that module's card, unless its body says
`Card unchanged: <reason>`. The module map is .claude/rules/modules/*.md: each is a symlink to its card (MODULE*.md next
to the code), whose `paths:` frontmatter is the module's files, so a lane editing them loads only that card. US$0.
  python3 product/tools/module-cards.py tree                  # every card resolves, is at most 40 lines; every src file in one module
  python3 product/tools/module-cards.py pr <changed-files> [<body-file>]   # the PR check (run by .github/workflows/module-cards.yml)
ROOT (env) is the repository root, default the current directory."""
import os, re, subprocess, sys

ROOT = os.environ.get("ROOT", ".")
RULES = ".claude/rules/modules"
STUDIO = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
SRC = (STUDIO + "api/src/", STUDIO + "web/src/")
MAX_LINES = 40


def braces(p):
    m = re.search(r"\{([^{}]*)\}", p)
    if not m:
        return [p]
    return [x for alt in m.group(1).split(",") for x in braces(p[:m.start()] + alt + p[m.end():])]


def regex(glob):
    out, i = "", 0
    while i < len(glob):
        if glob.startswith("**/", i): out += "(?:.*/)?"; i += 3
        elif glob.startswith("**", i): out += ".*"; i += 2
        elif glob[i] == "*": out += "[^/]*"; i += 1
        elif glob[i] == "?": out += "[^/]"; i += 1
        else: out += re.escape(glob[i]); i += 1
    return re.compile(out + r"\Z")


def modules():
    """name -> (card path relative to ROOT, [compiled patterns]); problems found on the way."""
    mods, bad = {}, []
    for f in sorted(os.listdir(os.path.join(ROOT, RULES))):
        if not f.endswith(".md"):
            continue
        rule = os.path.join(ROOT, RULES, f)
        if not os.path.islink(rule) or not os.path.isfile(rule):
            bad.append(f"{RULES}/{f}: not a symlink to an existing card"); continue
        card = os.path.relpath(os.path.realpath(rule), os.path.realpath(ROOT))
        text = open(rule, encoding="utf-8").read()
        fm = re.match(r"---\n(.*?)\n---\n", text, re.S)
        key = re.search(r"^paths:[ \t]*\n((?:[ \t]+-.*(?:\n|\Z))+)", fm.group(1), re.M) if fm else None   # Claude Code reads only `paths:`
        pats = re.findall(r'^\s*-\s*"([^"]+)"\s*$', key.group(1), re.M) if key else []
        if not pats:
            bad.append(f"{card}: no `paths:` list in its frontmatter"); continue
        n = text.count("\n") + (0 if text.endswith("\n") else 1)
        if n > MAX_LINES:
            bad.append(f"{card}: {n} lines, over {MAX_LINES}")
        if not os.path.basename(card).startswith("MODULE"):
            bad.append(f"{card}: a card is named MODULE.md or MODULE.<name>.md")
        mods[f[:-3]] = (card, [regex(x) for p in pats for x in braces(p)])
    return mods, bad


def owners(path, mods):
    return [n for n, (_, pats) in mods.items() if any(r.match(path) for r in pats)]


def in_src(path):
    return path.startswith(SRC) and not re.match(r"MODULE(\.[\w-]+)?\.md\Z", os.path.basename(path))


def tree():
    mods, bad = modules()
    files = subprocess.run(["git", "-C", ROOT, "ls-files", *SRC], capture_output=True, text=True, check=True).stdout.split()
    linked = {c for c, _ in mods.values()}
    for f in files:
        if f.startswith(SRC) and re.match(r"MODULE(\.[\w-]+)?\.md\Z", os.path.basename(f)) and f not in linked:
            bad.append(f"{f}: a card no rule in {RULES}/ links to")
        o = owners(f, mods)
        if in_src(f) and len(o) != 1:
            bad.append(f"{f}: in {len(o)} modules ({', '.join(o) or 'none'}); exactly one card's `paths:` must claim it")
    return mods, bad


def pr(changed, body):
    mods, bad = modules()
    # One line, optionally a list item or bold: "Card unchanged: <why>"; the placeholder itself or punctuation is no reason.
    reason = re.search(r"^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?Card unchanged:(?:\*\*)?[ \t]*(.*?)[ \t\r]*$", body, re.M)
    if reason and (not re.search(r"\w", reason.group(1)) or re.fullmatch(r"<[^>]*>", reason.group(1))):
        reason = None
    touched, unclaimed = {}, []
    cards = {c for c, _ in mods.values()}
    for f in changed:
        if f in cards:
            continue
        o = owners(f, mods)
        if in_src(f) and not o and os.path.exists(os.path.join(ROOT, f)):   # a deleted or renamed-away file needs no claim
            unclaimed.append(f)
        for n in o:
            touched.setdefault(n, []).append(f)
    missing = [n for n in sorted(touched) if mods[n][0] not in changed]
    for n in missing:
        print(f"module {n}: {len(touched[n])} file(s) changed ({touched[n][0]} …), card {mods[n][0]} not")
    for f in unclaimed:
        print(f"{f}: no module claims it; add it to a card's `paths:`")
    if (missing or unclaimed) and reason:
        print(f"PASS  Card unchanged: {reason.group(1).strip()}")
        missing, unclaimed = [], []
    for b in bad:
        print(f"FAIL  {b}")
    if missing or unclaimed:
        print("FAIL  update the card(s) in this PR, or put `Card unchanged: <reason>` in the PR body (P-615 (3))")
    ok = not (bad or missing or unclaimed)
    print(f"{'PASS' if ok else 'FAIL'}  module cards: {len(touched)} module(s) touched, {len(mods)} cards")
    return 0 if ok else 1


if __name__ == "__main__":
    if sys.argv[1:2] == ["tree"]:
        mods, bad = tree()
        for b in bad: print(f"FAIL  {b}")
        print(f"{'PASS' if not bad else 'FAIL'}  module cards: {len(mods)} cards, tree checked")
        sys.exit(1 if bad else 0)
    if sys.argv[1:2] == ["pr"] and len(sys.argv) >= 3:
        changed = [l.strip() for l in open(sys.argv[2], encoding="utf-8") if l.strip()]
        body = open(sys.argv[3], encoding="utf-8").read() if len(sys.argv) > 3 else ""
        sys.exit(pr(changed, body))
    print(__doc__); sys.exit(2)
