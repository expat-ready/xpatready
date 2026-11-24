#!/usr/bin/env python3
"""Checks weakened or removed (A351 C2, founder 24 Nov): a PR that removes or changes lines of an existing test lists those
lines for the reviewer, and says why on a body line "Checks changed: <reason>". Report only: a warning without the reason,
never a failure (the founder is asked before it may block).
  Lists    each existing line a PR removes or changes in a test file (studio tests, acceptance, prototype/tests, journeys,
           product/tools check-* and test*, guard-test-lib.sh, packages __tests__, deploy tests), old beside new; a line that
           only moved to another changed test, was re-wrapped or re-indented, a blank line or a comment is not listed; a
           suite that left the place the runner reads (deleted, renamed or moved); a suite added to run-suites.sh's
           QUARANTINE or SKIP, any flaky-ledger.tsv line changed; an added skip, only, early exit or "if (false)".
  Warns    when a listed line looks like a check (or a suite left, or something was switched off) and no reason is given.
  Limits   a check put under an added condition without its own line changing otherwise, a line only added (a weaker value set
           above a check) and tools that carry their own --self-test are not seen.
  No parser: it cannot tell a check from its helper, nor weaker from stronger, and does not see a constant or fixture outside
           these files. The reviewer reads each listed line.
   printf '%s' "$BODY" | python3 -I product/tools/checks-changed.py --base REV [--head REV] [--summary FILE]
Exit 0; 2 when the change cannot be read (said, never "none"). Linear in the size of the change; pr-rules.yml gives it 30 s.
Test: check-checks-changed.sh."""
import argparse, collections, html, os, re, subprocess, sys

P = "ai-workers/problem-1-pathway-setup-and-form-filling/"
CODE = r"\.(ts|tsx|cjs|mjs|js|py|sh)$"
TESTS = re.compile(r"^(" + re.escape(P) + r"(prototype/studio/(tests|acceptance|deploy/.*test)/|prototype/tests/|product/tools/(check-|test[_-]|guard-test-lib)|deploy/.*test/)|(.*/)?packages/.*__tests__/|deploy/.*test/).*" + CODE + "|^" + re.escape(P) + r"product/tools/(check-[^/]+|test[_-][^/]+|guard-test-lib)\.(sh|mjs|py)$", re.S)
RUN = re.compile(r"^" + re.escape(P) + r"(prototype/studio/tests/check_[^/]+|prototype/studio/acceptance/[^/]+\.test\.ts|prototype/studio/tests/journeys/j_[^/]+|product/tools/(check-|test[_-])[^/]+)$", re.S)
SUITES, LEDGER = P + "product/tools/run-suites.sh", P + "product/tools/flaky-ledger.tsv"
OFF = re.compile(r"\.(skip|only|todo|fixme|skipIf)\b|\b(xit|xdescribe|fit|skipTest|skipIf|skipUnless)\(|\bskip:\s*true|\bif\s*\(\s*(false|0)\s*\)|^\s*if (False|0)\s*:|(^|[;{]\s*)process\.exit\(0\)|^\s*(exit 0|return)\s*(;|$|[#/])|^\s*(if false|false &&|: *<<)|\|\| true\b|^\s*/\*\s*$|^\s*[`'\"]{3}\s*$", re.M)
PLAIN = re.compile(r"^\s*(import\b|export\s+(\{|\*|type|interface)|(export\s+)?(const|let|var|function|async function|type|interface|class)\b|from\b|def (?!test)|class\b|[\])};,]*\s*$|set -|\. \"|(local|declare)\b)")
NOTE = re.compile(r"^\s*(//|#(?!!)|\*|/\*)|^\s*$")
LISTS = re.compile(r'^\s*(QUARANTINE|SKIP)\+?=["\']([^"\']*)["\']', re.M)


def git(*a):
    r = subprocess.run(["git", "-c", "core.quotePath=false", *a], capture_output=True, text=True, errors="replace")
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "git failed").splitlines()[0][:120])
    return r.stdout


def safe(s, n=220):
    """One printable line no workflow command or markup can be made of."""
    s = re.sub(r"[\x00-\x1f\x7f  ]+", " ", s).replace("::", ":​:").replace("##[", "#​#[").replace("`", "'")
    return s if len(s) <= n else s[:n] + "…"


def words(lines):
    """The words of a place, line ends and indentation left out (a re-wrap), spaces inside a line kept as one."""
    return " ".join(" ".join(lines).split())


def around(a, b, n=200):
    """Both lines cut to the same window round their first difference, so a long line still shows it."""
    k = len(os.path.commonprefix([a, b])); s = max(0, k - 60)
    f = lambda x: ("…" if s else "") + safe(x[s:s + n], n + 1)
    return f(a), f(b)


def hunks(base, head, path):
    """[(old lines, new lines)] of each changed place in one file."""
    out = []
    for l in git("diff", "--no-renames", "--no-ext-diff", "--no-textconv", "--text", "-U0", "--no-color", base, head, "--", ":(literal)" + path).split("\n"):
        if l.startswith("@@"):
            out.append(([], []))
        elif out and l.startswith("-"):
            out[-1][0].append(l[1:])
        elif out and l.startswith("+"):
            out[-1][1].append(l[1:])
    return out


def like(path, l):
    """A listed line that may be a check: in a file the runner reads, anything but an import, a declaration or a bracket."""
    return bool(RUN.match(path) or "guard-test-lib" in path or "__tests__" in path or "/test/" in path or "prototype/tests" in path) and not PLAIN.match(l)


def reason(body):
    body = re.sub(r"<!--.*?(?:-->|\Z)", "", body.replace("\r", ""), flags=re.S); fence = False
    for l in body.split("\n"):
        s = l.strip()
        if s.startswith(("```", "~~~")):
            fence = not fence; continue
        m = None if fence or s.startswith(">") else re.match(r"[-* _]*checks changed[* _]*:[* _]*(.*)$", s, re.I)
        if m and len(m.group(1)) >= 8 and not re.match(r"(<|none\b|n/a|tbd|-)", m.group(1), re.I):
            return m.group(1)
    return ""


def main():
    a = argparse.ArgumentParser(); a.add_argument("--base", required=True); a.add_argument("--head", default="HEAD"); a.add_argument("--summary"); o = a.parse_args()
    raw = git("diff", "--raw", "-z", "--no-renames", "--no-abbrev", o.base, o.head).split("\0")
    files = [(*raw[k].split()[2:4], raw[k].split()[4][0], raw[k + 1]) for k in range(0, len(raw) - 1, 2)]
    added = {n: p for _, n, st, p in files if st == "A"}
    places, gone, off, lists, tests = [], [], [], [], 0
    new, where = collections.Counter(), {}
    for _, _, st, path in files:
        if path == LEDGER:
            lists += [f"flaky-ledger.tsv {'removed' if k == 0 else 'added'}: {safe(l)}" for h in hunks(o.base, o.head, path) for k in (0, 1) for l in h[k] if not NOTE.match(l)]
        if path == SUITES and st == "M":
            was, now = (collections.defaultdict(str) for _ in (0, 1))
            for d, r in ((was, o.base), (now, o.head)):
                for k, v in LISTS.findall(git("show", f"{r}:{path}")):
                    d[k] += " " + v
            for k in sorted(set(was) | set(now)):
                more = set(now.get(k, "").split()) - set(was.get(k, "").split())
                if more:
                    lists.append(f"run-suites.sh {k} gains: {safe(' '.join(sorted(more)))}")
        if not TESTS.match(path):
            continue
        tests += 1
        got = hunks(o.base, o.head, path)
        if st == "M" and not got:
            lists.append(f"changed, not read: {safe(path.replace(P, ''))}")
        for old, nw in got:
            places.append((path, st, old, nw))
            for l in nw:      # a line counts as moved only to a file the runner reads (or its own), and only if it says something
                k = " ".join(l.split())
                for q in ({"*"} if RUN.match(path) else set()) | {path}:
                    new[(q, k)] += 1
    for ob, _, st, path in files:
        if st == "D" and (RUN.match(path) or TESTS.match(path)):
            to = added.get(ob); ok = to and bool(RUN.match(to)) == bool(RUN.match(path)) and to.rsplit("/", 1)[0] == path.rsplit("/", 1)[0]
            if not ok:
                gone.append((path, to))
    rows = []
    for path, st, old, nw in places:
        for l in nw:
            if OFF.search(l) and (l.strip() == "/*" or not NOTE.match(l)) and not any(" ".join(l.split()) == " ".join(x.split()) for x in old) and st != "A":
                off.append((path, l))
        if not old or words(old) == words(nw):
            continue
        left = []
        for l in old:
            k = " ".join(l.split())
            if NOTE.match(l):
                continue
            to = path if new[(path, k)] > 0 else "*" if RUN.match(path) and new[("*", k)] > 0 else ""
            if to and (re.search(r"([\"'`])[^\"'`]{12,}\1", l) or PLAIN.match(l)):
                new[(to, k)] -= 1; continue
            left.append(l)
        if left:
            rows.append((path, left, [l for l in nw if not NOTE.match(l)]))
    n = sum(len(x[1]) for x in rows); c = sum(1 for x in rows for l in x[1] if like(x[0], l)); total = n + len(gone) + len(off) + len(lists)
    rows.sort(key=lambda x: not any(like(x[0], l) for l in x[1]))
    why = reason(sys.stdin.read())
    if not total:
        print(f"ok    checks: {tests} test files in the change, no existing test line removed or changed"); return
    short = lambda p: safe(p.replace(P, ""))
    out = [f"left the run: {short(p)}" + (f" (now {short(t)})" if t else " (deleted, or renamed with edits)") for p, t in gone] + lists + [f"switched off? {short(p)}: {safe(l.strip())}" for p, l in off]
    for p, left, nw in rows:
        pool = list(nw)
        for l in left:      # its new text: the line of this place that starts most alike, each used once
            best = max(pool, key=lambda z: len(os.path.commonprefix([l.strip(), z.strip()])), default=None)
            if best is not None and (len(os.path.commonprefix([l.strip(), best.strip()])) >= 4 or len(pool) == 1 == len(left)):
                pool.remove(best); x, y = around(l.strip(), best.strip())
            else:
                x, y = safe(l.strip()), ""
            out.append(f"{short(p)}\n  - was: {x}\n  - now: {y or '(removed)'}")
    head = f"{n} existing test lines removed or changed ({c} look like checks), {len(gone)} suites left the run, {len(off)} switched off, {len(lists)} quarantine or ledger lines"
    if o.summary:
        with open(o.summary, "a", encoding="utf-8") as fh:
            fh.write(f"### Checks weakened or removed? {head} (A351 C2, report only)\nThe reviewer reads each: is the check weaker, and why? Reason given: {html.escape(safe(why, 300)) or 'none'}\n\n"
                     + "\n".join("- " + html.escape(x) for x in out[:80]) + (f"\n- and {len(out) - 80} more" if len(out) > 80 else "") + "\n")
    for x in out[:20]:
        print("- " + x)
    if len(out) > 20:
        print(f"... and {len(out) - 20} more, in this run's summary")
    if why:
        print(f"ok    checks: {head}; reason given: {safe(why, 160)}")
    elif not c + len(gone) + len(off) + len(lists):
        print(f"ok    checks: {head}; none looks like a check, listed in this run's summary")
    else:
        print(f"::warning title=Checks changed (A351 C2)::{head}, and the body has no line saying why (a line starting Checks changed and a colon); the list is in this run's summary")


try:
    main()
except Exception as e:
    print(f"::warning title=Checks changed (A351 C2)::not read ({type(e).__name__}: {safe(str(e), 120)})")
    sys.exit(2)
