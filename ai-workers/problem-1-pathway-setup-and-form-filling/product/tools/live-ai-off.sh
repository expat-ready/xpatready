#!/usr/bin/env bash
# OS-33 (P-175, P-175b; lab register LR-046): live AI is off by default. Every live switch is a STUDIO_*_LIVE variable and
# only the exact value "approved", given when a server is started, turns it on (api/src/sources.ts aiLive). This check
# fails when shipped code or configuration could turn one on by default:
#   read  a code line (.ts .tsx .js .mjs .cjs, comments left out) that reads STUDIO_<X>_LIVE from the environment by
#         anything but `=== "approved"` (a `!== "off"`, a `?? "approved"`, a bare truthy read all default to on);
#   set   a line that gives STUDIO_<X>_LIVE a value other than empty, 0, off or false: shell or Docker (X=v, ENV X v),
#         YAML or object (X: v), JSON ("X": "v"), code (env.X = v).
# Scanned (tracked files): the studio app outside its tests (tests/, acceptance/, __tests__, *.test.*, *.spec.*:
# a test of a live path names the switch on a fake launcher), .github/workflows, .mergify.yml, Dockerfiles and env files.
# US$0, no network.   bash product/tools/live-ai-off.sh [<root>]   (root: a git copy, default this one)
# Exit 0: none found · 1: each finding printed as FAIL · 2: could not list the files. Test: check-live-ai-off.sh.
set -u
ROOT="${1:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
files=$(git -C "$ROOT" ls-files 2>/dev/null) || { echo "live-ai-off: cannot list the files of $ROOT"; exit 2; }
[ -n "$files" ] || { echo "live-ai-off: $ROOT lists no files: nothing was checked"; exit 2; }
printf '%s\n' "$files" | python3 -I -c '
import os, re, sys
root = sys.argv[1]; S = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
VAR = r"STUDIO_[A-Z0-9_]*_LIVE"
READ = re.compile(r"\benv(?:\.(" + VAR + r")\b|\[\s*[\"\x27`](" + VAR + r")[\"\x27`]\s*\])")
OFF = re.compile(r"^\s*(?:===\s*[\"\x27`]approved[\"\x27`])")
SET = re.compile(r"(?<![A-Za-z0-9_])[\"\x27]?(" + VAR + r")[\"\x27]?(?:=(?=[^\s=])|\s+=\s+(?!=)|\s*:\s*|\s+(?=[^\s=:]))([^\s,;})\]#]*)")   # X=v, X = v, X: v, ENV X v; "X= cmd" blanks it
OKV = {"", "\"\"", "\x27\x27", "``", "0", "off", "false", "\"0\"", "\"off\"", "\"false\"", "\x27off\x27", "\x27false\x27"}
CODE = (".ts", ".tsx", ".js", ".mjs", ".cjs")
def scanned(f):
    b = os.path.basename(f)
    if f.startswith(S):
        r = f[len(S):]
        return not (r.startswith(("tests/", "acceptance/", "node_modules/", "evidence/")) or "/__tests__/" in r or re.search(r"\.(test|spec)\.[a-z]+$", b))
    return f.startswith(".github/workflows/") or f == ".mergify.yml" or b.startswith("Dockerfile") or b == ".env" or b.startswith(".env.") or b.endswith(".env")
bad = 0
for f in sys.stdin.read().split("\n"):
    if not f or not scanned(f): continue
    try: text = open(os.path.join(root, f), encoding="utf-8", errors="replace").read()
    except OSError: continue
    if not re.search(VAR, text): continue
    code = f.endswith(CODE); block = False
    for n, line in enumerate(text.split("\n"), 1):
        s = line.strip()
        if code:
            if block:
                if "*/" in s: block = False; s = s.split("*/", 1)[1].strip()
                else: continue
            if s.startswith("/*"):
                if "*/" not in s: block = True
                continue
            if s.startswith(("//", "*")): continue
            s = re.sub(r"\s//\s.*$", "", s)
        elif s.startswith("#"): continue
        if not re.search(VAR, s): continue
        found = False
        if code:
            for m in READ.finditer(s):
                v = m.group(1) or m.group(2); rest = s[m.end():]
                if re.match(r"^\s*=(?!=)", rest): continue   # an assignment, judged below
                if not OFF.match(rest):
                    print(f"FAIL  {f}:{n}: reads {v} by \"{rest.strip()[:40]}\", not === \"approved\": a live switch is on only with the exact value approved (P-175)"); bad = 1; found = True
        if found: continue
        for m in SET.finditer(s):
            v, val = m.group(1), m.group(2)
            # In code only a key or an env write sets it (`env.X = v`, `{ X: v }`); the name inside a string is not a value.
            if code and not re.search(r"(\benv\.|\benv\[\s*[\"\x27`]|(^|[{,(])\s*[\"\x27]?)" + v + r"[\"\x27`]?\s*\]?\s*[:=]", s[max(0, m.start() - 12):m.end()]): continue
            if val in OKV: continue
            print(f"FAIL  {f}:{n}: sets {v} to {val}: live AI must be off by default; only the person starting a server sets it (P-175)"); bad = 1
sys.exit(bad)
' "$ROOT"; r=$?
[ $r = 0 ] && echo "live AI off by default: no STUDIO_*_LIVE read or set that defaults to on"
exit $r
