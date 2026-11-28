#!/usr/bin/env python3
"""LR-090 (SF:A1): every ID code an instruction file uses has its prefix defined in product/GLOSSARY.md.

Reads the prefixes from the first cell of each row of GLOSSARY.md's table "Codes with a dash" (backticked, e.g. `PF-`),
then scans the instruction files (skills, agents, root CLAUDE.md and AGENTS.md, product WAY-OF-WORKING.md and RULES.md)
for codes PREFIX-<digit>. A code joined to the word or path before it (history/RULES-2026-…, TRACE-SA01B-…) is skipped,
and a prefix's trailing digits are dropped before the lookup (NFR5-14 -> NFR). Standard names listed in backticks under
"## Not codes" (`UTF-8`, `SHA-256`, ...) are skipped by prefix. A code right after another dash, or a prefix over six
characters, is missed (never wrongly flagged). Prints one "GLOSSARY:" line per problem
and exits 1; exit 0 when clean. Used by check-docs.sh; test: check-glossary.sh.
  python3 -I check-glossary.py --product <product dir> --root <repository root>
"""
import argparse, glob, os, re, sys

CODE = re.compile(r"(?<![A-Za-z0-9/_.\-])([A-Z][A-Z0-9]{0,5})-[0-9]")
HEAD = "## Codes with a dash"
NOT = "## Not codes"


def prefixes(text):
    """Prefixes defined in the dash table; None when the table is missing."""
    if HEAD not in text:
        return None
    body = text.split(HEAD, 1)[1].split("\n## ", 1)[0]
    found = set()
    for line in body.splitlines():
        if line.startswith("|") and not line.startswith("|---"):
            first = line.split("|")[1]
            found.update(re.findall(r"`([A-Z][A-Z0-9]*)-?`", first))
    return found


def stoplist(text):
    """Prefixes of the standard names in backticks under '## Not codes' (UTF-8 -> UTF); a token that is not a whole
    NAME-<digits> (a date, a path, P-854-P-859) adds nothing."""
    if NOT not in text:
        return set()
    body = text.split(NOT, 1)[1].split("\n## ", 1)[0]
    return {m.split("-", 1)[0] for m in re.findall(r"`([^`]+)`", body) if re.fullmatch(r"[A-Z][A-Z0-9]*-[0-9]+", m)}


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--product", required=True)
    a.add_argument("--root", required=True)
    o = a.parse_args()
    g = os.path.join(o.product, "GLOSSARY.md")
    if not os.path.isfile(g):
        print("GLOSSARY: product/GLOSSARY.md is missing: ID codes have no plain names (LR-090)")
        return 1
    text = open(g, encoding="utf-8").read()
    known = prefixes(text)
    if not known:
        print("GLOSSARY: product/GLOSSARY.md has no '%s' table with backticked prefixes (LR-090)" % HEAD)
        return 1
    skip = stoplist(text)
    files = sorted(glob.glob(os.path.join(o.root, ".claude/skills/*/*.md")) + glob.glob(os.path.join(o.root, ".claude/agents/*.md")))
    files += [os.path.join(o.root, f) for f in ("CLAUDE.md", "AGENTS.md")]
    files += [os.path.join(o.product, f) for f in ("WAY-OF-WORKING.md", "RULES.md")]
    bad = {}
    for f in files:
        if not os.path.isfile(f):
            continue
        for n, line in enumerate(open(f, encoding="utf-8"), 1):
            for m in CODE.finditer(line):
                p = m.group(1)
                if p in skip:
                    continue
                if p in known or p.rstrip("0123456789") in known:
                    continue
                bad.setdefault(p, "%s:%d" % (os.path.relpath(f, o.root), n))
    for p in sorted(bad):
        print("GLOSSARY: code prefix '%s-' (first at %s) has no row in product/GLOSSARY.md: add its plain name there (LR-090)" % (p, bad[p]))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
