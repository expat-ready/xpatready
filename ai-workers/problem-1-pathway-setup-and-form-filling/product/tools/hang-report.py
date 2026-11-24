#!/usr/bin/env python3
"""What a suite that hung was doing, from Node's own report (Lead 30's row, 24 Nov: check_bk3 sat idle for 20 minutes on a
300 ms wait and the log could not say why). Logs and artifacts are public, and a raw report holds the environment, the
command line and addresses: so run-suites.sh asks Node to leave the environment and network out (--report-exclude-env,
--report-exclude-network), keeps the raw file in a private folder it removes, and prints only what this keeps:
the JavaScript stack, the native stack's symbols, and each libuv handle's type, active, referenced and time left.
  python3 -I hang-report.py <folder>            Test: check-hang-report.sh"""
import glob, json, os, re, sys

SYMBOL = re.compile(r"[A-Za-z_~][\w:~<>*&, ()\[\]-]{0,120}")
FRAME = re.compile(r"at (?:async )?([\w.$<>\[\] ]{1,80}) \(([^()]{1,300}?)(:\d+:\d+)\)|at ()([^()\s]{1,300}?)(:\d+:\d+)")


def frame(s):
    """A stack line as function and file name:line:column; a folder or an unusual line is never printed."""
    m = FRAME.fullmatch(s.strip())
    if not m:
        return None
    fn, path, at = (m[1], m[2], m[3]) if m[3] else ("", m[5], m[6])
    return ("at %s %s%s" % (fn, re.sub(r"[^\w.:-]", "", path.replace("\\", "/").split("/")[-1])[:60], at)).replace("  ", " ")


def summary(d):
    out = []
    stack = ((d.get("javascriptStack") or {}).get("stack") or []) if isinstance(d.get("javascriptStack"), dict) else []
    for s in stack[:6]:
        f = frame(s) if isinstance(s, str) else None
        out.append("  js      " + (f or "(line not shown)"))
    for n in [x for x in d.get("nativeStack") or [] if isinstance(x, dict)][:3]:
        m = SYMBOL.match(str(n.get("symbol") or ""))
        if m:
            out.append("  native  " + m[0].strip()[:100])
    seen = {}
    for h in [x for x in d.get("libuv") or [] if isinstance(x, dict)][:200]:
        kind = str(h.get("type"))
        if re.fullmatch(r"[a-z_]{1,20}", kind):
            ms = h.get("firesInMsFromNow")
            k = "%s active=%s referenced=%s%s" % (kind, h.get("is_active") is True, h.get("is_referenced") is True,
                                                  " fires in %d ms" % ms if isinstance(ms, (int, float)) else "")
            seen[k] = seen.get(k, 0) + 1
    for k, n in sorted(seen.items(), key=lambda x: ("referenced=False" in x[0], x[0]))[:8]:   # the kept-alive ones first
        out.append("  uv      %s%s" % (k, " x%d" % n if n > 1 else ""))
    return out


def main(folder):
    files = sorted(glob.glob(os.path.join(folder, "report.*.json")))
    for i, f in enumerate(files[:2]):
        try:
            with open(f, encoding="utf-8") as fh:
                d = json.load(fh)
            if d.get("environmentVariables"):
                print("node report %d: not shown (this Node put the environment in it)" % (i + 1))
                continue
            print("node report %d of %d (filtered: stacks and handles only):" % (i + 1, len(files)))
            print("\n".join(summary(d)) or "  (empty)")
        except (OSError, ValueError, AttributeError, TypeError):
            print("node report %d: unreadable" % (i + 1))


if __name__ == "__main__":
    main(sys.argv[1])
