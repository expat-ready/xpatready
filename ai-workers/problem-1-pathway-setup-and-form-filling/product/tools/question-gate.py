#!/usr/bin/env python3
"""ENF-778a E-a (P-778): "a product question is answered at the next check (target 10 min); stop-check.sh refuses to end a
Lead turn while any product SLE Q is over 20 min, or any tooling SLE Q over 60 min, with no Lead comment on that PR since
the question".

Reads lead-watch.sh's sle-watch.py dump ($STATE_DIR/sle.json, step 2g), never GitHub, so a Stop hook stays fast and
offline. sle-watch.py's own patterns decide what a question and a Lead answer are (QUESTION, ANSWER), so the gate and
the SLE line never disagree. Product vs tooling, by the PR's title prefix (the PR template's "<area>: ..." title):
pipeline, tooling, guards, records, qa, rules, lead are tooling; anything else (runtime, screens, forms, evidence,
migration, a bare title) is product, the safe side.

Fails open on its input, never traps the Lead (the brief's risk): a missing, unreadable or stale dump (its "now" older
than STALE_MIN) prints one "note:" line and refuses nothing; stop-check.sh's stop_hook_active rule lets the next stop
through anyway. Ages are counted to this moment (the dump's comments are what lead-watch last read): an answer posted
after the dump is seen once lead-watch, or `python3 -I sle-watch.py --grouped --dump <file>`, runs again, which the
refusal says.

Usage: python3 -I question-gate.py --sle FILE [--now ISO-8601]
Prints one "- ..." line per refusal (stop-check.sh joins them), or nothing; exit 0 always. Test: check-question-gate.sh.
"""
import importlib.util, json, os, re, sys
from datetime import datetime, timezone

PRODUCT_MIN, TOOLING_MIN, STALE_MIN = 20, 60, 35
TOOLING = re.compile(r"^\s*(pipeline|tooling|guards?|records?|qa|rules|lead)\b", re.I)
HERE = os.path.dirname(os.path.abspath(__file__))


def sle():
    sys.dont_write_bytecode = True   # importing sle-watch.py must leave no __pycache__ in a copy (a builder copy would flag it)
    spec = importlib.util.spec_from_file_location("sle_watch", os.path.join(HERE, "sle-watch.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def main(a):
    f, now = None, datetime.now(timezone.utc)
    while a:
        k = a.pop(0)
        if k == "--sle": f = a.pop(0)
        elif k == "--now": now = datetime.fromisoformat(a.pop(0).replace("Z", "+00:00"))
        else: print(f"note: question-gate: unknown argument {k}; nothing refused"); return 0
    s = sle()
    try:
        snap = json.load(open(f))
        taken = s.ts(snap["now"])
    except Exception as e:
        print(f"note: question-gate (P-778 E-a): no readable SLE dump ({f}: {e.__class__.__name__}); nothing refused")
        return 0
    old = int((now - taken).total_seconds() // 60)
    if old > STALE_MIN:
        print(f"note: question-gate (P-778 E-a): the SLE dump is {old} min old (over {STALE_MIN}); nothing refused, run lead-watch")
        return 0
    out = []
    for p in sorted(snap.get("prs", []), key=lambda x: x.get("number", 0)):
        cs = p.get("comments", [])
        qs = [c["at"] for c in cs if s.QUESTION.search(c.get("body", "")) and not s.ANSWER.search(c.get("body", "")[:200])]
        ans = [c["at"] for c in cs if s.ANSWER.search(c.get("body", "")[:200])]
        if not qs or (ans and max(ans) >= max(qs)):
            continue
        age = int((now - s.ts(max(qs))).total_seconds() // 60)
        tooling = bool(TOOLING.match(p.get("title", "")))
        limit = TOOLING_MIN if tooling else PRODUCT_MIN
        if age > limit:
            out.append(f"- #{p['number']}: a {'tooling' if tooling else 'product'} question for the tech lead is unanswered "
                       f"{age} min (over {limit}; P-778 E-a). Answer it on the PR (a comment starting \"Tech lead\" or "
                       f"\"Lead N\"), then run python3 -I sle-watch.py --grouped --dump {f}")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
