#!/usr/bin/env bash
# CODEOWNERS check (lab register LR-061; Done when: ".github/CODEOWNERS on main names owners for .github/**,
# migrations and pipeline tools"):
#   C0  .github/CODEOWNERS exists; every line that is not blank or a comment is "<pattern> <owner>...".
#   C1  every owner is written as GitHub reads it: @user, @org/team or an e-mail address.
#   C2  each guarded path (workflows, the merge queue, hooks, agents' settings, migrations and schema, pipeline tools)
#       is owned: the LAST matching line (GitHub's rule) names at least one owner. A later line that re-matches a
#       guarded path with no owner un-owns it, and fails here.
#   C3  each guarded path's folder exists in this checkout, so a moved folder (say the migrations path) fails here
#       instead of leaving a stale line that owns nothing.
# Matching follows GitHub's CODEOWNERS syntax (gitignore rules without "!" and "[]"): a leading "/" or an inner "/"
# anchors at the root, a trailing "/" owns everything below, "*" stays in one folder, "**" crosses folders.
# Whether GitHub itself accepts the owners (the team exists, can write) is its own API, read on the PR:
#   gh api 'repos/expat-ready/xpatready/codeowners/errors?ref=<branch>'  -> {"errors":[]}
# First proves on fixtures that each rule fails when broken, then checks this checkout. Runs in ci (the tools step).
#   bash product/tools/check-codeowners.sh [repo-root]
# US$0, no network.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="${1:-$(cd "$TOOLS/../../../.." && pwd)}"
python3 -I - "$ROOTD" <<'PY'
import os, re, shutil, sys, tempfile
P = "ai-workers/problem-1-pathway-setup-and-form-filling"
GUARDED = [  # (sample path, its folder that must exist; "" = the root)
    (".github/workflows/ci.yml", ".github/workflows"),
    (".github/CODEOWNERS", ".github"),
    (".mergify.yml", ""),
    (".githooks/pre-push", ".githooks"),
    (".claude/settings.json", ".claude"),
    ("REVIEW.md", ""),
    (f"{P}/prototype/studio/prisma/migrations/20990101000000_x/migration.sql", f"{P}/prototype/studio/prisma/migrations"),
    (f"{P}/prototype/studio/prisma/schema/x.prisma", f"{P}/prototype/studio/prisma/schema"),
    (f"{P}/product/tools/queue-gate.sh", f"{P}/product/tools"),
    (f"{P}/product/tools/guards.d/OS-99.sh", f"{P}/product/tools/guards.d"),
    (f"{P}/prototype/studio/tools/gate-b.mjs", f"{P}/prototype/studio/tools"),
]
OWNER = re.compile(r'^(@[A-Za-z0-9][A-Za-z0-9-]*(/[A-Za-z0-9._-]+)?|[^@\s]+@[^@\s]+\.[^@\s]+)$')

def rx(pat):
    anchored = pat.startswith("/") or "/" in pat.strip("/")
    p = pat.strip("/") if pat != "/" else ""
    out, i = "", 0
    while i < len(p):
        # "**/" matches zero or more folders ("**/x" owns a root x too; "a/**/b" owns a/b).
        if p.startswith("**/", i): out += "(?:.*/)?"; i += 3
        elif p.startswith("**", i): out += ".*"; i += 2
        elif p[i] == "*": out += "[^/]*"; i += 1
        elif p[i] == "?": out += "[^/]"; i += 1
        else: out += re.escape(p[i]); i += 1
    head = "^" if anchored else "^(?:.*/)?"
    # GitHub: "docs/*" owns docs/a.md but not docs/a/b.md; a trailing "/" owns everything below.
    tail = "/.*$" if pat.endswith("/") else ("$" if p.split("/")[-1] == "*" and p != "*" else "(?:/.*)?$")
    return re.compile(head + out + tail)

def parse(text):
    rules, errs = [], []
    for n, line in enumerate(text.splitlines(), 1):
        s = line.split(" #", 1)[0].strip() if not line.lstrip().startswith("#") else ""
        if not s: continue
        parts = s.split()
        pat, owners = parts[0], parts[1:]
        if pat.startswith("!") or "[" in pat:
            errs.append(f"C0 line {n}: `{pat}` uses syntax CODEOWNERS does not support (! or [])")
        for o in owners:
            if not OWNER.match(o): errs.append(f"C1 line {n}: owner `{o}` is not @user, @org/team or an e-mail")
        rules.append((n, pat, owners, rx(pat)))
    return rules, errs

def owner_of(rules, path):
    hit = None
    for r in rules:
        if r[3].match(path): hit = r
    return hit

def check(root):
    f = os.path.join(root, ".github", "CODEOWNERS")
    if not os.path.isfile(f): return ["C0 .github/CODEOWNERS is missing"]
    rules, errs = parse(open(f, encoding="utf-8").read())
    for path, folder in GUARDED:
        if folder and not os.path.isdir(os.path.join(root, folder)):
            errs.append(f"C3 {folder}/ does not exist in this checkout: the guarded list (check-codeowners.sh) is stale")
        hit = owner_of(rules, path)
        if hit is None: errs.append(f"C2 {path}: no line owns it")
        elif not hit[2]: errs.append(f"C2 {path}: line {hit[0]} (`{hit[1]}`) matches it last and names no owner")
    return errs

# --- self-test: matcher cases, then each rule broken on a copy of the folder tree -------------------------------
cases = [("/.github/", ".github/workflows/ci.yml", True), ("/.github/", "x/.github/a", False),
         ("*.js", "a/b/c.js", True), ("docs/*", "docs/a.md", True), ("docs/*", "docs/a/b.md", False),
         ("/docs/**/x.md", "docs/a/b/x.md", True), ("apps/", "z/apps/y", True), ("*", "any/thing", True),
         ("/REVIEW.md", "REVIEW.md", True), ("/REVIEW.md", "a/REVIEW.md", False),
         ("**/.github/", ".github/a", True), ("/docs/**/x.md", "docs/x.md", True)]
bad = [c for c in cases if bool(rx(c[0]).match(c[1])) != c[2]]
if bad:
    print("FAIL  matcher:", bad); sys.exit(1)
root = sys.argv[1]
good = open(os.path.join(root, ".github", "CODEOWNERS"), encoding="utf-8").read() if os.path.isfile(os.path.join(root, ".github", "CODEOWNERS")) else None
def tree(text):
    d = tempfile.mkdtemp()
    for _, folder in GUARDED:
        if folder: os.makedirs(os.path.join(d, folder), exist_ok=True)
    os.makedirs(os.path.join(d, ".github"), exist_ok=True)
    if text is not None: open(os.path.join(d, ".github", "CODEOWNERS"), "w").write(text)
    return d
FULL = "".join(f"/{g[0]} @o/t\n" for g in GUARDED)
fixtures = [
    ("every guarded path owned", FULL, None),
    ("file missing", None, "C0"),
    ("migrations not owned", "".join(f"/{g[0]} @o/t\n" for g in GUARDED if "migrations" not in g[0]), "C2"),
    ("a later ownerless line un-owns the tools", FULL + f"/{P}/ \n", "C2"),
    ("owner without @", FULL.replace("@o/t", "o/t", 1), "C1"),
    ("negation", FULL + "!/x\n", "C0"),
]
failed = 0
def check_tmp(d):
    try: return check(d)
    finally: shutil.rmtree(d, ignore_errors=True)
for name, text, want in fixtures:
    errs = check_tmp(tree(text))
    got = sorted({e[:2] for e in errs})
    ok = (not errs) if want is None else (want in got)
    print(("ok    " if ok else "FAIL  ") + f"fixture: {name} -> {got or 'clean'}")
    failed += not ok
d = tree(FULL); os.rmdir(os.path.join(d, P, "prototype/studio/prisma/schema"))
errs = check_tmp(d); ok = any(e.startswith("C3") for e in errs)
print(("ok    " if ok else "FAIL  ") + "fixture: a guarded folder moved away -> C3"); failed += not ok
if failed:
    print(f"FAIL  {failed} self-test fixture(s): the check cannot be trusted"); sys.exit(1)
errs = check(root)
for e in errs: print("FAIL  " + e)
if errs: sys.exit(1)
print(f"PASS  .github/CODEOWNERS owns all {len(GUARDED)} guarded paths (workflows, merge queue, hooks, agents, migrations and schema, pipeline tools)")
PY
