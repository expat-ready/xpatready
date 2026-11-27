#!/usr/bin/env python3
"""Explainer on risky PRs (LR-141, founder 27 Nov: "learning the code when agents write it all"; lab bundle A3). A PR that
changes money, a schema or migration, permissions or the pipeline carries a short plain-words explainer, so a person who
did not write it can follow exactly that slice. Its body has a line "Explainer" (a heading, bold or plain) and under it
three lines, each with text:
    What changed: ...
    Why: ...
    What could break: ...
Missing or empty: exit 1, naming what is missing. More than 5 lines: a warning (keep it short), never a failure.
Kinds are judged by the files changed (money, permission and migration as rules-settled.py judges them; schema: the
Prisma schema; pipeline: .github/, .githooks/, .mergify.yml, .claude/settings.json and hooks, product/tools/); the title
never counts. HTML comments and fenced blocks are not read (the template's hints are not an explainer).
   ... | python3 -I product/tools/explainer-check.py --files <file with one changed path per line>   (the body on stdin)
Exit 0 ok or not a risky PR, 1 missing, 2 when it cannot read its input (said, never "ok"): fails closed (LR-043).
Test: product/tools/check-pr-rules-closed.sh."""
import argparse, importlib.util, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
P = "ai-workers/problem-1-pathway-setup-and-form-filling/"
OWN = [
    ("schema", re.compile(r"/prisma/schema\.prisma$")),
    ("pipeline", re.compile(r"^/(\.github/|\.githooks/|\.mergify\.yml$|\.claude/(settings\.json$|hooks/)|" + re.escape(P) + r"product/tools/)")),
]
MARK = re.compile(r"^[\s>*_#-]*explainer[*_]*(\s*[:(].*|\s+[\u2014\u2013-]\s.*|\s*)$", re.I)
LABEL = re.compile(r"^[\s>*_-]*(?:\d+[.)]\s*)?[*_]*(what changed|why|what could break)[*_]*\s*:[*_]*\s*(.*)$", re.I)
STOP = re.compile(r"^\s*(#|\*\*|duplicate check:|done when)", re.I)
NEED = ("what changed", "why", "what could break")


def kinds_of(paths):
    spec = importlib.util.spec_from_file_location("rules_settled", os.path.join(HERE, "rules-settled.py"))
    rs = importlib.util.module_from_spec(spec); spec.loader.exec_module(rs)
    found = rs.kinds(paths)
    found = ["schema or migration" if k == "migration" else k for k in found]
    for k, rx in OWN:
        if any(rx.search("/" + p) for p in paths) and k not in found and not (k == "schema" and "schema or migration" in found):
            found.append("schema or migration" if k == "schema" else k)
    return found


def section(body):
    """The explainer's lines: after the "Explainer" line, up to a heading, another bold field, Duplicate check or Done when."""
    body = re.sub(r"<!--.*?(-->|$)", "", body.replace("\r", ""), flags=re.S)
    lines, out, on, fence = body.split("\n"), None, False, ""
    for l in lines:   # one pass, linear: a fenced block is an example, not an explainer
        f = re.match(r"\s*(```|~~~)", l)
        if fence or f:
            fence = "" if (fence and f and f.group(1) == fence) else (fence or f.group(1))
            continue
        if not on:
            if MARK.match(l):
                on, out = True, []
                rest = re.sub(r"(?i)^[\s>*_#-]*explainer[*_]*\s*[:\u2014\u2013-]?", "", l).strip(" *_")
                if LABEL.match(rest):
                    out.append(rest)
            continue
        if STOP.match(l) and not LABEL.match(l):
            break
        if l.strip():
            out.append(l.strip())
    return out


def main():
    a = argparse.ArgumentParser(); a.add_argument("--files", required=True); o = a.parse_args()
    paths = [l.strip() for l in open(o.files, encoding="utf-8") if l.strip()]
    if not paths:
        raise ValueError("the list of changed files is empty")
    body = sys.stdin.read()
    k = kinds_of(paths)
    if not k:
        print("ok    explainer: not a money, schema, permission or pipeline PR"); return 0
    what = ", ".join(k)
    sec = section(body)
    if sec is None:
        print(f"EXPLAINER MISSING (LR-141): this PR changes {what}, so its body needs an \"Explainer\" line and under it "
              "\"What changed: ...\", \"Why: ...\" and \"What could break: ...\" in plain words (the PR template has them).")
        return 1
    got = {}
    for l in sec:
        m = LABEL.match(l)
        if m and re.sub(r"[\s*_.:-]", "", m.group(2)):
            got.setdefault(m.group(1).lower(), m.group(2).strip())
    miss = [n for n in NEED if n not in got]
    if miss:
        print(f"EXPLAINER INCOMPLETE (LR-141): this PR changes {what}; the explainer has no text for: "
              + ", ".join(f"\"{n[0].upper() + n[1:]}:\"" for n in miss) + ". One plain line each.")
        return 1
    if len(sec) > 5:
        print(f"::warning title=Explainer (LR-141)::{len(sec)} lines; keep it to 5 plain lines a non-engineer can read")
    print(f"ok    explainer: {what}; what changed, why and what could break are there")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:
        print(f"::error title=Explainer (LR-141)::not checked ({type(e).__name__}: {str(e)[:120]}), so this step fails (fail closed)")
        sys.exit(2)
