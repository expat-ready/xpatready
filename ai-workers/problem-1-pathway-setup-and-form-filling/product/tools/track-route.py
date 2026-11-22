#!/usr/bin/env python3
"""Track routing for the merge queue (SPD-1, founder 22 Nov, P-802): which Mergify queue a PR joins by the paths it
touches. track-paths.txt is the one list of track paths; this script turns it into the regexes .mergify.yml's queues
"track-a" and "track-b" use, checks the two agree, and shows the queue a list of files would join by evaluating
.mergify.yml itself (the evaluator of product/screens/B119/check-queue-rules.py, the way Mergify does: the first queue
in file order whose queue_conditions all hold).
  python3 -I product/tools/track-route.py regex track-a|track-b     the regex for that track's paths
  python3 -I product/tools/track-route.py tracks < files            the tracks a list of files touches
  python3 -I product/tools/track-route.py route [--title T] < files the queue an approved, green PR with these files joins
  python3 -I product/tools/track-route.py check                     .mergify.yml uses the regexes of track-paths.txt;
                                                                    every track glob matches a tracked file
Exit 0 ok, 1 a failed check, 2 a usage or input error. US$0, no network. Test: product/tools/test-spd-1.sh."""
import importlib.util, os, re, subprocess, sys

try:
    import yaml
except ImportError:
    print("PyYAML is missing; nothing was checked"); sys.exit(2)

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(TOOLS, "..", "..", "..", ".."))
PATHS = os.environ.get("TRACK_PATHS") or os.path.join(TOOLS, "track-paths.txt")
MERGIFY = os.environ.get("TRACK_MERGIFY") or os.path.join(ROOT, ".mergify.yml")
TRACKS = ("track-a", "track-b")


def glob_rx(g):
    """A Mergify-style glob as a regex body (no anchors): ** any depth, * one name part (as check-mergify-scopes.sh)."""
    o, i = "", 0
    while i < len(g):
        if g.startswith("**/", i): o += "(?:.*/)?"; i += 3
        elif g.startswith("**", i): o += ".*"; i += 2
        elif g[i] == "*": o += "[^/]*"; i += 1
        else: o += ("\\" + g[i] if g[i] in ".+?()[]{}|^$\\" else g[i]); i += 1
    return o


def load(paths=PATHS, mergify=MERGIFY):
    """{track: (include globs, exception globs)}, every glob relative to the repository root."""
    cfg = yaml.safe_load(open(mergify, encoding="utf-8"))
    scopes = (((cfg.get("scopes") or {}).get("source") or {}).get("files") or {})
    prefix, out = "", {t: ([], []) for t in TRACKS}
    for n, raw in enumerate(open(paths, encoding="utf-8"), 1):
        line = raw.split("#", 1)[0].strip()
        if not line: continue
        parts = line.split()
        if len(parts) != 2: raise ValueError(f"{paths}:{n}: want '<track> <glob>' or 'prefix <dir>': {raw.strip()}")
        k, v = parts
        if k == "prefix": prefix = v; continue
        if k not in out: raise ValueError(f"{paths}:{n}: unknown track {k!r} (want {', '.join(TRACKS)})")
        inc, exc = out[k]
        if v.startswith("scope:"):
            s = scopes.get(v[6:])
            if not s: raise ValueError(f"{paths}:{n}: .mergify.yml has no scope {v[6:]!r}")
            inc.extend(s.get("include") or [])
        elif v.startswith("!"):
            exc.append(v[2:] if v.startswith("!/") else prefix + v[1:])
        else:
            inc.append(v[1:] if v.startswith("/") else prefix + v)
    return {"prefix": prefix, **out}


def regex(t, d):
    """^PREFIX(?!(?:exceptions)$)(?:includes)$, the shared prefix factored out when every glob has it."""
    inc, exc = d[t]
    p = d["prefix"]
    common = p if p and all(g.startswith(p) for g in inc + exc) else ""
    cut = lambda gs: [glob_rx(g[len(common):]) for g in gs]
    head = "^" + glob_rx(common)
    neg = f"(?!(?:{'|'.join(cut(exc))})$)" if exc else ""
    return f"{head}{neg}(?:{'|'.join(cut(inc))})$"


def tracks(files, d):
    rs = {t: re.compile(regex(t, d)) for t in TRACKS}
    return [t for t in TRACKS if any(rs[t].search(f) for f in files)]


def _queue_rules_module():
    spec = importlib.util.spec_from_file_location("cqr", os.path.join(TOOLS, "..", "screens", "B119", "check-queue-rules.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def route(files, title="evidence: something", mergify=MERGIFY):
    """The queue an approved PR with green checks joins; its records label from records-only.sh (the one definition)."""
    cqr = _queue_rules_module()
    cfg = yaml.safe_load(open(mergify, encoding="utf-8"))
    labels = ["review: approved"] + (["records"] if cqr.is_records(files) else [])
    pr = {"files": list(files), "title": title, "label": labels, "check-success": ["ci", "queue-fresh", "xfa-engine"],
          "draft": False, "base": "main", "head": "claude/spd-1-sample"}
    return cqr.queue_of(cfg, pr)


def check(d, mergify=MERGIFY):
    bad = []
    cfg = yaml.safe_load(open(mergify, encoding="utf-8"))
    conds = {q["name"]: [c.strip() for c in q.get("queue_conditions") or [] if isinstance(c, str)] for q in cfg.get("queue_rules") or []}
    for t, other in (("track-a", "track-b"), ("track-b", "track-a")):
        if t not in conds: bad.append(f".mergify.yml has no queue {t}"); continue
        for want in (f"files ~= {regex(t, d)}", f"-files ~= {regex(other, d)}"):
            if want not in conds[t]: bad.append(f"queue {t} lacks the condition built from track-paths.txt: {want[:90]}…")
    names = [q["name"] for q in cfg.get("queue_rules") or []]
    if all(n in names for n in ("track-a", "track-b", "product")) and not (names.index("track-a") < names.index("product") and names.index("track-b") < names.index("product")):
        bad.append("the queues track-a and track-b must come before the shared queue product (Mergify takes the first that matches)")
    files = subprocess.run(["git", "-C", ROOT, "ls-files"], capture_output=True, text=True, check=True).stdout.split()
    for t in TRACKS:
        for g in d[t][0] + d[t][1]:
            r = re.compile("^" + glob_rx(g) + "$")
            if not any(r.match(f) for f in files): bad.append(f"{t}: {g} matches no tracked file")
    return bad


def main(argv):
    if not argv: print(__doc__); return 2
    d = load()
    cmd = argv[0]
    if cmd == "regex" and len(argv) == 2 and argv[1] in TRACKS:
        print(regex(argv[1], d)); return 0
    if cmd == "tracks":
        print(" ".join(tracks([l.strip() for l in sys.stdin if l.strip()], d)) or "none"); return 0
    if cmd == "route":
        title = argv[argv.index("--title") + 1] if "--title" in argv else "evidence: something"
        files = [l.strip() for l in sys.stdin if l.strip()]
        if not files: print("route: no files on stdin"); return 2
        print(route(files, title) or "no queue"); return 0
    if cmd == "check":
        bad = check(d)
        for b in bad: print("FAIL", b)
        print("track-route check:", "PASS" if not bad else f"FAIL ({len(bad)})")
        return 1 if bad else 0
    print(__doc__); return 2


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except ValueError as e:
        print(f"track-route: {e}"); sys.exit(2)
