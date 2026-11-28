#!/usr/bin/env python3
"""Layer map with escape counts (LR-142, lab automation-measures; code review guide: "Each layer catches some problems
and misses others"). An escape is a problem that reached main:
  main-red  an episode of the scheduled nightly on main failing: from the first scheduled run with a failed attempt to
            the next scheduled run that passed on its first attempt. Main is tested only by the nightly (ci.yml runs on
            pull requests and by hand, never on a push to main). Any failed attempt counts, so a re-run that went green
            does not hide a red night. Hand-started nightly runs are left out: the runs list does not say whether one
            re-tested only some capabilities. Id: nightly:<first red run id>.
  revert    a commit 'Revert "..."' whose reverted commit ("This reverts commit X") was already on main's first-parent
            line before the revert landed; a revert inside a PR branch of a change that never reached main is not one.
            A revert that names no commit is counted. Id: revert:<sha, 9>.
Each escape names the layer that should have caught it in design/escapes.tsv (id, kind, date, layer, what, source); the
layers, with what each catches and misses, are design/layer-map.tsv. Prints the escape count per layer and every escape
not named yet ("unnamed <id>"); a named id that is not an escape, named twice, of the wrong kind, or a layer not in the
map, is a "bad" line.
  python3 -I tools/escape-map.py [--since 2026-11-14] [--runs FILE] [--ref origin/main] [--page FILE] [--strict]
  (from ai-workers/problem-1-pathway-setup-and-form-filling/product)
--runs: a JSON list of runs ({id, event, created_at, conclusion, attempts: [conclusion of each earlier attempt]});
without it, GitHub's API through curl (GH_TOKEN or GITHUB_TOKEN if set; a cloud session's proxy signs requests).
--page: rewrites the block between <!-- escape-map --> and <!-- /escape-map --> (the software-factory page).
Exit 0 (a report); --strict: 1 when any escape is unnamed or a line is bad; 2 when the runs, the files, --since or the
page cannot be read or written (the page is then untouched). Test: check-escape-map.sh. Eval cases: LR-136.
"""
import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.join(HERE, "..", "design")
REPO = os.environ.get("REPO", "expat-ready/xpatready")


def arg(name, default=None):
    a = sys.argv
    return a[a.index(name) + 1] if name in a[:-1] else default


def tsv(path, header):
    rows, seen = [], False
    with open(path, encoding="utf-8") as f:
        for line in f.read().split("\n"):
            if not line.strip() or line.startswith("#"):
                continue
            if not seen:
                if line.split("\t")[0] != header:
                    raise ValueError("%s: the first line must be the header, starting '%s'" % (path, header))
                seen = True
                continue
            rows.append(line.split("\t"))
    return rows


def call(path):
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    cmd = ["curl", "-sf", "--max-time", "30", "-H", "Accept: application/vnd.github+json"]
    if token:
        cmd += ["-H", "Authorization: Bearer " + token]
    r = subprocess.run(cmd + ["https://api.github.com/repos/%s/%s" % (REPO, path)], capture_output=True, text=True)
    if r.returncode != 0:
        raise OSError("GitHub %s: curl exit %d" % (path, r.returncode))
    return json.loads(r.stdout)


def api_runs(since):
    out, page = [], 1
    while True:
        d = call("actions/workflows/nightly.yml/runs?branch=main&event=schedule&per_page=100&created=%%3E%s&page=%d"
                 % (since, page))
        if d.get("total_count", 0) > 1000:
            raise ValueError("over 1000 scheduled runs since %s: GitHub lists only 1000; give a later --since" % since)
        batch = d.get("workflow_runs", [])
        for r in batch:
            r["attempts"] = [call("actions/runs/%s/attempts/%d" % (r["id"], n)).get("conclusion")
                             for n in range(1, int(r.get("run_attempt") or 1))]
        out += batch
        if len(batch) < 100:
            return out
        page += 1


def episodes(runs, since):
    """-> [(id, date)]: scheduled runs, oldest first; red = any attempt failed; an episode ends at a first-attempt green."""
    out, open_ep = [], False
    for r in sorted((r for r in runs if r.get("event") == "schedule" and r.get("created_at", "") >= since),
                    key=lambda r: r["created_at"]):
        tries = list(r.get("attempts") or []) + [r.get("conclusion")]
        if "failure" in tries:
            if not open_ep:
                out.append(("nightly:%s" % r["id"], r["created_at"][:10]))
            open_ep = True
        elif tries[0] == "success":
            open_ep = False
    return out


def git(*a):
    r = subprocess.run(["git", *a], cwd=HERE, capture_output=True, text=True)
    return r.returncode, r.stdout.strip()


def reverts(ref, since):
    rc, log = git("log", ref, "--since=" + since, "--format=%H%x09%cI%x09%s")
    if rc != 0:
        raise OSError("git log %s failed" % ref)
    first_parent = set(git("rev-list", "--first-parent", ref)[1].split("\n"))
    out = []
    for line in log.split("\n"):
        f = line.split("\t")
        if len(f) != 3 or not f[2].startswith('Revert "'):
            continue
        sha, date = f[0], f[1][:10]
        m = re.search(r"This reverts commit ([0-9a-f]{7,40})", git("show", "-s", "--format=%b", sha)[1])
        if m:
            if sha in first_parent:
                landed = sha
            else:   # the oldest first-parent commit of ref that holds the revert: the merge that brought it in
                landed = git("rev-list", "--first-parent", "--ancestry-path", "%s..%s" % (sha, ref))[1].split("\n")[-1]
            if not landed or git("merge-base", "--is-ancestor", m.group(1), landed + "^1")[0] != 0:
                continue   # the reverted change came in with the revert: it never reached main
        out.append(("revert:" + sha[:9], date))
    return out


def page_block(layers, counts, unnamed, total, since):
    h = ["<!-- escape-map -->",
         "<p>Escapes since %s (reverts of changes that had reached main, and red episodes of the scheduled nightly, the "
         "only run that tests main), each named against the layer that should have caught it, counted by "
         "<code>escape-map.py --page</code> from <code>design/escapes.tsv</code> (LR-142). %d escapes, %d not named "
         "yet.</p>" % (since, total, len(unnamed)),
         '<div class="tbl"><table>', "<tr><th>Layer</th><th>Catches</th><th>Misses</th><th>Escapes</th></tr>"]
    for name, catches, misses in layers:
        h.append('<tr><td>%s</td><td>%s</td><td>%s</td><td class="pct">%d</td></tr>' % (
            html.escape(name), html.escape(catches), html.escape(misses), counts.get(name, 0)))
    h.append('<tr><td><b>Not named yet</b></td><td></td><td></td><td class="pct">%d</td></tr>' % len(unnamed))
    return "\n".join(h + ["</table></div>", "<!-- /escape-map -->"])


def main():
    since = arg("--since", "2026-11-14")
    try:
        datetime.strptime(since, "%Y-%m-%d")
        layers = [(r[0], r[1], r[2]) for r in tsv(arg("--layers", os.path.join(DESIGN, "layer-map.tsv")), "layer")]
        named = tsv(arg("--escapes", os.path.join(DESIGN, "escapes.tsv")), "id")
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
        elif r[0] in done:
            bad.append("bad   %s: named twice" % r[0])
        elif r[3] not in names:
            bad.append("bad   %s: layer '%s' is not in layer-map.tsv" % (r[0], r[3]))
        elif r[0] not in ids:
            bad.append("bad   %s: not an escape found since %s (wrong id?)" % (r[0], since))
        elif r[1] != ("revert" if r[0].startswith("revert:") else "main-red"):
            bad.append("bad   %s: kind '%s' does not match the id" % (r[0], r[1]))
        else:
            counts[r[3]] = counts.get(r[3], 0) + 1
            done.add(r[0])
    unnamed = [(i, d) for i, d in found if i not in done]
    if "--page" in sys.argv:
        page = arg("--page")
        try:
            text = open(page, encoding="utf-8").read()
            pat = re.compile(r"<!-- escape-map -->.*?<!-- /escape-map -->", re.S)
            if len(pat.findall(text)) != 1:
                print("escape-map: %s needs exactly one <!-- escape-map --> block: nothing written" % page)
                return 2
            new = pat.sub(lambda m: page_block(layers, counts, unnamed, len(found), since), text)
            with open(page + ".tmp", "w", encoding="utf-8") as f:
                f.write(new)
            os.replace(page + ".tmp", page)
        except (OSError, TypeError) as e:
            print("escape-map: page %s not readable or writable (%s): nothing written" % (page, e))
            return 2
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
