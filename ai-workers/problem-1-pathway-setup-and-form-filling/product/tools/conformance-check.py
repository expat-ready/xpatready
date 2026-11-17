#!/usr/bin/env python3
"""Set-up conformance (CK-1, founder asks A151 and A154, 17 Nov 2026): is the decided engineering set-up in force?

Compares the repository at origin/main (or a --root folder, or another --ref) with the approved manifest
product/design/engineering-approved-setup.json, read from the same place, item by item:
  settings  the agents' deny lines in .claude/settings.json (a set: extra lines allowed, a missing one fails); hooks not
            switched off (disableAllHooks); each required hook entry: event + matcher + type command + command, and its
            "if" exactly as the manifest has it (absent means absent: an added "if" can stop a hook from firing);
  mergify   .mergify.yml: max_parallel_checks, the queue names in order, each queue's batch_size, merge_method and
            required queue and merge conditions (sets), auto_merge_conditions, and no way round the queues (no
            pull_request_rules entry with a merge or queue action, no extends:).
Each item is pass | fail | unchecked | pending with expected vs found; "enforced: yes" when nothing fails.
Output: one markdown line per item and a summary line; --json FILE (or -) writes the result. checked_at in IST
(Asia/Kolkata, P-302). Exit code = the number of failed items (at most 100); 101 = nothing was checked.
Reads only (git or files); no model, no paid service. Part 2 of CK-1 adds ci.yml, the main ruleset and the Library.
  python3 -I product/tools/conformance-check.py [--ref origin/main | --root DIR] [--manifest PATH] [--json FILE|-]
                                                [--md FILE] [--quiet]
Tests: product/tools/test_conformance_check.py (check-conformance-check.sh, guard 24 of check-guards.sh).
"""
import argparse, json, os, re, subprocess, sys
from datetime import datetime, timedelta, timezone

try:
    import yaml
except ImportError:
    print("conformance-check: PyYAML is missing; nothing was checked", file=sys.stderr); sys.exit(101)

REL = "ai-workers/problem-1-pathway-setup-and-form-filling/product"
MANIFEST = f"{REL}/design/engineering-approved-setup.json"
HERE = os.path.dirname(os.path.abspath(__file__))


def ist_now():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Kolkata"))
    except Exception:  # no tz database: the fixed offset is the same clock
        return datetime.now(timezone(timedelta(hours=5, minutes=30)))


class Source:
    """Files of one repository state: a git ref (git show) or a folder (--root)."""

    def __init__(self, root=None, ref=None, repo=None):
        self.root, self.ref = root, ref
        if root is None:
            self.repo = repo or subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                                               text=True, cwd=HERE).stdout.strip()
            if not self.repo:
                raise RuntimeError("not inside a git repository: give --root DIR")

    def label(self):
        if self.root:
            return f"folder {self.root}"
        sha = subprocess.run(["git", "rev-parse", "--short", self.ref], capture_output=True, text=True,
                             cwd=self.repo).stdout.strip()
        return self.ref if sha and self.ref.startswith(sha) else f"{self.ref} {sha}".strip()

    def read(self, path):
        """The file's text, or None when it is not there."""
        if self.root:
            p = os.path.join(self.root, path)
            if not os.path.isfile(p):
                return None
            with open(p, encoding="utf-8") as f:
                return f.read()
        r = subprocess.run(["git", "show", f"{self.ref}:{path}"], capture_output=True, text=True, cwd=self.repo)
        return r.stdout if r.returncode == 0 else None


def item(area, iid, status, expected, found, detail=None):
    r = {"area": area, "id": iid, "status": status, "expected": expected, "found": found}
    if detail is not None:
        r["detail"] = detail
    return r


def parse(src, path, loader):
    """(data, None) or (None, why): missing, or not valid JSON / YAML."""
    t = src.read(path)
    if t is None:
        return None, f"{path} missing"
    try:
        return loader(t), None
    except (ValueError, yaml.YAMLError) as e:
        return None, f"{path} does not parse ({str(e).splitlines()[0]})"


# ---- settings ------------------------------------------------------------------------------------------------------
def hook_script(h):
    s = re.findall(r"[\w.-]+\.(?:sh|py|mjs|js)", h["command"])
    return s[0] if s else h["command"][:40]


def hook_id(h):
    return " ".join(["settings.hook", h["event"], hook_script(h)] + ([h["if"]] if h.get("if") else []))


def hook_desc(h):
    return (f"{h['event']} hook" + (f" (matcher {h['matcher']})" if h.get("matcher") else "")
            + (f" if {h['if']}" if h.get("if") else "") + f" runs {hook_script(h)}")


def check_settings(src, m):
    cfg = m["settings"]; want = cfg["deny_required"]
    d, err = parse(src, cfg["path"], json.loads)
    if err:
        return [item("settings", "settings.deny", "fail", f"{len(want)} deny lines", err),
                item("settings", "settings.hooks_on", "fail", "hooks on", err)] + [
            item("settings", hook_id(h), "fail", hook_desc(h), err) for h in cfg["hooks_required"]]
    have = set((d.get("permissions") or {}).get("deny") or [])
    miss = [x for x in want if x not in have]
    found = f"{len(want) - len(miss)} of {len(want)} present ({len(have)} in the file)"
    if miss:
        found += f"; missing: {', '.join(miss[:5])}" + (f" and {len(miss) - 5} more" if len(miss) > 5 else "")
    out = [item("settings", "settings.deny", "fail" if miss else "pass", f"all {len(want)} required deny lines",
                found, {"missing": miss})]
    off = d.get("disableAllHooks")
    out.append(item("settings", "settings.hooks_on", "fail" if off else "pass", "disableAllHooks absent or false",
                    f"disableAllHooks {json.dumps(off)}" if off is not None else "absent"))
    hooks = d.get("hooks") or {}
    for h in cfg["hooks_required"]:
        ok = any(x.get("type") == "command" and x.get("command") == h["command"] and x.get("if") == h.get("if")
                 for g in hooks.get(h["event"]) or [] if g.get("matcher") == h.get("matcher")
                 for x in g.get("hooks") or [])
        out.append(item("settings", hook_id(h), "pass" if ok else "fail", hook_desc(h),
                        "present" if ok else "no such hook entry (or its type, matcher or if differs)"))
    return out


# ---- mergify -------------------------------------------------------------------------------------------------------
def norm_cond(c):
    """One Mergify condition in a canonical form: spaces around operators dropped; and/or members as a sorted set."""
    if isinstance(c, dict):
        return json.dumps({k: sorted(norm_cond(x) for x in v) for k, v in c.items()}, sort_keys=True)
    return re.sub(r"\s*(~=|!=|>=|<=|=|>|<)\s*", r"\1", str(c).strip())


def check_mergify(src, m):
    cfg = m["mergify"]
    d, err = parse(src, cfg["path"], yaml.safe_load)
    if err or not isinstance(d, dict):
        return [item("mergify", "mergify.file", "fail", f"{cfg['path']} readable", err or "not a mapping")]
    mpc = (d.get("merge_queue") or {}).get("max_parallel_checks")
    out = [item("mergify", "mergify.max_parallel_checks", "pass" if mpc == cfg["max_parallel_checks"] else "fail",
                cfg["max_parallel_checks"], mpc)]
    rules = d.get("queue_rules") or []
    names = [q.get("name") for q in rules]
    out.append(item("mergify", "mergify.queue_order", "pass" if names == cfg["queue_order"] else "fail",
                    " > ".join(cfg["queue_order"]), " > ".join(map(str, names)) or "no queues"))
    by = {q.get("name"): q for q in rules}
    for name, want in cfg["queues"].items():
        q = by.get(name)
        if q is None:
            out.append(item("mergify", f"mergify.queue.{name}", "fail", f"queue {name}", "no such queue"))
            continue
        bad = [f"{k} {q.get(k)} (want {want[k]})" for k in ("batch_size", "merge_method") if q.get(k) != want[k]]
        for key in ("queue_conditions", "merge_conditions"):
            have = {norm_cond(c) for c in q.get(key) or []}
            miss = [c if isinstance(c, str) else json.dumps(c) for c in want[f"{key}_required"]
                    if norm_cond(c) not in have]
            if miss:
                bad.append(f"{key} missing {'; '.join(miss)}")
        out.append(item("mergify", f"mergify.queue.{name}", "fail" if bad else "pass",
                        f"batch_size {want['batch_size']}, {want['merge_method']}, "
                        f"{len(want['queue_conditions_required'])} queue and "
                        f"{len(want['merge_conditions_required'])} merge conditions",
                        "; ".join(bad) if bad else "as approved"))
    amc = (d.get("merge_protections_settings") or {}).get("auto_merge_conditions")
    out.append(item("mergify", "mergify.auto_merge_conditions",
                    "pass" if amc == cfg["auto_merge_conditions"] else "fail", cfg["auto_merge_conditions"], amc))
    # A pull_request_rules entry with a merge or queue action merges past the queues' conditions; extends: pulls in
    # rules from another file this check does not read.
    side = [f"rule {r.get('name', '?')!r} ({', '.join(a for a in (r.get('actions') or {}) if a in ('merge', 'queue'))})"
            for r in d.get("pull_request_rules") or [] if {"merge", "queue"} & set(r.get("actions") or {})]
    if "extends" in d:
        side.append(f"extends: {d['extends']}")
    out.append(item("mergify", "mergify.no_side_door", "fail" if side else "pass",
                    "no pull_request_rules merge or queue action, no extends", "; ".join(side) or "none"))
    return out


CHECKS = (check_settings, check_mergify)


# ---- run -----------------------------------------------------------------------------------------------------------
def run(src, manifest, checks=CHECKS):
    items = [i for f in checks for i in f(src, manifest)]
    counts = {s: sum(1 for i in items if i["status"] == s) for s in ("pass", "fail", "pending", "unchecked")}
    checked = counts["pass"] + counts["fail"]
    now = ist_now()
    return {"check": "conformance (CK-1)", "enforced": "yes" if counts["fail"] == 0 and checked else "no",
            "checked_at": now.isoformat(timespec="seconds"), "checked_at_ist": now.strftime("%d %b %H:%M IST"),
            "source": src.label(), "manifest_version": manifest.get("version"), "counts": counts,
            "checked": checked, "items": items}


def fmt(v):
    return v if isinstance(v, str) else json.dumps(v)


def markdown(res):
    c = res["counts"]
    return "\n".join([f"{i['status'].upper()} {i['id']}: expected {fmt(i['expected'])}; found {fmt(i['found'])}"
                      for i in res["items"]] +
                     [f"enforced: {res['enforced']} · {c['pass']} of {res['checked']} checked items pass"
                      f" · {c['pending']} pending · {c['unchecked']} unchecked · last checked {res['checked_at_ist']}"
                      f" · {res['source']} · manifest {res['manifest_version']}"])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--ref", default="origin/main", help="git ref to read (default origin/main)")
    g.add_argument("--root", help="read a folder instead of a git ref (tests, a checked-out copy)")
    ap.add_argument("--manifest", help="manifest file (default: the one in the same repository state)")
    ap.add_argument("--json", help="write the result as JSON to FILE, or - for stdout")
    ap.add_argument("--md", help="also append the markdown lines to FILE (a job summary)")
    ap.add_argument("--quiet", action="store_true", help="print only failed items and the summary line")
    a = ap.parse_args(argv)
    try:
        src = Source(root=a.root) if a.root else Source(ref=a.ref)
        if a.manifest:
            with open(a.manifest, encoding="utf-8") as f:
                manifest = json.load(f)
        else:
            manifest, err = parse(src, MANIFEST, json.loads)
            if err:
                raise RuntimeError(err)
        res = run(src, manifest)
    except (RuntimeError, OSError, ValueError, KeyError, TypeError, AttributeError) as e:
        print(f"conformance-check: nothing was checked ({type(e).__name__}: {e})", file=sys.stderr)
        return 101
    md = markdown(res)
    if a.json == "-":
        print(json.dumps(res, indent=1, ensure_ascii=False))
    else:
        if a.json:
            with open(a.json, "w", encoding="utf-8") as f:
                json.dump(res, f, indent=1, ensure_ascii=False)
        print("\n".join(l for l in md.splitlines() if not a.quiet or l.startswith(("FAIL", "enforced:"))))
    if a.md:
        with open(a.md, "a", encoding="utf-8") as f:
            f.write(md + "\n")
    return min(res["counts"]["fail"], 100)


if __name__ == "__main__":
    sys.exit(main())
