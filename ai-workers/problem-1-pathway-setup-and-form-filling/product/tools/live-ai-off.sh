#!/usr/bin/env bash
# OS-33 (P-175, P-175b; lab register LR-046): live AI is off by default. Every live switch is a STUDIO_*_LIVE variable and
# only the exact value "approved", given when a server is started, turns it on (api/src/sources.ts aiLive). This check
# fails when shipped code or configuration could turn one on by default (comments left out everywhere):
#   read  code (.ts .tsx .js .mjs .cjs) reading env.X or env["X"] by anything but `=== "approved"` (a `!== "off"`, a
#         `?? "approved"`, a bare truthy read all default to on), or taking X out of env by destructuring; Python
#         reading os.environ["X"], os.environ.get("X") or os.getenv("X") by anything but `== "approved"` (a default
#         argument included); shell or YAML giving it a default (${X:-v}, ${X:=v}) other than off;
#   set   a value other than empty, 0, off, false or the variable's own $X passed through: code (env.X = v, an object
#         key X: v), Python (os.environ["X"] = v, setdefault), shell and workflow run lines (an assignment at the
#         start of a statement: X=v, export X=v, env X=v), YAML keys (X: v), JSON ("X": "v"), Dockerfiles (ENV/ARG
#         X=v, ENV X v), env files (X=v).
# Scanned (tracked files of those kinds; prose such as .md and .txt is not): the studio app outside its tests (tests/,
# acceptance/, evidence/, __tests__, *.test.*, *.spec.*: a test of a live path names the switch on a fake launcher),
# .github/workflows, .mergify.yml, and any Dockerfile or env file. US$0, no network.
#   bash product/tools/live-ai-off.sh [<root>]   (root: a git copy, default this one)
# Exit 0: none found · 1: each finding printed as FAIL · 2: could not list the files. Test: check-live-ai-off.sh.
set -u
ROOT="${1:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
list=$(mktemp "${TMPDIR:-/tmp}/liveoff.XXXXXXXX") || { echo "live-ai-off: no temp file: nothing was checked"; exit 2; }; trap 'rm -f "$list"' EXIT
git -C "$ROOT" ls-files > "$list" 2>/dev/null || { echo "live-ai-off: cannot list the files of $ROOT"; exit 2; }
[ -s "$list" ] || { echo "live-ai-off: $ROOT lists no files: nothing was checked"; exit 2; }
python3 -I - "$ROOT" "$list" <<'PY'; r=$?
import os, re, sys
root, listf = sys.argv[1], sys.argv[2]
S = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
VAR = r"STUDIO_[A-Z0-9_]*_LIVE"; Q = "[\"'`]"
VAL = r"(\"[^\"]*\"|'[^']*'|[^\s;&|)#,}\]]*)"
def off(v, name):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'`": v = v[1:-1]
    return v in ("", "0", "off", "false") or v in ("$" + name, "${" + name + "}")
def kind(f):
    b = os.path.basename(f)
    if b.startswith("Dockerfile"): return "docker"
    if b == ".env" or b.startswith(".env.") or b.endswith(".env"): return "env"
    for k, ext in (("code", (".ts", ".tsx", ".js", ".mjs", ".cjs")), ("py", (".py",)), ("sh", (".sh", ".bash", ".zsh")),
                   ("yml", (".yml", ".yaml")), ("json", (".json",))):
        if b.endswith(ext): return k
    return None
def scanned(f):
    if kind(f) is None: return False
    if f.startswith(S):
        r = f[len(S):]
        return not (r.startswith(("tests/", "acceptance/", "node_modules/", "evidence/")) or "/__tests__/" in r
                    or re.search(r"\.(test|spec)\.[a-z]+$", f))
    return f.startswith(".github/workflows/") or f == ".mergify.yml" or kind(f) in ("docker", "env")
def lines(text, k):   # each line number with the line, comments left out
    block = False
    for n, s in enumerate(text.split("\n"), 1):
        if k == "code":
            out = ""
            while s:
                if block:
                    if "*/" not in s: break
                    block = False; s = s.split("*/", 1)[1]; continue
                i = s.find("/*")
                if i < 0: out += s; break
                out += s[:i]; s = s[i + 2:]; block = True
            s = re.sub(r"(^|\s)//.*$", "", out)
        elif k != "json": s = re.sub(r"(^|\s)#.*$", "", s)
        yield n, s
SH = r"(?:^\s*|[;&|(]\s*|\brun:\s*|\bexport\s+|\benv\s+|\blocal\s+|\breadonly\s+|\bdeclare\s+(?:-\w+\s+)*)"   # a statement start
SH_SET = ("set", SH + r"(?P<v>" + VAR + r")=(?P<x>" + VAL + ")")
DEFAULT = ("default", r"\$\{(?P<v>" + VAR + r"):?[-=](?P<x>[^}]*)\}")
RULES = {   # kind → [(what, regex)]: group v the variable, x the value (set, default) or the rest of the line (read)
  "code": [("read", r"\benv(?:\.(?P<v>" + VAR + r")\b|\[\s*" + Q + r"(?P<v2>" + VAR + r")" + Q + r"\s*\])(?P<x>.*)"),
           ("destructure", r"\{[^}]*\b(?P<v>" + VAR + r")\b[^}]*\}\s*=\s*(?:process\.)?env\b"),
           ("set", r"(?:^|[{,(])\s*" + Q + r"?(?P<v>" + VAR + r")" + Q + r"?\s*:\s*(?P<x>" + VAL + ")")],
  "py":   [("read", r"\bos\.(?:environ\.get|getenv)\(\s*[\"'](?P<v>" + VAR + r")[\"']\s*(?P<d>,[^)]*)?\)(?P<x>.*)"),
           ("read", r"\bos\.environ\[\s*[\"'](?P<v>" + VAR + r")[\"']\s*\](?!\s*=[^=])(?P<x>.*)"),
           ("set", r"\bos\.environ\[\s*[\"'](?P<v>" + VAR + r")[\"']\s*\]\s*=(?!=)\s*(?P<x>" + VAL + ")"),
           ("set", r"\bos\.environ\.setdefault\(\s*[\"'](?P<v>" + VAR + r")[\"']\s*,\s*(?P<x>" + VAL + ")")],
  "sh":   [SH_SET, DEFAULT],
  "yml":  [("set", r"^\s*-?\s*[\"']?(?P<v>" + VAR + r")[\"']?\s*:\s*(?P<x>" + VAL + ")"), SH_SET, DEFAULT],
  "json": [("set", r"\"(?P<v>" + VAR + r")\"\s*:\s*(?P<x>\"[^\"]*\"|[^\s,}]+)")],
  "docker": [("set", r"^\s*(?:ENV|ARG)\s+(?:.*\s)?(?P<v>" + VAR + r")(?:=|\s+)(?P<x>" + VAL + ")"), SH_SET],
  "env":  [("set", r"^\s*(?:export\s+)?(?P<v>" + VAR + r")=(?P<x>" + VAL + ")")],
}
RULES = {k: [(w, re.compile(p)) for w, p in v] for k, v in RULES.items()}
APPROVED = {"code": re.compile(r"^\s*===\s*" + Q + "approved" + Q), "py": re.compile(r"^\s*==\s*[\"']approved[\"']")}
bad = 0
def fail(f, n, msg):
    global bad; bad = 1; print(f"FAIL  {f}:{n}: {msg} (P-175)")
for f in open(listf, encoding="utf-8").read().split("\n"):
    if not f or not scanned(f): continue
    try: text = open(os.path.join(root, f), encoding="utf-8", errors="replace").read()
    except OSError: continue
    if not re.search(VAR, text): continue
    k = kind(f)
    for n, s in lines(text, k):
        if not re.search(VAR, s): continue
        for what, rx in RULES[k]:
            for m in rx.finditer(s):
                g = m.groupdict(); v = g.get("v") or g.get("v2") or ""
                if what == "read":
                    w = re.match(r"^\s*=(?!=)\s*" + VAL, m.group("x"))
                    if w:   # an env write in code
                        if not off(w.group(1), v): fail(f, n, f"sets {v} to {w.group(1)}: live AI must be off by default; only the person starting a server sets it")
                    elif g.get("d"): fail(f, n, f"reads {v} with a default ({g['d'].lstrip(', ').strip()}): read it with none and compare with \"approved\"")
                    elif not APPROVED[k].match(m.group("x")):
                        fail(f, n, f"reads {v} by \"{m.group('x').strip()[:40]}\", not by == \"approved\": a live switch is on only with the exact value approved")
                elif what == "destructure":
                    fail(f, n, f"takes {v} out of the environment by destructuring: read env.{v} === \"approved\" instead")
                elif what == "default":
                    if not off(m.group("x"), v): fail(f, n, f"gives {v} the default {m.group('x')}: live AI must be off by default")
                elif not off(m.group("x"), v):
                    fail(f, n, f"sets {v} to {m.group('x')}: live AI must be off by default; only the person starting a server sets it")
sys.exit(bad)
PY
[ $r = 0 ] && echo "live AI off by default: no STUDIO_*_LIVE read or set that defaults to on"
exit $r
