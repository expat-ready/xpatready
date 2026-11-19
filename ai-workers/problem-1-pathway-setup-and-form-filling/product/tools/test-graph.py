#!/usr/bin/env python3
"""Capability -> module -> file -> suite graph (B203, P-744): a requirements traceability matrix that is generated,
never hand-kept. Each suite runs under V8's own coverage (run-suites.sh with SUITES_COVERAGE=<dir>: NODE_V8_COVERAGE=
<dir>/<suite> for the suite and the copy it starts; c8 12.0.0's method, P-69), then:

  collect <coverage dir> --out suites.json   one entry per suite: the app files it exercised, as [functions hit, total]
  join <suites.json>... --out graph.json     + module (module cards' `paths:`, module-cards.py) + capability (C ids and
                                             R1 items the suite names, and qa/CAPABILITIES.md R1 rows naming the suite)
  render <graph.json> --html x.html --mermaid x.mmd   people's view: capability -> module diagram and tables

"Exercised" (not merely loaded): a function of the file other than the module wrapper (index 0; index 1 too when it is
nameless and holds every later function, esbuild's CommonJS wrapper) and the transpiler's helpers (__name, __export,
__copyProps, __toCommonJS, the export getter `get`, keepNames' <static_initializer>) ran. In a server process (one that
loaded api/src/main.ts) a function counts only when it ran more often than the boot baseline times the suite's number
of server processes (each copy boots once; a retry's copy too): `__boot__`, a copy
started and stopped after isolated.sh's one readiness request (test-graph.yml). The suite's own process is never reduced.
Measured 20 Nov: with no baseline one API suite "exercised" 392 files, every module, through route registration alone.
The baseline's functions are kept in graph.json (`boot`): every server suite runs them, so a change to such a file
reaches every suite with `server: true` (test impact analysis, B203 step 4). Functions are named by name@offset. A file
only loaded makes no edge (a top-level __name(...) call still counts: a known over-count, never an under-count). Granularity is the suite (one script, one process
and the copy it starts), not the single check; suites sharing one server (the R1 group) share its coverage. Browser code
runs in Chromium, outside V8's Node coverage: web/src files reach the graph only through server-side imports. A suite
with no exercised app file is "unmapped": test impact analysis always runs it (B203: never skipped for want of data).
Standard library only. Test: check-test-graph.sh (fixtures).
"""
import argparse, datetime, glob, html, importlib.util, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PH = "ai-workers/problem-1-pathway-setup-and-form-filling"
STUDIO = PH + "/prototype/studio/"
APP = tuple(STUDIO + d for d in ("api/src/", "engine/", "contracts/", "web/src/", "ports/"))
HELPER = re.compile(r"^(__\w+|get|<static_initializer>)$")
MAIN = STUDIO + "api/src/main.ts"
CID, R1ID = re.compile(r"\bC\d+\.\d+\b"), re.compile(r"\bR1\.\d+\b")


def root():
    return os.environ.get("ROOT") or subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                                                    cwd=HERE).stdout.strip() or "."


def rel(url, top):
    """file:///abs/path.ts?x -> repository-relative path, or None outside the repository."""
    if not url.startswith("file://"):
        return None
    p = os.path.realpath(re.sub(r"[?#].*$", "", url[7:]))
    t = os.path.realpath(top) + os.sep
    return p[len(t):] if p.startswith(t) else None


def wrapper(i, fns):
    if i == 0:
        return True
    if i != 1 or fns[1].get("functionName") or len(fns) < 3 or not fns[1]["ranges"]:
        return False
    a, b = fns[1]["ranges"][0]["startOffset"], fns[1]["ranges"][0]["endOffset"]
    return all(f["ranges"] and a <= f["ranges"][0]["startOffset"] and f["ranges"][0]["endOffset"] <= b for f in fns[2:])


def own(fns):
    """The file's own functions: not a module wrapper nor a transpiler helper."""
    return [f for i, f in enumerate(fns) if not wrapper(i, fns) and not HELPER.match(f.get("functionName") or "")]


def collect(covdir, top):
    out = {}
    for d in sorted(os.listdir(covdir)):
        if not (d.startswith("check_") or d == "__boot__") or not os.path.isdir(os.path.join(covdir, d)):
            continue   # only suites' folders and the boot baseline
        files, servers = {}, 0   # file -> {"total", "suite": {fn: count}, "server": {fn: count}}; server processes
        for j in sorted(glob.glob(os.path.join(covdir, d, "*.json"))):
            try:
                res = json.load(open(j, encoding="utf-8")).get("result", [])
            except (OSError, ValueError):
                continue   # a process killed mid-write leaves a partial file: skip it, never guess
            kind = "server" if d == "__boot__" or any(rel(r.get("url", ""), top) == MAIN for r in res) else "suite"
            servers += kind == "server"
            for r in res:
                p = rel(r.get("url", ""), top)
                if not p or not p.startswith(APP) or "/node_modules/" in p:
                    continue
                fs = own(r.get("functions", []))
                e = files.setdefault(p, {"total": 0, "suite": {}, "server": {}})
                e["total"] = max(e["total"], len(fs))
                for fn in fs:
                    c = fn["ranges"][0].get("count", 0) if fn["ranges"] else 0
                    if c > 0:   # processes of one kind add up; the baseline is multiplied by the server processes (join)
                        k = f"{fn.get('functionName') or ''}@{fn['ranges'][0]['startOffset']}"
                        e[kind][k] = e[kind].get(k, 0) + c
        out[d] = {"servers": servers, "files": dict(sorted(files.items()))}
    return out


def cards(top):
    spec = importlib.util.spec_from_file_location("module_cards", os.path.join(HERE, "module-cards.py"))
    mc = importlib.util.module_from_spec(spec)
    os.environ["ROOT"] = top
    spec.loader.exec_module(mc)
    mods, _ = mc.modules()
    return lambda p: (mc.owners(p, mods) or ["(no card: " + p[len(STUDIO):].split("/")[0] + ")"])[0]


# run-suites.sh's R1 unit: three suites (and their set-up) on one copy, one coverage folder named after r1a
GROUP = {"check_runtime_r1a": ["check_runtime_r1a", "check_runtime_r1c", "check_runtime_r1d", "setup_visitor_visa"]}


def source(stem, top):
    for d in (STUDIO + "tests/", STUDIO + "tests/runtime/", PH + "/prototype/tests/"):
        for ext in (".ts", ".cjs"):
            if os.path.isfile(os.path.join(top, d + stem + ext)):
                return d + stem + ext
    return None


def capabilities(top):
    """C rows and R1 rows of qa/CAPABILITIES.md: id -> {name, status}; R1 id -> suites its row names."""
    caps, r1suites = {}, {}
    path = os.path.join(top, PH, "product/qa/CAPABILITIES.md")
    if not os.path.isfile(path):
        return caps, r1suites
    for line in open(path, encoding="utf-8"):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        if re.fullmatch(r"C\d+\.\d+", cells[0]):
            caps[cells[0]] = {"name": cells[2], "status": cells[4] if len(cells) > 4 else ""}
        elif re.fullmatch(r"R1\.\d+", cells[0]):
            caps[cells[0]] = {"name": cells[1], "status": cells[3]}
            for s in re.findall(r"\b(check_[A-Za-z0-9_]+)\.(?:ts|cjs)\b", line):
                s = next((u for u, ms in GROUP.items() if s in ms), s)
                r1suites.setdefault(s, set()).add(cells[0])
    return caps, r1suites


def join(parts, top, commit=""):
    raw, nserv = {}, {}
    for p in parts:
        for s, part in json.load(open(p, encoding="utf-8")).items():
            dst = raw.setdefault(s, {})   # every suite is kept, even one with no app file (review M2: then unmapped)
            nserv[s] = max(nserv.get(s, 0), part["servers"])
            for f, v in part["files"].items():   # one suite in two parts (never expected): the larger count of each function
                e = dst.setdefault(f, {"total": 0, "suite": {}, "server": {}})
                e["total"] = max(e["total"], v["total"])
                for kind in ("suite", "server"):
                    for k, c in v[kind].items():
                        e[kind][k] = max(e[kind].get(k, 0), c)
    boot = raw.pop("__boot__", None)
    base = {f: v["server"] for f, v in (boot or {}).items()}
    suites, server = {}, {}
    for s, fs in raw.items():
        suites[s] = {f: [len(set(v["suite"]) | {k for k, c in v["server"].items() if c > base.get(f, {}).get(k, 0) * max(nserv[s], 1)}), v["total"]] for f, v in fs.items()}
        server[s] = any(v["server"] for v in fs.values())
    module = cards(top)
    caps, r1suites = capabilities(top)
    g = {"schema": 1, "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
         "commit": commit, "boot_baseline": bool(base and any(base.values())),   # an empty __boot__ is no baseline
         "boot": {f: sorted(v) for f, v in sorted(base.items()) if v}, "suites": {}, "files": {}, "modules": {}, "capabilities": {}, "unmapped": []}
    for s, fs in sorted(suites.items()):
        src = source(s, top)
        text = "".join(open(os.path.join(top, x), encoding="utf-8", errors="replace").read() for x in (GROUP.get(s) and [source(y, top) for y in GROUP[s]] or [src]) if x)
        ex = {f: v for f, v in fs.items() if v[0] > 0}
        ids = sorted(set(CID.findall(text)) | set(R1ID.findall(text)) | r1suites.get(s, set()), key=lambda x: [int(n) if n.isdigit() else n for n in re.split(r"[.C]", x)])
        mods = sorted({module(f) for f in ex})
        g["suites"][s] = {"source": src, "server": server[s], "exercised": ex, "loaded_only": len(fs) - len(ex), "modules": mods, "capabilities": ids}
        if not ex:
            g["unmapped"].append(s)
        for f, (h, t) in ex.items():
            e = g["files"].setdefault(f, {"module": module(f), "functions": t, "hit": 0, "suites": []})
            e["suites"].append(s); e["hit"] = max(e["hit"], h)
        for m in mods:
            e = g["modules"].setdefault(m, {"suites": [], "capabilities": set()})
            e["suites"].append(s); e["capabilities"].update(ids)
        for c in ids:
            e = g["capabilities"].setdefault(c, {**caps.get(c, {"name": "", "status": "not in CAPABILITIES.md"}), "suites": [], "modules": set()})
            e["suites"].append(s); e["modules"].update(mods)
    for m in g["modules"].values():
        m["capabilities"] = sorted(m["capabilities"])
    for c in g["capabilities"].values():
        c["modules"] = sorted(c["modules"])
    for c, v in caps.items():   # a capability no suite names is shown, never dropped (the gap is the finding)
        g["capabilities"].setdefault(c, {**v, "suites": [], "modules": []})
    return g


def mermaid(g, limit=60, edges=400):
    """Capability -> module, at most `limit` capabilities and `edges` edges (Mermaid's default cap is 500)."""
    lines, n = ["flowchart LR"], 0
    nid = lambda x: re.sub(r"\W", "_", x)
    caps = [c for c, v in sorted(g["capabilities"].items()) if v["suites"]][:limit]
    for c in caps:
        v = g["capabilities"][c]
        name = re.sub(r'["`\[\]]', "'", v["name"][:40])
        lines.append(f'  {nid(c)}["{c} {name}"]')
        for m in v["modules"]:
            if n >= edges:
                lines.append(f"  %% cut at {edges} edges: graph.html and graph.json have the rest")
                return "\n".join(lines) + "\n"
            lines.append(f'  {nid(c)} --> {nid(m)}(["{m}"])'); n += 1
    return "\n".join(lines) + "\n"


def names(xs, n=12):
    return ", ".join(xs[:n]) + (f" and {len(xs) - n} more" if len(xs) > n else "")


def render(g):
    e = html.escape
    rows = "".join(f"<tr><td>{e(c)}</td><td>{e(v['name'])}</td><td>{e(v['status'])}</td><td>{len(v['suites'])}: {e(names(v['suites']))}</td>"
                   f"<td>{e(', '.join(v['modules']))}</td></tr>" for c, v in sorted(g["capabilities"].items()))
    files = "".join(f"<tr><td>{e(f)}</td><td>{e(v['module'])}</td><td>{v['hit']}/{v['functions']}</td><td>{len(v['suites'])}: {e(names(v['suites']))}</td></tr>"
                    for f, v in sorted(g["files"].items()))
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test graph</title><style>body{{font:14px system-ui;margin:16px;max-width:1200px}}table{{border-collapse:collapse;width:100%}}
td,th{{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}}th{{background:#f3f3f3}}</style></head><body>
<h1>Capability → module → file → suite</h1>
<p>Generated {e(g['generated'])} on {e(g['commit'][:9] or 'an unknown commit')} by product/tools/test-graph.py, never hand-kept.
{len(g['suites'])} suites, {len(g['unmapped'])} unmapped (always run), {len(g['files'])} files exercised.</p>
<h2>Capabilities</h2><table><tr><th>Id</th><th>Name</th><th>Status</th><th>Suites</th><th>Modules</th></tr>{rows}</table>
<h2>Files (functions hit by the best suite / own functions)</h2><table><tr><th>File</th><th>Module</th><th>Functions</th><th>Suites</th></tr>{files}</table>
<h2>Unmapped suites</h2><p>{e(', '.join(g['unmapped'])) or 'none'}</p></body></html>
"""


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("collect"); c.add_argument("covdir"); c.add_argument("--out", required=True)
    j = sub.add_parser("join"); j.add_argument("parts", nargs="+"); j.add_argument("--out", required=True); j.add_argument("--commit", default="")
    r = sub.add_parser("render"); r.add_argument("graph"); r.add_argument("--html"); r.add_argument("--mermaid")
    a = ap.parse_args(); top = root()
    if a.cmd == "collect":
        json.dump(collect(a.covdir, top), open(a.out, "w"), indent=1, sort_keys=True)
    elif a.cmd == "join":
        g = join(a.parts, top, a.commit)
        json.dump(g, open(a.out, "w"), indent=1, sort_keys=True)
        print(f"{len(g['suites'])} suites, {len(g['unmapped'])} unmapped, {len(g['files'])} files, "
              f"{sum(1 for v in g['capabilities'].values() if v['suites'])}/{len(g['capabilities'])} capabilities with a suite")
    else:
        g = json.load(open(a.graph, encoding="utf-8"))
        if a.html: open(a.html, "w").write(render(g))
        if a.mermaid: open(a.mermaid, "w").write(mermaid(g))


if __name__ == "__main__":
    sys.exit(main())
