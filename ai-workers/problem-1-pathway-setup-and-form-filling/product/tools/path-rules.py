#!/usr/bin/env python3
"""LR-152: path-scoped builder rules in .claude/rules/ load only for the files they name (Claude Code memory docs: a rule
file with a `paths:` list in its front matter is loaded when Claude reads a matching file; one without is loaded at
every start). This check keeps that true, so a rule file never quietly joins every start read:
  * every .md under .claude/rules/ has front matter with a non-empty `paths:` list;
  * every pattern matches at least one tracked file (a renamed folder would leave the rule loading for nothing);
  * a rule row quoted in .claude/rules/conventions/ (`| P-NNN | ... |`) is in product/RULES.md word for word, so the
    copy and the register never drift apart.
It prints the tokens (bytes / 4) of the quoted rows: what a builder reads only at those files.
  python3 -I product/tools/path-rules.py [<repository root>]      python3 -I product/tools/path-rules.py --self-test
Exit 1 with one line per problem. check-docs.sh runs it (after --self-test) on every pull request."""
import os, re, subprocess, sys, tempfile

RULES_DIR, CONV = ".claude/rules", ".claude/rules/conventions"
REGISTER = "ai-workers/problem-1-pathway-setup-and-form-filling/product/RULES.md"
ROW = re.compile(r"^\| (P-\d+[a-z]?) \|.*\|$", re.M)


def paths_of(text):
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m: return None
    block = re.search(r"^paths:\n((?:\s+- .*\n?)+)", m.group(1) + "\n", re.M)
    if not block: return []
    return [re.sub(r'^\s+- ["\']?(.*?)["\']?\s*$', r"\1", ln) for ln in block.group(1).splitlines() if ln.strip()]


def expand(pat):   # brace sets, as Claude's matcher reads them: a/{b,c}.ts -> a/b.ts, a/c.ts
    m = re.search(r"\{([^{}]*)\}", pat)
    return [q for alt in m.group(1).split(",") for q in expand(pat[:m.start()] + alt + pat[m.end():])] if m else [pat]


def regex(pat):   # ** crosses folders, * and ? stay inside one (no PurePath.full_match: CI's Python is older than 3.13)
    out, i = "", 0
    while i < len(pat):
        if pat.startswith("**/", i): out += "(?:.*/)?"; i += 3
        elif pat.startswith("**", i): out += ".*"; i += 2
        elif pat[i] == "*": out += "[^/]*"; i += 1
        elif pat[i] == "?": out += "[^/]"; i += 1
        else: out += re.escape(pat[i]); i += 1
    return re.compile(out + r"\Z")


def matches(pat, files):
    rs = [regex(p) for p in expand(pat)]
    return any(r.match(f) for f in files for r in rs)


def check(root, files):
    problems, rows = [], []
    reg = open(os.path.join(root, REGISTER), encoding="utf-8").read() if os.path.exists(os.path.join(root, REGISTER)) else ""
    for d, _, names in os.walk(os.path.join(root, RULES_DIR)):
        for n in sorted(names):
            if not n.endswith(".md"): continue
            full = os.path.join(d, n); rel = os.path.relpath(full, root)
            text = open(full, encoding="utf-8").read()
            ps = paths_of(text)
            if not ps:
                problems.append(f"PATH RULES: {rel} has no paths: list in its front matter, so Claude loads it at every start (LR-152)"); continue
            for p in ps:
                if not matches(p, files): problems.append(f"PATH RULES: {rel}: pattern {p} matches no tracked file, so the rule never loads (LR-152)")
            if rel.startswith(CONV):
                for m in ROW.finditer(text):
                    rows.append(m.group(0))
                    if m.group(0) not in reg: problems.append(f"PATH RULES: {rel}: row {m.group(1)} is not in RULES.md word for word: copy it again from the register (LR-152)")
    return problems, rows


def tracked(root):
    out = subprocess.run(["git", "-C", root, "ls-files", "-co", "--exclude-standard"], capture_output=True, text=True)
    return out.stdout.splitlines()


def self_test():
    ok = bad = 0
    def t(name, cond):
        nonlocal ok, bad
        ok, bad = (ok + 1, bad) if cond else (ok, bad + 1); print(("PASS  " if cond else "FAIL  ") + name)
    with tempfile.TemporaryDirectory() as r:
        os.makedirs(os.path.join(r, CONV)); os.makedirs(os.path.join(r, os.path.dirname(REGISTER)))
        row = "| P-1 | A rule. | prose | 1 Nov |"
        open(os.path.join(r, REGISTER), "w").write(f"# Rules\n{row}\n")
        rule = os.path.join(r, CONV, "a.md")
        files = ["s/engine/x.ts", "s/api/a.ts", "s/api/b.ts"]
        open(rule, "w").write(f'---\npaths:\n  - "s/engine/**"\n  - "s/api/{{a,b}}.ts"\n---\n# A\n{row}\n')
        p, rows = check(r, files); t("pass: scoped, every pattern matches, row word for word", p == [] and rows == [row])
        t("pass: only the named files match (engine, not api/c.ts)", matches("s/engine/**", ["s/engine/x.ts"]) and not matches("s/engine/**", ["s/api/c.ts"]) and not matches("s/api/{a,b}.ts", ["s/api/c.ts"]))
        open(rule, "w").write(f"# no front matter\n{row}\n"); p, _ = check(r, files); t("fail: a rule file without paths loads at every start", any("no paths" in x for x in p))
        open(rule, "w").write(f'---\npaths:\n  - "s/gone/**"\n---\n{row}\n'); p, _ = check(r, files); t("fail: a pattern that matches no file", any("matches no tracked file" in x for x in p))
        open(rule, "w").write('---\npaths:\n  - "s/engine/**"\n---\n| P-1 | A rule, reworded. | prose | 1 Nov |\n'); p, _ = check(r, files); t("fail: a row that drifted from RULES.md", any("word for word" in x for x in p))
    print(f"{ok} passed, {bad} failed"); return bad == 0


if __name__ == "__main__":
    if sys.argv[1:2] == ["--self-test"]: sys.exit(0 if self_test() else 1)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root = args[0] if args else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    problems, rows = check(root, tracked(root))
    for x in problems: print(x)
    if "--measure" in sys.argv: print(f"path rules: {len(rows)} register rows load only at their files: {sum(len(r.encode()) for r in rows) // 4} tokens (bytes / 4)")
    sys.exit(1 if problems else 0)
