#!/usr/bin/env python3
"""Rules before review (A348, founder 24 Nov): a pull request that changes money, permissions or a migration says before its
first review which decision or requirement settles each of its rules, so a review round never finds an unsettled rule. Its
body has a line "Rules settled:" and then one line per rule (or the rules on that line, split by ";"), each naming
   a decision (P-815, A348, QA-610), a requirement card (SA-2-1@374fb7a9, AG-6-4@...), a requirement file
   (domain/requirements-*/...), or an official page (https on canada.ca or *.gc.ca).
"Rules settled: none (reason)" says no rule is new. Missing, empty, or a rule naming nothing: a warning, never a failure
(a Lead ruling may make it one). Money, permissions and migrations are judged by the files changed; the title never counts.
   ... | python3 -I product/tools/rules-settled.py --files <file with one changed path per line>      (the body on stdin)
Prints "ok ..." or "::warning ..."; exit 0, and 2 when it cannot read its input (said, never "ok"). Test: check-rules-settled.sh."""
import argparse, re, sys

KINDS = [
    ("migration", re.compile(r"/prisma/migrations/[^/]+/[^/]+\.sql$")),
    ("permission", re.compile(r"/api/src/(platform/identity/|platform/firm-scope|core\.ts$)|/api/src/.*(permission|(?<!form-)role|grant|access|wall)[^/]*\.(ts|json)$", re.I)),
    ("money", re.compile(r"/api/src/(.*/)?[^/]*(money|trust|payment|invoice|refund|billing|ledger|retainer|fee)s?([^a-z].*|/.*)?\.(ts|json)$", re.I)),
]
HEAD = re.compile(r"^[\s>*_-]*Rules settled[*_]*\s*:[*_]*\s*(.*)$", re.I)
CITE = re.compile(r"\b(P|A|QA)-\d+\b|\bA\d{2,}\b|\b[A-Z]{2,3}-\d+[A-Z]?-\d+@[0-9a-f]{7,40}\b|domain/requirements-\S+/\S+|https://([a-z0-9-]+\.)*(canada\.ca|gc\.ca)/\S+")


def kinds(paths):
    return [k for k, rx in KINDS if any(rx.search("/" + p) and "/tests/" not in "/" + p for p in paths)]


def rules(body):
    """The rules after "Rules settled:", up to a blank line or a heading; None when there is no such line (fences skipped)."""
    out, on, fence = None, False, False
    for l in body.replace("\r", "").split("\n"):
        if re.match(r"^\s*(```|~~~)", l):
            fence = not fence
            continue
        if fence:
            continue
        m = HEAD.match(l)
        if m and out is None:
            out, on = [x.strip() for x in m.group(1).split(";") if x.strip(" .")], True
            continue
        if on:
            if l.lstrip().startswith("#") or re.match(r"^[A-Z][A-Za-z ]{2,30}:\s", l) or (not l.strip() and out):
                on = False
            elif l.strip():
                out.append(l.strip(" \t-*>"))
    return out


def main():
    a = argparse.ArgumentParser(); a.add_argument("--files", required=True); o = a.parse_args()
    paths = [l.strip() for l in open(o.files, encoding="utf-8") if l.strip()]
    if not paths:
        raise ValueError("the list of changed files is empty")
    body = sys.stdin.read(); k = kinds(paths)
    if not k:
        print("ok    rules settled: no money, permission or migration file changed"); return
    r = rules(body); what = " and ".join(k)
    warn = lambda s: print(f"::warning title=Rules settled (A348)::this PR changes {what}: {s}")
    if r is None:
        warn('its body has no "Rules settled:" line. Before review round 1, list each rule with the decision or requirement that settles it, or "Rules settled: none (reason)".')
    elif not r:
        warn('"Rules settled:" names no rule.')
    elif len(r) == 1 and re.match(r"(?i)none\b", r[0]):
        if re.match(r"(?i)none\s*\(\s*\S.{4,}\)", r[0]):
            print(f"ok    rules settled: {what}, {r[0][:100]}")
        else:
            warn('"none" gives no reason: "Rules settled: none (reason)".')
    else:
        bad = [x for x in r if not CITE.search(x)]
        if bad:
            warn(f"{len(bad)} of {len(r)} rules name no decision or requirement: " + " / ".join(x[:80] for x in bad[:3]).replace("%", "%25"))
        else:
            print(f"ok    rules settled: {what}, {len(r)} rules, each naming a decision or requirement")


try:
    main()
except SystemExit:
    raise
except Exception as e:
    print(f"::warning title=Rules settled (A348)::not checked ({type(e).__name__}: {str(e)[:120]})")
    sys.exit(2)
