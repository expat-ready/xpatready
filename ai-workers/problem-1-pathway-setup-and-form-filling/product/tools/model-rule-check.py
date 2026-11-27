#!/usr/bin/env python3
"""One model rule everywhere (P-788; P-608 as amended; founder A420, 27 Nov): Opus 5.5 at medium effort.
Exit 1, naming each place, when anything disagrees:
  1. .claude/settings.json: "model" is opus (or claude-opus-5-5) and "effortLevel" is medium; no env entry sets
     ANTHROPIC_MODEL, ANTHROPIC_DEFAULT_*_MODEL, CLAUDE_CODE_SUBAGENT_MODEL or CLAUDE_CODE_EFFORT_LEVEL to anything else.
     Docs (code.claude.com/docs/en/settings, read 27 Nov 2026): `model` "Set the model every new session uses";
     `effortLevel` "Set a default effort level"; both scope "Any file". Cloud sessions read the committed
     .claude/settings.json ("Commit a setting there to apply it in those sessions").
  2. Every .claude/agents/*.md front matter: model opus, effort medium (agent-model-guard.sh).
  3. Every SKILL.md front matter: a `model` or `effort` key, if present, is opus/inherit and medium.
  4. Prose a session acts on (skills, agent files, CLAUDE.md, AGENTS.md, WAY-OF-WORKING.md): no line names Fable,
     Sonnet or Haiku, or an effort other than medium, unless the line cites P-788 (the rule itself, or a named
     exception, P-788 (2)).
  5. The hooks behave: agent-model-guard.sh --hook denies a Sonnet launch and a high-effort launch and lets an
     Opus-medium one pass; brief-check.sh --brief refuses "Model: Fable 5.2, effort: high" and passes Opus medium.
Read-only, no network, US$0. ROOT env overrides the repository root (the test's planted copies).
Usage: python3 -I product/tools/model-rule-check.py     Test: check-model-rule.sh (a planted mismatch fails)."""
import glob, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("ROOT") or os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
P = "ai-workers/problem-1-pathway-setup-and-form-filling/product"
OPUS = {"opus", "claude-opus-5-5"}
OTHER_MODEL = re.compile(r"\b(fable|sonnet|haiku)\b", re.I)
OTHER_EFFORT = re.compile(r"effort[\s:=*`\"]*(low|high|xhigh|max)\b|\b(low|high|xhigh|max)[\s-]effort\b", re.I)
bad = []


def front(path):
    t = open(path, encoding="utf-8").read().splitlines()
    if not t or t[0].strip() != "---":
        return {}
    out = {}
    for line in t[1:]:
        if line.strip() == "---":
            break
        m = re.match(r"^([A-Za-z_-]+):\s*(.*)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip("\"'")
    return out


def rel(p):
    return os.path.relpath(p, ROOT)


# 1. settings.json
sp = os.path.join(ROOT, ".claude", "settings.json")
try:
    s = json.load(open(sp, encoding="utf-8"))
except Exception as e:  # unreadable settings is a failure, never a pass
    s = {}
    bad.append(f".claude/settings.json unreadable: {e}")
if str(s.get("model", "")).lower() not in OPUS:
    bad.append(f'.claude/settings.json "model" is {s.get("model")!r}, not "opus" (P-788)')
if s.get("effortLevel") != "medium":
    bad.append(f'.claude/settings.json "effortLevel" is {s.get("effortLevel")!r}, not "medium" (P-788)')
for k, v in (s.get("env") or {}).items():
    if re.fullmatch(r"ANTHROPIC_MODEL|ANTHROPIC_DEFAULT_\w+_MODEL|CLAUDE_CODE_SUBAGENT_MODEL", k) and str(v).lower() not in OPUS:
        bad.append(f".claude/settings.json env {k}={v} is not Opus (P-788)")
    if k == "CLAUDE_CODE_EFFORT_LEVEL" and v != "medium":
        bad.append(f".claude/settings.json env {k}={v} is not medium (P-788)")

# 2. agent files
r = subprocess.run(["bash", os.path.join(HERE, "agent-model-guard.sh")], capture_output=True, text=True,
                   env={**os.environ, "AGENTS_DIR": os.path.join(ROOT, ".claude", "agents")})
if r.returncode != 0:
    bad += [l for l in (r.stdout + r.stderr).splitlines() if l.strip()] or ["agent-model-guard.sh failed with no output"]

# 3. skill front matter
skills = sorted(glob.glob(os.path.join(ROOT, ".claude", "skills", "*", "SKILL.md")))
for f in skills:
    fm = front(f)
    if "model" in fm and fm["model"].lower() not in OPUS | {"inherit"}:
        bad.append(f"{rel(f)} front matter model: {fm['model']} (P-788)")
    if "effort" in fm and fm["effort"] != "medium":
        bad.append(f"{rel(f)} front matter effort: {fm['effort']} (P-788)")

# 4. prose
prose = skills + sorted(glob.glob(os.path.join(ROOT, ".claude", "agents", "*.md"))) + [
    os.path.join(ROOT, n) for n in ("CLAUDE.md", "AGENTS.md", f"{P}/WAY-OF-WORKING.md")]
for f in prose:
    if not os.path.isfile(f):
        continue
    for i, line in enumerate(open(f, encoding="utf-8"), 1):
        if "P-788" in line:
            continue
        m = OTHER_MODEL.search(line) or OTHER_EFFORT.search(line)
        if m:
            bad.append(f"{rel(f)}:{i} names \"{m.group(0).strip()}\" without citing P-788 (one rule: Opus 5.5 medium)")

# 5. hooks behave
def hook(model, effort):
    ti = {"subagent_type": "general-purpose", "description": "probe", "prompt": "probe"}
    if model: ti["model"] = model
    if effort: ti["effort"] = effort
    r = subprocess.run(["bash", os.path.join(HERE, "agent-model-guard.sh"), "--hook"], input=json.dumps({"tool_name": "Agent", "tool_input": ti}),
                       capture_output=True, text=True)
    return '"deny"' in r.stdout

if not hook("sonnet", ""): bad.append("agent-model-guard.sh --hook lets a Sonnet launch through (P-788)")
if not hook("opus", "high"): bad.append("agent-model-guard.sh --hook lets a high-effort launch through (P-788)")
if hook("opus", "medium") or hook("", ""): bad.append("agent-model-guard.sh --hook denies an Opus-medium launch (P-788)")
def brief(text):
    return subprocess.run(["bash", os.path.join(HERE, "brief-check.sh"), "--brief"], input=text, capture_output=True, text=True).returncode
if brief("Model: Fable 5.2, effort: high. You are a standby.") == 0: bad.append("brief-check.sh --brief passes a Fable-high brief (P-788)")
if brief("Model: Opus 5.5, effort: medium. You are a standby.") != 0: bad.append("brief-check.sh --brief refuses an Opus-medium brief")

for b in bad:
    print("MODEL RULE:", b)
if bad:
    print(f"model rule: {len(bad)} disagreement(s) with P-788 (Opus 5.5, effort medium)"); sys.exit(1)
print(f"model rule: settings, {len(glob.glob(os.path.join(ROOT, '.claude', 'agents', '*.md')))} agent file(s), {len(skills)} skill(s), instruction files and 2 hooks agree on Opus 5.5 medium (P-788)")
