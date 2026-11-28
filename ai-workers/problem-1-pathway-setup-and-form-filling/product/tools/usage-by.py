#!/usr/bin/env python3
"""LR-128 (lab register, founder A425; Loops article: "Review usage: /usage ..."): where the tokens went, by skill and by
subagent, for the daily measures line. /usage is a screen, not a file; Claude Code's own session transcripts are files:
<root>/<project>/<session>.jsonl (the main thread) and <root>/<project>/<session>/subagents/agent-<id>.jsonl with its
agent-<id>.meta.json ({"agentType": ...}). Each assistant line carries message.usage; a response written as several
lines (one per content block, the same message.id) is one call, counted once. Its tokens are input + cache
creation + cache read + output (one model call, as billed against the plan; cache reads are counted, so the share
follows what was read, not what was new).
  by subagent  "main" for a session's own thread, else the subagent's agentType (general-purpose, Explore, ...).
  by skill     the last skill the thread invoked before that call (a Skill tool call's input.skill, or a typed
               /<name> command's <command-name>); a subagent's calls go to the skill its session was in when it was
               started (the skill that spawned it); before any skill, "(none)".
Window: assistant lines whose timestamp is in [until - days, until]. Read-only, local files, no network, US$0. A line or
file that cannot be read is counted in "unreadable", never dropped silently. Test: check-usage-by.sh.
   python3 -I product/tools/usage-by.py [--root ~/.claude/projects] [--days 1] [--until <ISO time>] [--top 5] [--json]"""
import argparse, glob, json, os, re, sys
from collections import Counter
from datetime import datetime, timedelta, timezone

CMD = re.compile(r"<command-name>/?([A-Za-z0-9:_-]+)</command-name>")


def when(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
    except (AttributeError, TypeError, ValueError):
        return None


def tokens(u):
    return sum(int(u.get(k) or 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"))


def skills_in(msg, kind):
    """The skills a line invokes, in order: Skill tool calls (assistant lines) and typed /commands (user lines only: a
    reply that quotes a command tag switches nothing, review of #4076)."""
    c = msg.get("content")
    out = []
    if isinstance(c, str):
        out += CMD.findall(c) if kind == "user" else []
    elif isinstance(c, list):
        for b in c:
            if not isinstance(b, dict):
                continue
            if kind == "assistant" and b.get("type") == "tool_use" and b.get("name") == "Skill" and isinstance(b.get("input"), dict) and b["input"].get("skill"):
                out.append(str(b["input"]["skill"]))
            elif kind == "user" and b.get("type") == "text":
                out += CMD.findall(b.get("text") or "")
    return out


def walk(path, since, until, start_skill, agent, by_skill, by_agent, bad, spawn=None):
    """Adds one thread's calls; returns nothing. spawn maps a Task/Agent tool_use id to the skill current at that call."""
    skill = start_skill
    seen = set()   # Claude Code writes one line per content block of a response, each with the same id and usage
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except OSError:
        bad["files"] += 1
        return
    for raw in lines:
        try:
            d = json.loads(raw)
        except ValueError:
            bad["lines"] += 1
            continue
        if not isinstance(d, dict) or not isinstance(d.get("message"), dict):
            continue
        m = d["message"]
        mid = m.get("id")
        if d.get("type") == "assistant" and isinstance(m.get("usage"), dict) and not (mid and mid in seen):
            if mid:
                seen.add(mid)
            t = when(d.get("timestamp"))
            if t is None:
                bad["lines"] += 1
            elif since <= t <= until:
                n = tokens(m["usage"])
                by_skill[skill] += n
                by_agent[agent] += n
        for s in skills_in(m, d.get("type")):
            skill = s
        if spawn is not None and isinstance(m.get("content"), list):
            for b in m["content"]:
                if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") in ("Agent", "Task"):
                    spawn[b.get("id")] = skill


def breakdown(root, since, until):
    by_skill, by_agent, bad = Counter(), Counter(), Counter()
    for main in sorted(glob.glob(os.path.join(root, "*", "*.jsonl"))):
        spawn = {}
        walk(main, since, until, "(none)", "main", by_skill, by_agent, bad, spawn)
        for sub in sorted(glob.glob(os.path.join(main[:-6], "subagents", "agent-*.jsonl"))):
            try:
                meta = json.load(open(sub[:-6] + ".meta.json"))
            except (OSError, ValueError):
                meta = {}
                bad["files"] += 1
            walk(sub, since, until, spawn.get(meta.get("toolUseId"), "(none)"), str(meta.get("agentType") or "unknown"),
                 by_skill, by_agent, bad)
    return by_skill, by_agent, bad


def share(c, top):
    total = sum(c.values())
    if not total:
        return "none"
    parts = [f"{k} {100 * v / total:.0f}%" for k, v in c.most_common(top)]
    rest = total - sum(v for _, v in c.most_common(top))
    return ", ".join(parts + ([f"other {100 * rest / total:.0f}%"] if rest else []))


def line(root, since, until, top=5):
    """One measures field: 'usage <total>M tokens; by skill: ...; by subagent: ...' (or why it cannot be read)."""
    if not os.path.isdir(root):
        return f"usage unreadable (no transcripts at {root})"
    s, a, bad = breakdown(root, since, until)
    total = sum(a.values())
    tail = f"; unreadable {bad['lines']} lines, {bad['files']} files" if bad else ""
    return f"usage {total / 1e6:.1f}M tokens; by skill: {share(s, top)}; by subagent: {share(a, top)}{tail}"


def main():
    p = argparse.ArgumentParser(description="tokens by skill and subagent (LR-128)")
    p.add_argument("--root", default=os.path.expanduser("~/.claude/projects"))
    p.add_argument("--days", type=float, default=1)
    p.add_argument("--until")
    p.add_argument("--top", type=int, default=5)
    p.add_argument("--json", action="store_true")
    o = p.parse_args()
    until = (datetime.fromisoformat(o.until) if o.until else datetime.now(timezone.utc)).astimezone(timezone.utc)
    since = until - timedelta(days=o.days)
    if o.json:
        s, a, bad = breakdown(o.root, since, until)
        print(json.dumps({"by_skill": dict(s), "by_subagent": dict(a), "unreadable": dict(bad)}, sort_keys=True))
    else:
        print(line(o.root, since, until, o.top))
    return 0


if __name__ == "__main__":
    sys.exit(main())
