#!/usr/bin/env python3
"""Set-up conformance (CK-1, founder asks A151 and A154, 17 Nov 2026): is the decided engineering set-up in force?

Compares the repository at origin/main (or a --root folder, or another --ref) with the approved manifest
product/design/engineering-approved-setup.json, read from the same place, item by item:
  settings  the agents' deny lines in .claude/settings.json (a set: extra lines allowed, a missing one fails) and each
            required hook entry (event + matcher + command, and its "if" when the manifest names one);
  mergify   .mergify.yml: max_parallel_checks, the queue names in order, each queue's batch_size, merge_method and
            required queue and merge conditions (sets), auto_merge_conditions;
  ci        ci.yml: the required jobs, the gate job's needs, the required pull_request types, no forbidden trigger, and
            token scopes (every job's effective permissions declared, write only where the manifest allows it);
  ruleset   the rules GitHub applies to main (deletion, non_fast_forward, the required check ci): read only with
            --github inside the scheduled workflow (GITHUB_TOKEN, read); in a session it is "unchecked in sessions",
            because the agents' deny list blocks ruleset reads; no rules while the manifest says required false = "pending";
  library   each master in cockpit/library.json exists, and one with a registry "version" carries the same "Version:"
            header (a JSON master: a top-level "version"); claude.ai artifacts and local-only paths are "unchecked".
Each item is pass | fail | unchecked | pending with expected vs found. "enforced: yes" when nothing fails.
Output: one markdown line per item and a summary line; --json FILE (or -) writes the result. checked_at in IST
(Asia/Kolkata, P-302). Exit code = the number of failed items (at most 100). Reads only; no model, no paid service.
  python3 -I product/tools/conformance-check.py [--ref origin/main | --root DIR] [--manifest PATH] [--github]
                                                [--json FILE|-] [--md FILE] [--quiet]
Tests: product/tools/test_conformance_check.py (run by check-conformance-check.sh in check-guards.sh).
"""
import argparse, fnmatch, glob, json, os, re, subprocess, sys
from datetime import datetime, timedelta, timezone

try:
    import yaml
except ImportError:
    print("conformance-check: PyYAML is missing; nothing was checked", file=sys.stderr); sys.exit(101)

REL = "ai-workers/problem-1-pathway-setup-and-form-filling/product"
MANIFEST = f"{REL}/design/engineering-approved-setup.json"
HERE = os.path.dirname(os.path.abspath(__file__))
SESSION_RULESET = "unchecked in sessions (the agents' deny list blocks ruleset reads; the scheduled workflow checks it)"


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
        self.repo = repo or subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                                           cwd=HERE).stdout.strip()
        self._files = None

    def label(self):
        if self.root:
            return f"folder {self.root}"
        sha = subprocess.run(["git", "rev-parse", "--short", self.ref], capture_output=True, text=True,
                             cwd=self.repo).stdout.strip()
        return f"{self.ref} {sha}".strip()

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

    def matches(self, pattern):
        """Paths under this state matching a path, a folder or a glob (library.json's pathspecs)."""
        if self.root:
            return sorted(os.path.relpath(p, self.root) for p in glob.glob(os.path.join(self.root, pattern)))
        if self._files is None:
            r = subprocess.run(["git", "ls-tree", "-r", "--name-only", self.ref], capture_output=True, text=True,
                               cwd=self.repo)
            self._files = r.stdout.splitlines()
        return [f for f in self._files if f == pattern or f.startswith(pattern.rstrip("/") + "/")
                or fnmatch.fnmatchcase(f, pattern)]


def item(area, iid, status, expected, found, detail=None):
    r = {"area": area, "id": iid, "status": status, "expected": expected, "found": found}
    if detail is not None:
        r["detail"] = detail
    return r


def parse_json(src, path):
    t = src.read(path)
    if t is None:
        return None, f"{path} missing"
    try:
        return json.loads(t), None
    except ValueError as e:
        return None, f"{path} is not valid JSON ({e})"


def parse_yaml(src, path):
    t = src.read(path)
    if t is None:
        return None, f"{path} missing"
    try:
        return yaml.safe_load(t), None
    except yaml.YAMLError as e:
        return None, f"{path} is not valid YAML ({str(e).splitlines()[0]})"


# ---- settings ------------------------------------------------------------------------------------------------------
def check_settings(src, m):
    cfg = m["settings"]; out = []
    d, err = parse_json(src, cfg["path"])
    want = cfg["deny_required"]
    if err:
        return [item("settings", "settings.deny", "fail", f"{len(want)} deny lines", err)] + [
            item("settings", hook_id(h), "fail", hook_desc(h), err) for h in cfg["hooks_required"]]
    have = set((d.get("permissions") or {}).get("deny") or [])
    missing = [x for x in want if x not in have]
    out.append(item("settings", "settings.deny", "fail" if missing else "pass",
                    f"all {len(want)} required deny lines", f"{len(want) - len(missing)} of {len(want)} present "
                    f"({len(have)} in the file)" + (f"; missing: {', '.join(missing[:5])}"
                                                     + (f" and {len(missing) - 5} more" if len(missing) > 5 else "")
                                                     if missing else ""), {"missing": missing}))
    hooks = d.get("hooks") or {}
    for h in cfg["hooks_required"]:
        found = False
        for g in hooks.get(h["event"]) or []:
            if g.get("matcher") != h.get("matcher"):
                continue
            for x in g.get("hooks") or []:
                if x.get("command") == h["command"] and ("if" not in h or x.get("if") == h["if"]):
                    found = True
        out.append(item("settings", hook_id(h), "pass" if found else "fail", hook_desc(h),
                        "present" if found else "no such hook entry"))
    return out


def hook_script(h):
    s = re.findall(r"[\w.-]+\.(?:sh|py|mjs|js)", h["command"])
    return s[0] if s else h["command"][:40]


def hook_id(h):
    parts = ["settings.hook", h["event"], hook_script(h)]
    if h.get("if"):
        parts.append(h["if"])
    return " ".join(parts)


def hook_desc(h):
    return f"{h['event']} hook" + (f" (matcher {h['matcher']})" if h.get("matcher") else "") + \
        (f" if {h['if']}" if h.get("if") else "") + f" runs {hook_script(h)}"


# ---- mergify -------------------------------------------------------------------------------------------------------
def norm_cond(c):
    """One Mergify condition in a canonical form: spaces around operators dropped, nested and/or kept in order."""
    if isinstance(c, dict):
        return json.dumps({k: [norm_cond(x) for x in v] for k, v in c.items()}, sort_keys=True)
    return re.sub(r"\s*(~=|!=|>=|<=|=|>|<)\s*", r"\1", str(c).strip())


def check_mergify(src, m):
    cfg = m["mergify"]; out = []
    d, err = parse_yaml(src, cfg["path"])
    if err or not isinstance(d, dict):
        return [item("mergify", "mergify.file", "fail", f"{cfg['path']} readable", err or "not a mapping")]
    mpc = (d.get("merge_queue") or {}).get("max_parallel_checks")
    out.append(item("mergify", "mergify.max_parallel_checks", "pass" if mpc == cfg["max_parallel_checks"] else "fail",
                    cfg["max_parallel_checks"], mpc))
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
        bad = []
        if q.get("batch_size") != want["batch_size"]:
            bad.append(f"batch_size {q.get('batch_size')} (want {want['batch_size']})")
        if q.get("merge_method") != want["merge_method"]:
            bad.append(f"merge_method {q.get('merge_method')} (want {want['merge_method']})")
        for key in ("queue_conditions", "merge_conditions"):
            have = {norm_cond(c) for c in q.get(key) or []}
            miss = [c for c in want[f"{key}_required"] if norm_cond(c) not in have]
            if miss:
                bad.append(f"{key} missing {'; '.join(c if isinstance(c, str) else json.dumps(c) for c in miss)}")
        out.append(item("mergify", f"mergify.queue.{name}", "fail" if bad else "pass",
                        f"batch_size {want['batch_size']}, {want['merge_method']}, "
                        f"{len(want['queue_conditions_required'])} queue and "
                        f"{len(want['merge_conditions_required'])} merge conditions",
                        "; ".join(bad) if bad else "as approved"))
    amc = (d.get("merge_protections_settings") or {}).get("auto_merge_conditions")
    out.append(item("mergify", "mergify.auto_merge_conditions", "pass" if amc == cfg["auto_merge_conditions"] else "fail",
                    cfg["auto_merge_conditions"], amc))
    return out


# ---- ci ------------------------------------------------------------------------------------------------------------
def write_scopes(perm):
    """The scopes a permissions value can write: 'write-all' = everything."""
    if perm in ("write-all",):
        return ["*"]
    if isinstance(perm, dict):
        return sorted(k for k, v in perm.items() if v == "write")
    return []


def check_ci(src, m):
    cfg = m["ci"]; out = []
    d, err = parse_yaml(src, cfg["path"])
    if err or not isinstance(d, dict):
        return [item("ci", "ci.file", "fail", f"{cfg['path']} readable", err or "not a mapping")]
    jobs = d.get("jobs") or {}
    miss = [j for j in cfg["jobs_required"] if j not in jobs]
    out.append(item("ci", "ci.jobs", "fail" if miss else "pass", ", ".join(cfg["jobs_required"]),
                    f"missing {', '.join(miss)}" if miss else "all present"))
    needs = (jobs.get(cfg["gate_job"]) or {}).get("needs") or []
    needs = [needs] if isinstance(needs, str) else needs
    miss = [j for j in cfg["gate_needs_required"] if j not in needs] + \
        [f"{j} (needed but not defined)" for j in cfg["gate_needs_required"] if j in needs and j not in jobs]
    out.append(item("ci", "ci.gate", "fail" if miss else "pass",
                    f"job {cfg['gate_job']} needs {', '.join(cfg['gate_needs_required'])}",
                    f"missing {', '.join(miss)}" if miss else "all needed"))
    on = d.get("on", d.get(True))  # PyYAML reads the key on as True
    on = {on: None} if isinstance(on, str) else ({k: None for k in on} if isinstance(on, list) else (on or {}))
    bad = []
    for trig, types in cfg["triggers_required"].items():
        if trig not in on:
            bad.append(f"no {trig}")
            continue
        have = (on[trig] or {}).get("types") if isinstance(on[trig], dict) else None
        if have is not None:  # no types = every type GitHub sends by default (opened, synchronize, reopened)
            miss = [t for t in types if t not in have]
            if miss:
                bad.append(f"{trig} without {', '.join(miss)}")
        elif "ready_for_review" in types:
            bad.append(f"{trig} without ready_for_review")
    bad += [f"forbidden trigger {t}" for t in cfg["triggers_forbidden"] if t in on]
    out.append(item("ci", "ci.triggers", "fail" if bad else "pass",
                    "; ".join(f"{k}: {', '.join(v)}" for k, v in cfg["triggers_required"].items())
                    + f"; never {', '.join(cfg['triggers_forbidden'])}", "; ".join(bad) if bad else "as approved"))
    top = d.get("permissions")
    bad = []
    if top is not None and write_scopes(top):
        bad.append(f"workflow-level write: {', '.join(write_scopes(top))}")
    allowed = cfg["write_scopes_allowed"]
    for name, j in jobs.items():
        perm = j.get("permissions", top) if isinstance(j, dict) else top
        if perm is None:
            bad.append(f"job {name} declares no permissions (gets the repository default)")
            continue
        extra = [s for s in write_scopes(perm) if s not in allowed.get(name, [])]
        if extra:
            bad.append(f"job {name} writes {', '.join(extra)}")
    out.append(item("ci", "ci.permissions", "fail" if bad else "pass",
                    "read-only token; write only " + (", ".join(f"{k}: {', '.join(v)}" for k, v in allowed.items())
                                                      or "nowhere"), "; ".join(bad) if bad else "as approved"))
    return out


# ---- ruleset -------------------------------------------------------------------------------------------------------
def check_ruleset(m, rules):
    """rules: the list GitHub returns for the branch's active rules (None = not read here)."""
    cfg = m["ruleset"]
    exp = f"{', '.join(cfg['rules_required'])}; required check {', '.join(cfg['required_checks'])}"
    iid = f"ruleset.{cfg['branch']}"
    if rules is None:
        return [item("ruleset", iid, "unchecked", exp, SESSION_RULESET)]
    if isinstance(rules, str):  # an error reading them
        return [item("ruleset", iid, "fail", exp, rules)]
    if not rules and not cfg["required"]:
        return [item("ruleset", iid, "pending", exp, "no ruleset on main yet (tolerated until required is set, "
                                                     "after the move)")]
    types = {r.get("type") for r in rules}
    checks = set()
    for r in rules:
        if r.get("type") == "required_status_checks":
            for c in (r.get("parameters") or {}).get("required_status_checks") or []:
                checks.add(c.get("context"))
    miss = [t for t in cfg["rules_required"] if t not in types] + \
        [f"check {c}" for c in cfg["required_checks"] if c not in checks]
    return [item("ruleset", iid, "fail" if miss else "pass", exp,
                 f"missing {', '.join(miss)}" if miss else "all rules active")]


def read_rules(m):
    """GitHub's active rules for the branch, read with the workflow's GITHUB_TOKEN (read-only)."""
    import urllib.request, urllib.error
    repo, tok = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_TOKEN")
    if not repo or not tok:
        return "GITHUB_REPOSITORY or GITHUB_TOKEN not set"
    url = f"https://api.github.com/repos/{repo}/rules/branches/{m['ruleset']['branch']}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json",
                                               "X-GitHub-Api-Version": "2022-11-28"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except (urllib.error.URLError, ValueError, OSError) as e:
        return f"could not read the branch rules ({e})"


# ---- library -------------------------------------------------------------------------------------------------------
VERSION_LINE = re.compile(r"^[\s>#*|_-]*Version[\s*_|]*[:|][\s*_]*v?([0-9][0-9A-Za-z.+-]*)", re.M)


def header_version(text):
    try:
        d = json.loads(text)
        if isinstance(d, dict) and "version" in d:
            return str(d["version"]).lstrip("v")
    except ValueError:
        pass
    mm = VERSION_LINE.search("\n".join(text.splitlines()[:40]))
    return mm.group(1).rstrip(".") if mm else None


def check_library(src, m):
    cfg = m["library"]; out = []
    d, err = parse_json(src, cfg["path"])
    if err:
        return [item("library", "library.registry", "fail", f"{cfg['path']} readable", err)]
    for doc in d.get("docs") or []:
        name, path, want = doc.get("name", "?"), doc.get("path", ""), doc.get(cfg["version_field"])
        iid = f"library.{name}"
        exp = "exists" + (f", Version {want}" if want is not None else "")
        if path.startswith(("artifact:", "local:")) or "://" in path:
            out.append(item("library", iid, "unchecked", exp, "not in the repository (claude.ai artifact or local "
                                                               "only)"))
            continue
        hits = src.matches(path)
        if not hits:
            out.append(item("library", iid, "fail", exp, f"{path} not found"))
            continue
        if want is None:
            out.append(item("library", iid, "pass", exp, f"exists ({len(hits)} match(es))"))
            continue
        text = src.read(path) if path in hits else None
        if text is None:
            out.append(item("library", iid, "fail", exp, f"{path} is not one file, so it has no Version header"))
            continue
        have = header_version(text)
        ok = have is not None and have == str(want).lstrip("v")
        out.append(item("library", iid, "pass" if ok else "fail", exp,
                        f"Version {have}" if have else "no Version header in the first 40 lines"))
    return out


# ---- run -----------------------------------------------------------------------------------------------------------
def run(src, manifest, rules=None):
    items = []
    for f in (check_settings, check_mergify, check_ci):
        items += f(src, manifest)
    items += check_ruleset(manifest, rules)
    items += check_library(src, manifest)
    counts = {s: sum(1 for i in items if i["status"] == s) for s in ("pass", "fail", "pending", "unchecked")}
    checked = counts["pass"] + counts["fail"]
    now = ist_now()
    return {"check": "conformance (CK-1)", "enforced": "yes" if counts["fail"] == 0 and checked else "no",
            "checked_at": now.isoformat(timespec="seconds"), "checked_at_ist": now.strftime("%d %b %H:%M IST"),
            "source": src.label(), "manifest_version": manifest.get("version"), "counts": counts,
            "checked": checked, "items": items}


def markdown(res):
    lines = []
    for i in res["items"]:
        lines.append(f"{i['status'].upper():9} {i['id']}: expected {fmt(i['expected'])}; found {fmt(i['found'])}")
    c = res["counts"]
    lines.append(f"enforced: {res['enforced']} · {c['pass']} of {res['checked']} checked items pass"
                 f" · {c['pending']} pending · {c['unchecked']} unchecked · last checked {res['checked_at_ist']}"
                 f" · {res['source']} · manifest {res['manifest_version']}")
    return "\n".join(lines)


def fmt(v):
    return v if isinstance(v, str) else json.dumps(v)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--ref", default="origin/main", help="git ref to read (default origin/main)")
    g.add_argument("--root", help="read a folder instead of a git ref (tests, a checked-out copy)")
    ap.add_argument("--manifest", help="manifest file (default: the one in the same repository state)")
    ap.add_argument("--github", action="store_true", help="read main's branch rules with GITHUB_TOKEN (workflow only)")
    ap.add_argument("--json", help="write the result as JSON to FILE, or - for stdout")
    ap.add_argument("--md", help="also write the markdown lines to FILE (the job summary)")
    ap.add_argument("--quiet", action="store_true", help="print only failed items and the summary line")
    a = ap.parse_args(argv)
    src = Source(root=a.root) if a.root else Source(ref=a.ref)
    if a.manifest:
        with open(a.manifest, encoding="utf-8") as f:
            manifest = json.load(f)
    else:
        manifest, err = parse_json(src, MANIFEST)
        if err:
            print(f"conformance-check: {err}; nothing was checked", file=sys.stderr)
            return 101
    rules = read_rules(manifest) if a.github else None
    res = run(src, manifest, rules)
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
