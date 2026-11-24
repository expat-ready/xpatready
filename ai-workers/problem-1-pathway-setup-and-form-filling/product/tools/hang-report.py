#!/usr/bin/env python3
"""What a suite that hung was doing, from Node's own report (Lead 30's row, 24 Nov: check_bk3 sat idle for 20 minutes on a
300 ms wait and the log could not say why). Logs and artifacts are public, and a raw report holds the environment, the
command line and addresses: so run-suites.sh asks Node to leave the environment and network out (--report-exclude-env,
--report-exclude-network), keeps the raw file in a private folder it removes, and prints only what this keeps:
the JavaScript stack (Node gives none for an idle process), three native symbols, and each libuv handle's type, active, referenced and time left.
  python3 -I hang-report.py <folder>            Test: check-hang-report.sh"""
import glob, json, os, re, sys

SYMBOL = re.compile(r"[A-Za-z_~][\w:~]{0,79}")
WRITER = ("node::TriggerNodeReport", "node::report::", "Builtins_CallApiCallback")   # the report's own frames say nothing
FILE = re.compile(r"(?:.*/)?([\w.-]{1,50}\.(?:c|m)?[jt]sx?)(:\d{1,6}:\d{1,6})")
CORE = re.compile(r"(node:[\w/]{1,40})(:\d{1,6}:\d{1,6})")
NAME = re.compile(r"(?:async )?(?:new )?[\w$.]{1,60}|Object\.<anonymous>")


def frame(s):
    """A stack line as function and file:line:column, only when it is plainly one; anything else is never printed."""
    s = s.strip()
    if not s.startswith("at ") or len(s) > 600:
        return None
    fn, _, where = s[3:].rpartition(" (")
    where = where[:-1] if where.endswith(")") else where
    m = CORE.fullmatch(where) or (None if re.search(r"[?#@%\s]|://|^\w+:(?!/)", where) else FILE.fullmatch(where))
    return "at %s%s%s" % (fn + " " if NAME.fullmatch(fn) else "", m[1], m[2]) if m else None


def summary(d):
    out = []
    stack = ((d.get("javascriptStack") or {}).get("stack") or []) if isinstance(d.get("javascriptStack"), dict) else []
    for s in stack[:8]:
        f = frame(s) if isinstance(s, str) else None
        out.append("  js      " + (f or "(line not shown)"))
    syms = [str(x.get("symbol") or "")[:200] for x in d.get("nativeStack") or [] if isinstance(x, dict)]
    for m in [m for m in (SYMBOL.match(s) for s in syms if not s.startswith(WRITER)) if m][:3]:
        out.append("  native  " + m[0])
    seen = {}
    for h in [x for x in d.get("libuv") or [] if isinstance(x, dict)][:200]:
        kind = str(h.get("type"))
        if re.fullmatch(r"[a-z_]{1,20}", kind):
            ms = h.get("firesInMsFromNow")
            k = "%s active=%s referenced=%s%s" % (kind, h.get("is_active") is True, h.get("is_referenced") is True,
                                                  " fires in %d ms" % ms if isinstance(ms, (int, float)) and -1e9 < ms < 1e9 else "")
            seen[k] = seen.get(k, 0) + 1
    for k, n in sorted(seen.items(), key=lambda x: ("referenced=False" in x[0], not x[0].startswith("timer"), x[0]))[:8]:   # the kept-alive ones first, timers before the rest
        out.append("  uv      %s%s" % (k, " x%d" % n if n > 1 else ""))
    return out


def main(folder):
    files = [f for f in sorted(glob.glob(os.path.join(folder, "report.*.json"))) if os.path.isfile(f) and not os.path.islink(f)]
    if not files and os.path.exists(os.path.join(folder, "asked")):
        print("node report: asked, none written (busy in JavaScript, or blocked in a call)")
    for i, f in enumerate(files[:2]):
        try:
            with open(f, encoding="utf-8") as fh:
                d = json.load(fh)
            if d.get("environmentVariables"):
                print("node report %d: not shown (this Node put the environment in it)" % (i + 1))
                continue
            print("node report %d of %d (filtered: stacks and handles only):" % (i + 1, len(files)))
            print("\n".join(summary(d)) or "  (empty)")
        except Exception:   # any odd shape: nothing of it is shown
            print("node report %d: unreadable" % (i + 1))


if __name__ == "__main__":
    main(sys.argv[1])
