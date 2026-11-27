#!/usr/bin/env bash
# Workflow security basics (lab lane ship-security, 27 Nov; design/ship-security-2026-11-27.md):
#   S1  every `uses:` of an action outside this repository names a full 40-character commit SHA, with the version kept
#       as a comment (`uses: owner/repo@<sha> # vX.Y.Z`); a tag or branch can be moved under us, a SHA cannot.
#   S2  the Mac's self-hosted runners serve only their own workflow: label `xr-mac` only queue-gate.yml (it checks out
#       main only and reads a PR's files as names), label `xr-mac-light` only demo-update.yml (push to main only). Any
#       other workflow naming `self-hosted` or either label fails. The repository settings that enforce the same thing on
#       GitHub's side are the Lead's steps in the design file (a workflow check alone cannot stop a PR's own new file).
# Runs in ci (the tools step), on the workflows of this checkout; first proves on fixtures that each rule fails when broken.
#   bash product/tools/check-workflow-security.sh [workflow-dir]
# US$0, no network.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
DIR="${1:-$ROOTD/.github/workflows}"
python3 -I - "$DIR" <<'PY'
import os, re, sys, tempfile
USES = re.compile(r'^\s*(?:-\s*)?(?:\{\s*)?uses:\s*["\']?([^\s"\'#,}]+)["\']?\s*(.*)$')
INLINE = re.compile(r'[{,]\s*uses:\s*["\']?([^\s"\'#,}]+)')
PIN = re.compile(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+@[0-9a-f]{40}$')
RUNNERS = {"xr-mac": "queue-gate.yml", "xr-mac-light": "demo-update.yml"}

def check(d):
    errs = []
    for f in sorted(os.listdir(d)):
        if not f.endswith((".yml", ".yaml")):
            continue
        text = open(os.path.join(d, f), encoding="utf-8").read()
        for n, line in enumerate(text.splitlines(), 1):
            code = line.split(" #", 1)[0] if not line.lstrip().startswith("#") else ""
            refs = []
            m = USES.match(line)
            if m and not line.lstrip().startswith("#"):
                refs.append((m.group(1), m.group(2)))
            refs += [(r, "") for r in INLINE.findall(code) if not (m and r == m.group(1))]
            for ref, rest in refs:
                if ref.startswith("./") or ref.startswith("docker://"):
                    continue
                if not PIN.match(ref):
                    errs.append(f"S1 {f}:{n}: `{ref}` is not pinned to a full commit SHA")
                elif m and ref == m.group(1) and not re.match(r'#\s*v?\d', rest):
                    errs.append(f"S1 {f}:{n}: `{ref}` has no version comment (# vX.Y.Z)")
            if re.search(r'^\s*runs-on:', code) or re.search(r'runs-on:', code):
                for label, owner in RUNNERS.items():
                    if re.search(r'(?<![\w-])' + re.escape(label) + r'(?![\w-])', code) and f != owner:
                        errs.append(f"S2 {f}:{n}: runner `{label}` is for {owner} only")
                if "self-hosted" in code and f not in RUNNERS.values():
                    errs.append(f"S2 {f}:{n}: a self-hosted runner outside {', '.join(sorted(RUNNERS.values()))}")
    return errs

# Self-test: each rule fails on a broken fixture and passes on a good one.
fails = 0
def expect(name, files, want):
    global fails
    with tempfile.TemporaryDirectory() as t:
        for k, v in files.items():
            open(os.path.join(t, k), "w").write(v)
        got = check(t)
        ok = any(g.startswith(want) for g in got) if want else not got
        print(("PASS" if ok else "FAIL") + f"  self-test: {name}" + ("" if ok else f" (got {got})"))
        fails += 0 if ok else 1
SHA = "11d5960a326750d5838078e36cf38b85af677262"
expect("a tag fails S1", {"a.yml": "steps:\n  - uses: actions/checkout@v4\n"}, "S1")
expect("an inline tag fails S1", {"a.yml": "steps: [ { uses: actions/checkout@v4 }, { run: x } ]\n"}, "S1")
expect("a short SHA fails S1", {"a.yml": "steps:\n  - uses: actions/checkout@11d5960\n"}, "S1")
expect("a SHA with no version comment fails S1", {"a.yml": f"steps:\n  - uses: actions/checkout@{SHA}\n"}, "S1")
expect("a pinned SHA with its version passes", {"a.yml": f"steps:\n  - uses: actions/checkout@{SHA} # v4.4.0\n  - uses: ./local\n"}, False)
expect("xr-mac in another workflow fails S2", {"ci.yml": "jobs:\n  a:\n    runs-on: [self-hosted, macOS, xr-mac]\n"}, "S2")
expect("xr-mac-light in queue-gate fails S2", {"queue-gate.yml": "jobs:\n  a:\n    runs-on: [self-hosted, xr-mac-light]\n"}, "S2")
expect("self-hosted elsewhere fails S2", {"x.yml": "jobs:\n  a:\n    runs-on: self-hosted\n"}, "S2")
expect("xr-mac in queue-gate passes", {"queue-gate.yml": "jobs:\n  a:\n    runs-on: ${{ fromJSON(vars.GATE_RUNNER || '[\"self-hosted\", \"macOS\", \"xr-mac\"]') }}\n"}, False)

errs = check(sys.argv[1])
for e in errs:
    print("FAIL  " + e)
if not errs:
    print(f"PASS  {sys.argv[1]}: every outside action SHA-pinned with its version; Mac runners only in their own workflow")
print(f"{9 - fails + (0 if errs else 1)} passed, {fails + len(errs)} failed")
sys.exit(1 if fails or errs else 0)
PY
