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
    ("permission", re.compile(r"/api/src/(platform/(system-)?identity/|platform/firm-scope|core\.ts$|(.*/)?access/)|/api/src/.*(permission|(?<!form-)role|grant|access|wall)[^/]*\.(ts|json)$", re.I)),
    ("money", re.compile(r"/api/src/(.*/)?[^/]*(money|trust|payment|invoice|refund|billing|ledger|retainer|fee)s?([^a-z].*|/.*)?\.(ts|json)$", re.I)),
]
HEAD = re.compile(r"^[\s>*_-]*Rules settled[*_]*\s*:[*_]*\s*(.*)$", re.I)
CITE = re.compile(r"(?<![\w-])(?:P|QA|A)-\d{1,4}\b|(?<![\w-])A[1-9]\d{2}\b|(?<![\w-])[A-Z]{2,3}-\d+[A-Z]?-\d+@[0-9a-f]{7,40}\b|domain/requirements-\S+/\S+|https://([a-z0-9-]+\.)*(canada\.ca|gc\.ca)/\S+")
FIELD = re.compile(r"(?i)^[\s*_#-]*(done when|duplicate check|items?|completes|size exception|cost|sources?( checked)?|touches|why|what|kind|tests?|risk|model|standards §1|questions? for the founder)\b[^:\n]{0,40}:")
BULLET = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")


def kinds(paths):
    return [k for k, rx in KINDS if any(rx.search("/" + p) and "/tests/" not in "/" + p for p in paths)]


def rules(body):
    """The rules after "Rules settled:": those on its line (split by ";") and the lines right under it, or a list (blank
    lines between its bullets allowed). A line that is no bullet goes on from the one above. None: no such line outside
    code blocks, HTML comments and quotes."""
    body = re.sub(r"<!--.*?(?:-->|\Z)", "", body.replace("\r", ""), flags=re.S)
    out, gap, fence = None, False, ""
    for l in body.split("\n"):
        f = re.match(r"^\s*(`{3,}|~{3,})", l)
        if fence:
            if f and f.group(1)[0] == fence[0] and len(f.group(1)) >= len(fence):
                fence = ""
            continue
        if f:
            fence = f.group(1); continue
        if out is None:
            m = HEAD.match(l) if not l.lstrip().startswith(">") else None
            if m:
                s = m.group(1).strip()
                out = [s] if re.match(r"(?i)none\b", s) else [x.strip() for x in s.split(";") if x.strip(" .")]
        elif not l.strip():
            gap = True
        elif FIELD.match(l) or l.lstrip().startswith("#"):
            break
        elif BULLET.match(l):
            out += [x.strip() for x in BULLET.sub("", l).split(";") if x.strip(" .")]; gap = False
        elif gap and not l[0].isspace():
            break
        elif out:
            if re.match(r"^\S[^.:]{2,60}:\s", l) and not gap:
                out.append(l.strip())      # "Trust balance: may go below zero" is a rule of its own
            else:
                out[-1] += " " + l.strip()
        else:
            out.append(l.strip())
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
        if re.match(r"(?i)none\s*(\(\s*\S.{4,}\)|[-:,]\s*\S.{4,})", r[0]):
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
