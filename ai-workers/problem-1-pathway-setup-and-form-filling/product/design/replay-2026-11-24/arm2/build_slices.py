#!/usr/bin/env python3
"""Builds the 41 slices of replay arm 2, locally and offline (no network, no CodeAnt).

One git repository per PR under <out>/Sxx, with one branch per slice, "slice-N", of exactly two commits: the PR's merged
tree with that slice's files put back as they were before the PR, then the merged tree. So `--base-commit HEAD~1` on the
branch shows only that slice's files (at most 10) and nothing needs CodeAnt's own file filter. No remote, no history, no
PR number. Contents: prototype/studio as arm 1's reviewers saw it (same exclusions), so only code public on GitHub.
Usage: build_slices.py <repo root> <out folder>      Writes <out>/manifest.json (and prints a summary).
"""
import hashlib, io, json, os, re, shutil, subprocess, sys, tarfile

HERE = os.path.dirname(os.path.abspath(__file__))
ST = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
EX = re.compile(r"/(tests/qa|acceptance|samples|evidence|screens|var)/|\.(png|jpg|jpeg|pdf|svg|woff2?|ico|gz|zip)$|/(MODULE[^/]*|[^/]*REVIEW)\.md$")
ROOT, OUT = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
ENV = {"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "HOME": OUT, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1",
       "GIT_AUTHOR_NAME": "sample", "GIT_AUTHOR_EMAIL": "sample@example.invalid", "GIT_COMMITTER_NAME": "sample", "GIT_COMMITTER_EMAIL": "sample@example.invalid",
       "GIT_AUTHOR_DATE": "2026-01-01T00:00:00Z", "GIT_COMMITTER_DATE": "2026-01-01T00:00:00Z"}


def src(*a):
    return subprocess.run(["git", "-C", ROOT, *a], capture_output=True, check=True).stdout


def git(d, *a):
    return subprocess.run(["git", "-C", d, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", *a], capture_output=True, check=True, env=ENV, text=True).stdout


def blob(ref, path):
    r = subprocess.run(["git", "-C", ROOT, "show", f"{ref}:{path}"], capture_output=True)
    return r.stdout if r.returncode == 0 else None


def put(d, rel, data):
    p = os.path.join(d, rel)
    if data is None:
        if os.path.exists(p):
            os.remove(p)
        return
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data)


rows = json.load(open(os.path.join(HERE, "..", "sample.json")))
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, ".gitignore"), "w") as f:
    f.write("*\n")
man, total = [], 0
for r in rows:
    d, head, par = os.path.join(OUT, r["id"]), r["merge"], r["merge"] + "^1"
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    with tarfile.open(fileobj=io.BytesIO(src("archive", "--format=tar", head, ST.rstrip("/")))) as t:
        for m in t.getmembers():
            if m.isfile() and not EX.search("/" + m.name) and m.size <= 400000:
                put(d, m.name[len(ST):], t.extractfile(m).read())
    allf = [f for s in r["slices"] for f in s]
    for f in allf:                       # every sliced file is present, whatever the exclusions say
        put(d, f[len(ST):] if f.startswith(ST) else f, blob(head, f))
    git(d, "init", "-q", "--template=", "-b", "scratch")
    for n, s in enumerate(r["slices"], 1):
        assert len(s) <= 10, (r["id"], n)
        rel = [f[len(ST):] if f.startswith(ST) else f for f in s]
        git(d, "checkout", "-q", "--orphan", f"slice-{n}")
        for f, q in zip(s, rel):
            put(d, q, blob(par, f))
        git(d, "add", "-A", "-f"); git(d, "commit", "-q", "--allow-empty", "-m", "before")
        for f, q in zip(s, rel):
            put(d, q, blob(head, f))
        git(d, "add", "-A", "-f"); git(d, "commit", "-q", "-m", "after")
        got = sorted(git(d, "diff", "--name-only", "--no-renames", "HEAD~1", "HEAD").split("\n")[:-1])
        assert got == sorted(rel), (r["id"], n, got, rel)
        assert not git(d, "remote").strip()
        big = [q for q in rel if open(os.path.join(d, q), "rb").read().count(b"\n") > 5000]
        man.append({"slice": f"{r['id']}-{n}", "repo": r["id"], "branch": f"slice-{n}", "files": rel, "over_5000_lines": big,
                    "diff_sha256": hashlib.sha256(git(d, "diff", "HEAD~1", "HEAD").encode()).hexdigest()})
        total += 1
assert total == 41 and len(rows) == 28, (total, len(rows))
json.dump(man, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
print(f"{total} slices in {len(rows)} repositories; most files in one slice: {max(len(m['files']) for m in man)}; files over 5,000 lines: {sum(len(m['over_5000_lines']) for m in man)}")
