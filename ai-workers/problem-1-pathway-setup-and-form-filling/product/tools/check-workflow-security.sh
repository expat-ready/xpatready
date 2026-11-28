#!/usr/bin/env bash
# Workflow security basics (lab bundle A9, register rows LR-059 and LR-057's code part; first drafted in #3899):
#   S1  every `uses:` of an action outside this repository (a step's or a job's reusable workflow) names a full
#       40-character commit SHA, with the version kept as a comment on its line (`uses: owner/repo@<sha> # vX.Y.Z`);
#       a tag or branch can be moved under us, a SHA cannot. `docker://` needs an @sha256 digest.
#   S2  the Mac's self-hosted runners serve only their own workflow: label `xr-mac` only queue-gate.yml (it checks out
#       main only and reads a PR's files as names), label `xr-mac-light` only demo-update.yml (push to main only). Any
#       other workflow naming `self-hosted` or either label fails. Labels are matched without regard to case, as GitHub
#       does. Every value of the file is read except the steps (runs-on, matrix, inputs' defaults, env, group/labels).
#       The repository settings that enforce the same thing on GitHub's side (outside-contributor approval, a runner
#       group, what a `vars.*` runner names) are the founder's LR-057 step: a file check cannot stop a PR's own new file.
# Each file is read with a YAML parser (breaker on #4000: a line scan missed `SELF-HOSTED` and a quoted " #" that cut
# the line); only the version comment is read from the text. A file that does not parse fails (S0).
# Runs in ci (the tools step), on the workflows of this checkout; first proves on fixtures that each rule fails when broken.
#   bash product/tools/check-workflow-security.sh [workflow-dir]
# US$0, no network.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
DIR="${1:-$ROOTD/.github/workflows}"
python3 -c 'import yaml' 2>/dev/null || { echo "PyYAML is missing; nothing was checked"; exit 2; }
python3 -I - "$DIR" <<'PY'
import os, re, sys, tempfile, yaml
PIN = re.compile(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+@[0-9a-f]{40}$')
DIGEST = re.compile(r'^docker://[^@\s]+@sha256:[0-9a-f]{64}$')
RUNNERS = {"xr-mac": "queue-gate.yml", "xr-mac-light": "demo-update.yml"}
LABEL = {k: re.compile(r'(?<![\w-])' + re.escape(k) + r'(?![\w-])') for k in RUNNERS}

def strings(x):
    """Every key and value under x, as lower-case text."""
    if isinstance(x, dict):
        for k, v in x.items():
            yield str(k).lower(); yield from strings(v)
    elif isinstance(x, list):
        for v in x:
            yield from strings(v)
    elif x is not None:
        yield str(x).lower()

def check(d):
    errs = []
    for f in sorted(os.listdir(d)):
        if not f.endswith((".yml", ".yaml")):
            continue
        text = open(os.path.join(d, f), encoding="utf-8").read()
        try:
            w = yaml.safe_load(text)
        except yaml.YAMLError as e:
            errs.append(f"S0 {f}: does not parse as YAML ({str(e).splitlines()[0]})"); continue
        if not isinstance(w, dict):
            continue
        jobs = w.get("jobs") if isinstance(w.get("jobs"), dict) else {}
        refs = []   # every mapping with a `uses` key, at any depth (a job's reusable workflow, a step, or misplaced)
        def walk(x, where):
            if isinstance(x, dict):
                if "uses" in x:
                    refs.append((where, x["uses"]))
                for k, v in x.items():
                    walk(v, str(k) if where == "-" else where)
            elif isinstance(x, list):
                for v in x:
                    walk(v, where)
        walk(w, "-")
        lines = text.splitlines()
        for job, ref in refs:
            ref = str(ref).strip()
            if ref.startswith("./"):
                continue
            if ref.lower().startswith("docker://"):
                if not DIGEST.match(ref):
                    errs.append(f"S1 {f} ({job}): `{ref}` is not pinned to an image digest (@sha256:...)")
                continue
            if not PIN.match(ref):
                errs.append(f"S1 {f} ({job}): `{ref}` is not pinned to a full commit SHA")
            elif not any(re.search(re.escape(ref) + r'.*#\s*v?\d', l) for l in lines):
                errs.append(f"S1 {f} ({job}): `{ref}` has no version comment (# vX.Y.Z) on its line")
        # S2: everything but the steps (a step's run/name text never picks a runner).
        rest = {k: v for k, v in w.items() if k != "jobs"}
        rest["jobs"] = {n: ({k: v for k, v in j.items() if k != "steps"} if isinstance(j, dict) else j) for n, j in jobs.items()}
        seen = set()
        for s in strings(rest):
            for label, owner in RUNNERS.items():
                if LABEL[label].search(s) and f != owner and label not in seen:
                    seen.add(label); errs.append(f"S2 {f}: runner `{label}` is for {owner} only")
            if "self-hosted" in s and f not in RUNNERS.values() and "self-hosted" not in seen:
                seen.add("self-hosted"); errs.append(f"S2 {f}: a self-hosted runner outside {', '.join(sorted(RUNNERS.values()))}")
    return errs

# Self-test: each rule fails on a broken fixture and passes on a good one.
fails = 0; n = 0
def expect(name, files, want):
    global fails, n
    n += 1
    with tempfile.TemporaryDirectory() as t:
        for k, v in files.items():
            open(os.path.join(t, k), "w").write(v)
        got = check(t)
        ok = any(g.startswith(want) for g in got) if want else not got
        print(("PASS" if ok else "FAIL") + f"  self-test: {name}" + ("" if ok else f" (got {got})"))
        fails += 0 if ok else 1
SHA = "11d5960a326750d5838078e36cf38b85af677262"
J = "jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n"
expect("a tag fails S1", {"a.yml": J + "      - uses: actions/checkout@v4\n"}, "S1")
expect("an inline tag fails S1", {"a.yml": "jobs:\n  a: { runs-on: x, steps: [ { uses: actions/checkout@v4 }, { run: x } ] }\n"}, "S1")
expect("a short SHA fails S1", {"a.yml": J + "      - uses: actions/checkout@11d5960\n"}, "S1")
expect("an uppercase SHA fails S1", {"a.yml": J + f"      - uses: actions/checkout@{SHA.upper()} # v4\n"}, "S1")
expect("a SHA with no version comment fails S1", {"a.yml": J + f"      - uses: actions/checkout@{SHA}\n"}, "S1")
expect("an inline SHA with no version comment fails S1", {"a.yml": f"jobs:\n  a: {{ runs-on: x, steps: [ {{ uses: actions/checkout@{SHA} }} ] }}\n"}, "S1")
expect("a pinned SHA with its version passes", {"a.yml": J + f"      - uses: actions/checkout@{SHA} # v4.4.0\n      - uses: ./local\n"}, False)
expect("a docker tag fails S1", {"a.yml": J + "      - uses: docker://alpine:latest\n"}, "S1")
expect("a reusable workflow at a tag fails S1", {"a.yml": "jobs:\n  a:\n    uses: org/repo/.github/workflows/x.yml@v1\n"}, "S1")
expect("a quoted ' #' does not hide an inline tag (breaker I2)", {"a.yml": J + '      - { name: "a #1", uses: actions/checkout@v4 }\n'}, "S1")
expect("a quoted key or value on the next line is still read (breaker N1)", {"a.yml": J + '      - "uses":\n          actions/checkout@v4\n'}, "S1")
expect("xr-mac in another workflow fails S2", {"ci.yml": "jobs:\n  a:\n    runs-on: [self-hosted, macOS, xr-mac]\n"}, "S2")
expect("xr-mac-light in queue-gate fails S2", {"queue-gate.yml": "jobs:\n  a:\n    runs-on: [self-hosted, xr-mac-light]\n"}, "S2")
expect("self-hosted elsewhere fails S2", {"x.yml": "jobs:\n  a:\n    runs-on: self-hosted\n"}, "S2")
expect("uppercase labels fail S2 (GitHub ignores case; breaker I1)", {"ci.yml": "jobs:\n  a:\n    runs-on: [SELF-HOSTED, XR-MAC]\n"}, "S2")
expect("a quoted ' #' does not hide runs-on (breaker I2)", {"ci.yml": 'jobs:\n  a: { name: "build #1", runs-on: [self-hosted, xr-mac], steps: [ { run: x } ] }\n'}, "S2")
expect("xr-mac in a block list fails S2", {"ci.yml": "jobs:\n  a:\n    runs-on:\n      - self-hosted\n      - xr-mac\n"}, "S2")
expect("xr-mac in a matrix fails S2", {"ci.yml": "jobs:\n  a:\n    strategy: { matrix: { os: [xr-mac] } }\n    runs-on: ${{ matrix.os }}\n"}, "S2")
expect("xr-mac in a group's labels fails S2", {"ci.yml": "jobs:\n  a:\n    runs-on: { group: g, labels: [xr-mac] }\n"}, "S2")
expect("xr-mac as an input's default fails S2", {"ci.yml": "on:\n  workflow_dispatch:\n    inputs: { r: { default: xr-mac } }\njobs:\n  a:\n    runs-on: ${{ inputs.r }}\n"}, "S2")
expect("words in a step's run or name are not a runner (breaker N3)", {"ci.yml": J + "      - name: not for xr-mac\n        run: echo not self-hosted\n"}, False)
expect("a file that does not parse fails S0", {"a.yml": "jobs: [\n"}, "S0")
expect("xr-mac in queue-gate passes", {"queue-gate.yml": "jobs:\n  a:\n    runs-on: ${{ fromJSON(vars.GATE_RUNNER || '[\"self-hosted\", \"macOS\", \"xr-mac\"]') }}\n"}, False)

errs = check(sys.argv[1])
for e in errs:
    print("FAIL  " + e)
if not errs:
    print(f"PASS  {sys.argv[1]}: every outside action SHA-pinned with its version; Mac runners only in their own workflow")
print(f"{n - fails + (0 if errs else 1)} passed, {fails + len(errs)} failed")
sys.exit(1 if fails or errs else 0)
PY
