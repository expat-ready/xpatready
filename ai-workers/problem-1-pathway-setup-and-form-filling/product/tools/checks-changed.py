#!/usr/bin/env python3
"""Checks weakened or removed (A351 C2, founder 24 Nov): a PR that removes or changes an existing check lists those checks for
the reviewer, and says why on a body line "Checks changed: <reason>". Report only: a warning without the reason, never a
failure (the founder is asked before it may block).
  A check  one assertion statement of a test file (studio tests, acceptance, journeys, product/tools check-*, test_*), from
           its first line to its closing bracket, known by its label (its first quoted words).
  Removed  its label is in no test file of the change any more. Changed: same label (or one reworded in its file), other text. A check only moved to
           another changed file, re-indented or with a new check beside it is neither. Added: a skip, an only, or a
           quarantine row (flaky-ledger.tsv), and a deleted test file.
It cannot tell weaker from stronger, and does not see a constant, fixture or helper a check uses: the reviewer reads each
listed line.
   printf '%s' "$BODY" | python3 -I product/tools/checks-changed.py --base REV [--head REV] [--summary FILE]
Exit 0; 2 when the change cannot be read (said, never "none"). Test: check-checks-changed.sh."""
import argparse, collections, difflib, re, subprocess, sys

P = "ai-workers/problem-1-pathway-setup-and-form-filling/"
TESTS = re.compile(re.escape(P) + r"(prototype/studio/(tests|acceptance)/.*\.(ts|cjs|mjs|js)|prototype/tests/.*\.(py|ts|cjs|mjs|js|sh)|product/tools/(check-[^/]+\.(sh|mjs|py)|test[_-][^/]+\.(py|sh)))$")
CALL = re.compile(r"(?:^|[\s;{(&|!])(?:await\s+)?((?:ok|check|step|expect|must|refused|self\.assert\w+|assert(?:\.\w+)*)\s*\()")
SHELL = re.compile(r"(?:^|[;&|{]\s*|\s{2,})(ok|okk|case_|warn|yes_|no_|fixed|unfixed)\s+(?=[\"'])")
LABEL = re.compile(r"(\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)")
SKIP = re.compile(r"\.(skip|only|todo|fixme)\(|\b(xit|xdescribe|fit)\(")
LEDGER = P + "product/tools/flaky-ledger.tsv"


def git(*a):
    r = subprocess.run(["git", "-c", "core.quotePath=false", *a], capture_output=True, text=True, errors="replace")
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "git failed").splitlines()[0][:120])
    return r.stdout


def bare(s):
    return LABEL.sub('""', s)


def checks(text, path):
    """[(label, whole text)] of every assertion statement."""
    lines, out, i = text.split("\n"), [], 0
    sh = path.endswith(".sh")
    while i < len(lines):
        l = lines[i]; s = l.strip()
        m = None if s.startswith(("//", "#", "*")) else (SHELL if sh else CALL).search(l)
        if not m:
            i += 1; continue
        body, j = [l[m.start(1):]], i
        if sh:
            while body[-1].endswith("\\") and j + 1 < len(lines):
                j += 1; body.append(lines[j])
        else:
            while j - i < 40 and bare("\n".join(body)).count("(") > bare("\n".join(body)).count(")") and j + 1 < len(lines):
                j += 1; body.append(lines[j])
        whole = re.sub(r"\s+", " ", " ".join(body)).strip()
        lab = LABEL.search(whole)
        label = re.sub(r"\s+", " ", lab.group(1)[1:-1]).strip() if lab else whole[:90]
        out.append((label, whole)); i = j + 1
    return out


def main():
    a = argparse.ArgumentParser(); a.add_argument("--base", required=True); a.add_argument("--head", default="HEAD"); a.add_argument("--summary"); o = a.parse_args()
    old, new, gone, skips, ledger = collections.defaultdict(list), collections.defaultdict(list), [], [], []
    raw = git("diff", "--raw", "-z", "--no-renames", "--no-abbrev", o.base, o.head).split("\0")
    files = [(raw[k].split()[4][0], raw[k + 1]) for k in range(0, len(raw) - 1, 2)]
    n = 0
    for st, path in files:
        if path == LEDGER:
            ledger += [l[1:] for l in git("diff", "--no-renames", "-U0", o.base, o.head, "--", path).splitlines() if l.startswith("+") and not l.startswith("+++") and "\tcheck_" in "\t" + l[1:]]
        if not TESTS.match(path):
            continue
        n += 1
        before = git("show", f"{o.base}:{path}") if st != "A" else ""
        after = git("show", f"{o.head}:{path}") if st != "D" else ""
        for x, y in checks(before, path):
            old[x].append((y, path))
        for x, y in checks(after, path):
            new[x].append((y, path))
        if st == "D":
            gone.append(path)
        was = collections.Counter(SKIP.findall(before)); now = collections.Counter(SKIP.findall(after))
        if sum(now.values()) > sum(was.values()):
            skips.append(path)
    rem, cha = [], []
    for label, its in old.items():
        left = collections.Counter(y for y, _ in new.get(label, []))
        lost = []
        for y, p in its:
            if left[y] > 0:
                left[y] -= 1
            else:
                lost.append((y, p))
        spare = [y for y, c in left.items() for _ in range(c)]
        for y, p in lost:
            (cha.append((p, label, y, spare.pop(0))) if spare else rem.append((p, label, y)))
    # A check whose label was reworded in the same file is changed, not removed: the nearest new label takes its place.
    fresh = [(p, x, y) for x, its in new.items() if x not in old for y, p in its]
    for q in list(rem):
        best = max(((difflib.SequenceMatcher(None, q[1], x).ratio(), k) for k, (p, x, _) in enumerate(fresh) if p == q[0]), default=(0, 0))
        if best[0] >= 0.6:
            rem.remove(q); cha.append((*q, fresh.pop(best[1])[2]))
    moved = {p for p in gone if not any(q == p for q, *_ in rem) and not any(q == p for q, *_ in cha)}
    gone = [p for p in gone if p not in moved]
    total = len(rem) + len(cha) + len(skips) + len(ledger) + len(gone)
    short = lambda p: p.replace(P, "")
    rows = [f"- removed: `{short(p)}`: {x[:160]}" for p, x, _ in rem] + [f"- changed: `{short(p)}`: {x[:160]}\n  - was: `{y[:220].replace('`', chr(39))}`\n  - now: `{z[:220].replace('`', chr(39))}`" for p, x, y, z in cha]
    rows += [f"- skip or only added: `{short(p)}`" for p in skips] + [f"- quarantine row added: `{l[:120]}`" for l in ledger] + [f"- test file deleted: `{short(p)}`" for p in gone]
    reason = re.search(r"(?im)^[\s*_-]*Checks changed[*_]*\s*:[*_]*[ \t]*(\S[^\n]{4,})$", re.sub(r"<!--.*?(?:-->|\Z)", "", sys.stdin.read().replace("\r", ""), flags=re.S))
    if not total:
        print(f"ok    checks: {n} test files in the change, no existing check removed or changed"); return
    head = f"{len(rem)} removed, {len(cha)} changed, {len(skips)} skips, {len(ledger)} quarantined, {len(gone)} files deleted"
    if o.summary:
        with open(o.summary, "a", encoding="utf-8") as fh:
            fh.write(f"### Checks weakened or removed? ({head}; A351 C2, report only)\nThe reviewer reads each: is the check weaker, and why? Reason given: {reason.group(1)[:200] if reason else 'none'}\n\n" + "\n".join(rows[:60]) + (f"\n- and {len(rows) - 60} more" if len(rows) > 60 else "") + "\n")
    for r in rows[:15]:
        print(r)
    if len(rows) > 15:
        print(f"... and {len(rows) - 15} more")
    if reason:
        print(f"ok    checks: {head}; reason given: {reason.group(1)[:160]}")
    else:
        print(f"::warning title=Checks changed (A351 C2)::{head}, and the body has no line saying why (one line, starting Checks changed and a colon); the list is in this run's summary")


try:
    main()
except Exception as e:
    print(f"::warning title=Checks changed (A351 C2)::not read ({type(e).__name__}: {str(e)[:120]})")
    sys.exit(2)
