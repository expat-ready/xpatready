#!/usr/bin/env python3
"""Layer map with escape counts (LR-142, lab automation-measures; code review guide: "Each layer catches some problems
and misses others"). An escape is a problem that reached main:
  revert    a commit on main whose subject starts 'Revert "' (git log, since --since)
  main-red  an episode of the `ci` (push) or `nightly` (schedule or dispatch) workflow failing on main: from its first
            failed run to the next green run of the same workflow (cancelled runs are skipped). Its id is
            <workflow>:<first failed run id>.
Each escape names the layer that should have caught it in design/escapes.tsv (id, kind, date, layer, what, source); the
layers, with what each catches and misses, are design/layer-map.tsv. Prints the escape count per layer and every escape
not named yet ("unnamed <id>"); a named id that is not an escape, or a layer not in the map, is a "bad" line.
  python3 -I product/tools/escape-map.py [--since 2026-11-14] [--runs FILE] [--ref origin/main] [--page FILE] [--strict]
--runs: a JSON list of runs ({workflow, id, created_at, conclusion}); without it, GitHub's runs API through curl
(GH_TOKEN or GITHUB_TOKEN if set; a cloud session's proxy signs requests). --page: rewrites the block between
<!-- escape-map --> and <!-- /escape-map --> (the software-factory page). Exit 0 (a report); --strict: 1 when any
escape is unnamed or a line is bad; 2 when the runs or the files cannot be read (nothing written).
Test: check-escape-map.sh. Eval cases from these escapes: LR-136 (lane automation-measures-2).
"""
import html
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.join(HERE, "..", "design")
REPO = os.environ.get("REPO", "expat-ready/xpatready")
WORKFLOWS = {"ci": ("push",), "nightly": ("schedule", "workflow_dispatch")}


def arg(name, default=None):
    a = sys.argv
    return a[a.index(name) + 1] if name in a[:-1] else default


def tsv(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f.read().split("\n"):
            if not line.strip() or line.startswith("#"):
                continue
            rows.append(line.split("\t"))
    return rows[1:]   # the header


def api_runs(since):
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    out = []
    for wf, events in WORKFLOWS.items():
        page = 1
        while True:
            cmd = ["curl", "-sf", "--max-time", "30", "-H", "Accept: application/vnd.github+json"]
            if token:
                cmd += ["-H", "Authorization: Bearer " + token]
            cmd.append("https://api.github.com/repos/%s/actions/workflows/%s.yml/runs?branch=main&per_page=100"
                       "&created=%%3E%s&page=%d" % (REPO, wf, since, page))
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode != 0:
                raise OSError("GitHub runs of %s: curl exit %d" % (wf, r.returncode))
            batch = json.loads(r.stdout).get("workflow_runs", [])
            out += [dict(x, workflow=wf) for x in batch if x.get("event") in events]
            if len(batch) < 100:
                break
            page += 1
    return out


def episodes(runs, since):
    """-> [(id, date)] of main-red episodes: per workflow, consecutive failures until the next success."""
    out = []
    for wf in WORKFLOWS:
        rs = sorted((r for r in runs if r.get("workflow") == wf and r.get("created_at", "") >= since),
                    key=lambda r: r["created_at"])
        open_ep = None
        for r in rs:
            c = r.get("conclusion")
            if c == "failure" and open_ep is None:
                open_ep = ("%s:%s" % (wf, r["id"]), r["created_at"][:10])
                out.append(open_ep)
            elif c == "success":
                open_ep = None
    return out


def reverts(ref, since):
    r = subprocess.run(["git", "log", ref, "--since=" + since, "--format=%h%x09%cI%x09%s"], cwd=HERE,
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise OSError("git log %s: %s" % (ref, r.stderr.strip()[:80]))
    out = []
    for line in r.stdout.split("\n"):
        f = line.split("\t")
        if len(f) == 3 and f[2].startswith('Revert "'):
            out.append(("revert:" + f[0][:9], f[1][:10]))
    return out


def page_block(layers, counts, unnamed, total, since):
    h = ["<!-- escape-map -->",
         "<p>Escapes since %s (reverts on main, and episodes of ci or nightly red on main), each named against the "
         "layer that should have caught it, counted by <code>product/tools/escape-map.py --page</code> from "
         "<code>design/escapes.tsv</code> (LR-142). %d escapes, %d not named yet.</p>" % (since, total, len(unnamed)),
         '<div class="tbl"><table>', "<tr><th>Layer</th><th>Catches</th><th>Misses</th><th>Escapes</th></tr>"]
    for name, catches, misses in layers:
        h.append('<tr><td>%s</td><td>%s</td><td>%s</td><td class="pct">%d</td></tr>' % (
            html.escape(name), html.escape(catches), html.escape(misses), counts.get(name, 0)))
    h.append('<tr><td><b>Not named yet</b></td><td></td><td></td><td class="pct">%d</td></tr>' % len(unnamed))
    return "\n".join(h + ["</table></div>", "<!-- /escape-map -->"])


def main():
    since = arg("--since", "2026-11-14")
    try:
        layers = [(r[0], r[1], r[2]) for r in tsv(arg("--layers", os.path.join(DESIGN, "layer-map.tsv")))]
        named = tsv(arg("--escapes", os.path.join(DESIGN, "escapes.tsv")))
        runs = json.load(open(arg("--runs"), encoding="utf-8")) if arg("--runs") else api_runs(since)
        found = episodes(runs, since) + reverts(arg("--ref", "origin/main"), since)
    except (OSError, ValueError, IndexError, KeyError, TypeError) as e:
        print("escape-map: not readable (%s): nothing written" % e)
        return 2
    names = {l[0] for l in layers}
    ids = {i for i, _ in found}
    counts, done, bad = {}, set(), []
    for r in named:
        if len(r) < 4:
            bad.append("bad   %s: needs id, kind, date, layer" % "\t".join(r)[:60])
            continue
        if r[3] not in names:
            bad.append("bad   %s: layer '%s' is not in layer-map.tsv" % (r[0], r[3]))
        elif r[0] not in ids:
            bad.append("bad   %s: not an escape found since %s (wrong id?)" % (r[0], since))
        else:
            counts[r[3]] = counts.get(r[3], 0) + 1
            done.add(r[0])
    unnamed = [(i, d) for i, d in found if i not in done]
    if "--page" in sys.argv:
        page = arg("--page")
        try:
            text = open(page, encoding="utf-8").read()
        except (OSError, TypeError):
            print("escape-map: page %s not readable: nothing written" % page)
            return 2
        pat = re.compile(r"<!-- escape-map -->.*?<!-- /escape-map -->", re.S)
        if len(pat.findall(text)) != 1:
            print("escape-map: %s needs exactly one <!-- escape-map --> block: nothing written" % page)
            return 2
        open(page, "w", encoding="utf-8").write(pat.sub(lambda m: page_block(layers, counts, unnamed, len(found), since), text))
        print("escape-map: %s updated" % page)
    for name, _, _ in layers:
        print("layer %-12s %d" % (name, counts.get(name, 0)))
    print("escapes %d since %s: %d named, %d not named" % (len(found), since, len(done), len(unnamed)))
    for i, d in unnamed:
        print("unnamed %s (%s): name its layer in design/escapes.tsv" % (i, d))
    for b in bad:
        print(b)
    return 1 if "--strict" in sys.argv and (unnamed or bad) else 0


if __name__ == "__main__":
    sys.exit(main())
