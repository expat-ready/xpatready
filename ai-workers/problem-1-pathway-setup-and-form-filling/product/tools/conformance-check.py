#!/usr/bin/env python3
"""Set-up conformance (CK-1, founder asks A151 and A154, 17 Nov 2026): is the decided engineering set-up in force?

Compares the repository at origin/main (or a --root folder, or another --ref) with the approved manifest
product/design/engineering-approved-setup.json, read from the same place, item by item:
  settings  the agents' deny lines in .claude/settings.json (a set: extra lines allowed, a missing one fails); hooks not
            switched off (disableAllHooks); each required hook entry: event + matcher + type command + command, and its
            "if" exactly as the manifest has it (absent means absent: an added "if" can stop a hook from firing);
  mergify   .mergify.yml: max_parallel_checks, mode, capacities (a key ending in * pins every scope of that family),
            barrier files, the queue names in order, each queue's batch_size, merge_method and
            required queue and merge conditions (sets), auto_merge_conditions, and no way round the queues (no
            pull_request_rules entry with a merge or queue action, no extends:);
  ci        ci.yml: workflow name, the required jobs, the gate: its check name (a job's name:, else its key: what
            Mergify and the ruleset match) and no other job's, its needs (each defined), its if: exactly, no
            continue-on-error on it or its needs; the triggers exactly (only pull_request, its types exactly, no
            branch or path filters); token scopes (every job's effective permissions declared, write only where the
            manifest allows it);
  ruleset   the rules GitHub applies to main (deletion, non_fast_forward, the required check ci), read only with
            --github by the heartbeat workflow (CK-2, GITHUB_TOKEN read); elsewhere "unchecked"; no rules while the
            manifest says required false = "pending" until required_from, a failure after it (bypass lists are not
            visible in this answer);
  heartbeat the heartbeat workflow (CK-2) as decided: scheduled every every_min, a read-only token, one job, a timeout
            of at most timeout_min, a concurrency group that never cancels a running run;
  library   each master in cockpit/library.json exists inside the repository (no empty, absolute or .. path); one
            with a registry "version" (a string) carries the same "Version:" header in its first 40 lines (any case;
            a JSON master: a top-level "version"); claude.ai artifacts and local-only paths are "unchecked".
Each item is pass | fail | unchecked | pending with expected vs found; "enforced: yes" when nothing fails.
Output: one markdown line per item and a summary line; --json FILE (or -) writes the result. checked_at in IST
(Asia/Kolkata, P-302). Exit code = the number of failed items (at most 100); 101 = nothing was checked.
Reads only (git or files; --github: one GET of main's branch rules); no model, no paid service.
  python3 -I product/tools/conformance-check.py [--ref origin/main | --root DIR] [--manifest PATH] [--github]
                                                [--json FILE|-] [--md FILE] [--quiet]
Tests: product/tools/test_conformance_check.py (check-conformance-check.sh, guard 24 of check-guards.sh).
"""
import argparse, fnmatch, glob, json, os, re, subprocess, sys, urllib.error, urllib.request
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
        same = sha and (sha.startswith(self.ref) or self.ref.startswith(sha))  # a sha given as --ref: print it once
        return self.ref if same else f"{self.ref} {sha}".strip()

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
        """Paths in this state matching a path, a folder or a glob (library.json's pathspecs)."""
        if self.root:
            root = os.path.realpath(self.root)
            hits = (os.path.realpath(p) for p in glob.glob(os.path.join(root, pattern)))
            return sorted(os.path.relpath(p, root) for p in hits if p.startswith(root + os.sep))
        if not hasattr(self, "_files"):
            self._files = subprocess.run(["git", "ls-tree", "-r", "--name-only", self.ref], capture_output=True,
                                         text=True, cwd=self.repo).stdout.splitlines()
        return [f for f in self._files if f == pattern or f.startswith(pattern.rstrip("/") + "/")
                or fnmatch.fnmatchcase(f, pattern)]


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


def check_settings(src, m, rules=None):
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


def check_mergify(src, m, rules=None):
    cfg = m["mergify"]
    d, err = parse(src, cfg["path"], yaml.safe_load)
    if err or not isinstance(d, dict):
        return [item("mergify", "mergify.file", "fail", f"{cfg['path']} readable", err or "not a mapping")]
    mpc = (d.get("merge_queue") or {}).get("max_parallel_checks")
    out = [item("mergify", "mergify.max_parallel_checks", "pass" if mpc == cfg["max_parallel_checks"] else "fail",
                cfg["max_parallel_checks"], mpc)]
    # P-715 (manifest 1.4.0): parallel mode, its barrier files and per-scope capacities; checked when the manifest names
    # them, so a quiet revert (e.g. migrations' capacity 1, the 60% second-migration cause) fails here, not in the queue.
    if "mode" in cfg:
        mode = (d.get("merge_queue") or {}).get("mode", "serial")
        out.append(item("mergify", "mergify.mode", "pass" if mode == cfg["mode"] else "fail", cfg["mode"], mode))
    sc = d.get("scopes") if isinstance(d.get("scopes"), dict) else {}
    if "capacities_required" in cfg:
        caps = sc.get("capacities") or {}
        # A key ending in * pins a family (SPD-2, manifest 1.6.0: "mig-*": 1): at least one scope of it, and every one,
        # in the scope list or the capacities, at exactly that capacity.
        names = set(caps) | set((((sc.get("source") or {}).get("files")) or {}))
        bad = []
        for k, v in cfg["capacities_required"].items():
            if not k.endswith("*"):
                if caps.get(k) != v: bad.append(f"{k} {caps.get(k)} (want {v})")
                continue
            fam = sorted(n for n in names if str(n).startswith(k[:-1]))
            if not fam: bad.append(f"no {k} scope (want each at {v})")
            bad += [f"{n} {caps.get(n)} (want {v})" for n in fam if caps.get(n) != v]
        out.append(item("mergify", "mergify.capacities", "fail" if bad else "pass",
                        ", ".join(f"{k} {v}" for k, v in cfg["capacities_required"].items()), "; ".join(bad) or "as approved"))
    if "barrier_files_required" in cfg:
        have = set((sc.get("barrier_files") or {}).get("include") or [])
        miss = [g for g in cfg["barrier_files_required"] if g not in have]
        out.append(item("mergify", "mergify.barrier_files", "fail" if miss else "pass",
                        f"all {len(cfg['barrier_files_required'])} barrier patterns",
                        f"missing {', '.join(miss[:4])}{' …' if len(miss) > 4 else ''}" if miss else "as approved"))
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
        bad = [f"{k} {q.get(k)} (want {want[k]})" for k in ("batch_size", "merge_method", "batch_max_failure_resolution_attempts")
               if k in want and q.get(k) != want[k]]
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


# ---- ci ------------------------------------------------------------------------------------------------------------
def write_scopes(perm):
    """The scopes a permissions value can write: 'write-all' = everything."""
    if perm == "write-all":
        return ["*"]
    return sorted(k for k, v in perm.items() if v == "write") if isinstance(perm, dict) else []


def check_ci(src, m, rules=None):
    cfg = m["ci"]
    d, err = parse(src, cfg["path"], yaml.safe_load)
    if err or not isinstance(d, dict):
        return [item("ci", "ci.file", "fail", f"{cfg['path']} readable", err or "not a mapping")]
    jobs = d.get("jobs") or {}
    miss = [j for j in cfg["jobs_required"] if j not in jobs]
    if d.get("name") != cfg["workflow_name"]:
        miss.append(f"workflow name {d.get('name')!r} (want {cfg['workflow_name']!r})")
    out = [item("ci", "ci.jobs", "fail" if miss else "pass", f"workflow {cfg['workflow_name']}: "
                + ", ".join(cfg["jobs_required"]), f"missing {', '.join(miss)}" if miss else "all present")]
    gate = jobs.get(cfg["gate_job"]) or {}
    needs = gate.get("needs") or []
    needs = [needs] if isinstance(needs, str) else needs
    miss = [j for j in cfg["gate_needs_required"] if j not in needs] + \
        [f"{j} (needed but not defined)" for j in cfg["gate_needs_required"] if j in needs and j not in jobs]
    # Mergify's check-success = ci and the ruleset match the check name: a job's name:, else its key.
    shown = {k: str(j.get("name", k)) if isinstance(j, dict) else k for k, j in jobs.items()}
    if cfg["gate_job"] in jobs and shown[cfg["gate_job"]] != cfg["gate_job"]:
        miss.append(f"gate shows as check {shown[cfg['gate_job']]!r}")
    miss += [f"job {k} also shows as check {cfg['gate_job']!r}" for k, n in shown.items()
             if n == cfg["gate_job"] and k != cfg["gate_job"]]
    if gate.get("if") != cfg["gate_if"]:
        miss.append(f"gate if: {gate.get('if')!r}")
    miss += [f"continue-on-error on {k}" for k in [cfg["gate_job"]] + needs
             if isinstance(jobs.get(k), dict) and jobs[k].get("continue-on-error") not in (None, False)]
    out.append(item("ci", "ci.gate", "fail" if miss else "pass", f"check {cfg['gate_job']} from job {cfg['gate_job']} "
                    "only, its if: as approved, no continue-on-error, needs " + ", ".join(cfg["gate_needs_required"]),
                    "; ".join(miss) if miss else "as approved"))
    on = d.get("on", d.get(True))  # PyYAML reads the key on as True
    on = {on: None} if isinstance(on, str) else ({k: None for k in on} if isinstance(on, list) else (on or {}))
    bad = []
    for trig, types in cfg["trigger_types_exact"].items():
        have = (on[trig] or {}).get("types") if isinstance(on.get(trig), dict) else None
        if trig not in on:
            bad.append(f"no {trig}")
        elif sorted(have or []) != sorted(types):  # no types = GitHub's default set, never ready_for_review
            bad.append(f"{trig} types {have or 'default'}")
        bad += [f"{trig} filter {f}" for f in ("branches", "branches-ignore", "paths", "paths-ignore")
                if isinstance(on.get(trig), dict) and f in on[trig]]
    bad += [f"forbidden trigger {t}" for t in cfg["triggers_forbidden"] if t in on]
    bad += [f"extra trigger {t}" for t in on if t not in cfg["trigger_types_exact"] and t not in cfg["triggers_forbidden"]]
    out.append(item("ci", "ci.triggers", "fail" if bad else "pass",
                    "only " + "; ".join(f"{k}: exactly {', '.join(v)}, no filters"
                                        for k, v in cfg["trigger_types_exact"].items()), "; ".join(bad) or "as approved"))
    top, allowed, bad = d.get("permissions"), cfg["write_scopes_allowed"], []
    if top is not None and write_scopes(top):
        bad.append(f"workflow-level write: {', '.join(write_scopes(top))}")
    for name, j in jobs.items():
        perm = j.get("permissions", top) if isinstance(j, dict) else top
        if perm is None:
            bad.append(f"job {name} declares no permissions (gets the repository default)")
        elif [x for x in write_scopes(perm) if x not in allowed.get(name, [])]:
            bad.append(f"job {name} writes {', '.join(x for x in write_scopes(perm) if x not in allowed.get(name, []))}")
    out.append(item("ci", "ci.permissions", "fail" if bad else "pass", "read-only token; write only "
                    + (", ".join(f"{k}: {', '.join(v)}" for k, v in allowed.items()) or "nowhere"),
                    "; ".join(bad) or "as approved"))
    return out


# ---- heartbeat workflow --------------------------------------------------------------------------------------------
def check_heartbeat(src, m, rules=None):
    hb = m.get("heartbeat")
    if not hb:
        return []
    path = f".github/workflows/{hb['workflow']}"
    exp = (f"every {hb['every_min']} min, read-only token, one job, timeout <= {hb['timeout_min']} min, "
           "a concurrency group that never cancels")
    d, err = parse(src, path, yaml.safe_load)
    if err or not isinstance(d, dict):
        return [item("heartbeat", "heartbeat.workflow", "fail", exp, err or "not a mapping")]
    on, bad, per_hour = d.get("on", d.get(True)) or {}, [], 0
    crons = [c.get("cron", "") for c in (on.get("schedule") or [])] if isinstance(on, dict) else []
    for c in crons:
        f = c.split()
        if len(f) == 5 and f[1:] == ["*", "*", "*", "*"]:
            try:   # minute field: "*" (60 an hour), "*/n", or a list such as "11,41"; anything else counts 0
                per_hour += 60 if f[0] == "*" else 60 // int(f[0][2:]) if f[0].startswith("*/") else len(f[0].split(","))
            except (ValueError, ZeroDivisionError):
                bad.append(f"cron {c!r} not understood")
    envs = [("workflow", d.get("env"))] + [(f"job {k}", j.get("env")) for k, j in (d.get("jobs") or {}).items()]
    bad += [f"{w} env uses runner. (GitHub refuses the file: no run, no mail)" for w, e in envs if "runner." in str(e)]
    if per_hour * hb["every_min"] < 60:
        bad.append(f"schedule {crons or 'none'}: {per_hour} run(s) an hour")
    jobs, top = d.get("jobs") or {}, d.get("permissions")
    if len(jobs) != 1:
        bad.append(f"{len(jobs)} jobs")
    for name, j in jobs.items():
        perm = j.get("permissions", top)
        if perm is None or write_scopes(perm):
            bad.append(f"job {name} token: {perm if perm is not None else 'repository default'}")
        tm = j.get("timeout-minutes")
        if isinstance(tm, bool) or not isinstance(tm, int) or tm > hb["timeout_min"]:
            bad.append(f"job {name} timeout {j.get('timeout-minutes')}")
    conc = d.get("concurrency")
    if not isinstance(conc, dict) or not conc.get("group") or conc.get("cancel-in-progress") not in (False, None):
        bad.append(f"concurrency {conc}")
    return [item("heartbeat", "heartbeat.workflow", "fail" if bad else "pass", exp, "; ".join(bad) or "as approved")]


# ---- ruleset -------------------------------------------------------------------------------------------------------
NOT_READ = "unchecked (read only by the heartbeat workflow, CK-2, with --github; the agents' deny list blocks it here)"


def check_ruleset(src, m, rules=None):
    """rules: GitHub's list of active rules for the branch; None = not read here; a string = why it could not be read."""
    cfg = m["ruleset"]; iid = f"ruleset.{cfg['branch']}"
    exp = f"{', '.join(cfg['rules_required'])}; required check {', '.join(cfg['required_checks'])}"
    if rules is None:
        return [item("ruleset", iid, "unchecked", exp, NOT_READ)]
    if not isinstance(rules, list):
        return [item("ruleset", iid, "fail", exp, rules if isinstance(rules, str) else f"unexpected answer: {rules}")]
    if not rules and not cfg["required"]:
        late = ist_now().date().isoformat() >= cfg["required_from"]
        return [item("ruleset", iid, "fail" if late else "pending", exp, f"no ruleset on main yet ("
                     + (f"required from {cfg['required_from']}" if late else f"tolerated until {cfg['required_from']}")
                     + ")")]
    types = {r.get("type") for r in rules if isinstance(r, dict)}
    checks = {c.get("context") for r in rules if isinstance(r, dict) and r.get("type") == "required_status_checks"
              for c in (r.get("parameters") or {}).get("required_status_checks") or []}
    miss = [x for x in cfg["rules_required"] if x not in types] + \
        [f"check {c}" for c in cfg["required_checks"] if c not in checks]
    return [item("ruleset", iid, "fail" if miss else "pass", exp, f"missing {', '.join(miss)}" if miss else
                 "all rules active (bypass lists are not in this answer)")]


def read_rules(m, opener=urllib.request.urlopen):
    """GitHub's active rules for the branch, read with the workflow's GITHUB_TOKEN (read-only); a string on failure."""
    repo, tok = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_TOKEN")
    if not repo or not tok:
        return "GITHUB_REPOSITORY or GITHUB_TOKEN not set"
    api = os.environ.get("GITHUB_API_URL", "https://api.github.com")
    req = urllib.request.Request(f"{api}/repos/{repo}/rules/branches/{m['ruleset']['branch']}?per_page=100",
                                 headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"})
    try:
        with opener(req, timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        e.close()
        return f"could not read the branch rules (HTTP {e.code})"
    except (urllib.error.URLError, ValueError, OSError) as e:
        return f"could not read the branch rules ({e})"


# ---- library -------------------------------------------------------------------------------------------------------
VERSION_LINE = re.compile(r"^[\s>#*|_-]*version[\s*_|]*[:|][\s*_]*v?([0-9][0-9A-Za-z.+-]*)", re.M | re.I)


def header_version(text):
    try:
        d = json.loads(text)
        if isinstance(d, dict) and "version" in d:
            return str(d["version"]).lstrip("v")
    except ValueError:
        pass
    mm = VERSION_LINE.search("\n".join(text.splitlines()[:40]))
    return mm.group(1).rstrip(".") if mm else None


def check_library(src, m, rules=None):
    cfg = m["library"]
    d, err = parse(src, cfg["path"], json.loads)
    if err:
        return [item("library", "library.registry", "fail", f"{cfg['path']} readable", err)]
    out = []
    for doc in d.get("docs") or []:
        name, path, want = doc.get("name", "?"), doc.get("path", ""), doc.get(cfg["version_field"])
        iid, exp = f"library.{name}", "exists" + (f", Version {want}" if want is not None else "")
        if path.startswith(("artifact:", "local:")) or "://" in path:
            out.append(item("library", iid, "unchecked", exp, "not in the repository (claude.ai artifact or local)"))
            continue
        if not path or os.path.isabs(path) or ".." in path.split("/"):
            out.append(item("library", iid, "fail", exp, f"path {path!r} is not inside the repository"))
            continue
        if want is not None and not isinstance(want, str):
            out.append(item("library", iid, "fail", exp, f"registry version {want!r} is not a string"))
            continue
        hits = src.matches(path)
        if not hits or want is None:
            out.append(item("library", iid, "pass" if hits else "fail", exp,
                            f"exists ({len(hits)} match(es)); no version registered" if hits else f"{path} not found"))
            continue
        text = src.read(path) if path in hits else None
        have = header_version(text) if text is not None else None
        ok = have is not None and have == str(want).lstrip("v")
        out.append(item("library", iid, "pass" if ok else "fail", exp, f"Version {have}" if have else
                        ("no Version header in the first 40 lines" if text is not None else f"{path} is not one file")))
    return out


CHECKS = (check_settings, check_mergify, check_ci, check_heartbeat, check_ruleset, check_library)


# ---- run -----------------------------------------------------------------------------------------------------------
def run(src, manifest, rules=None, checks=CHECKS):
    items = [i for f in checks for i in f(src, manifest, rules)]
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
    ap.add_argument("--github", action="store_true", help="read main's branch rules with GITHUB_TOKEN (the workflow)")
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
        res = run(src, manifest, read_rules(manifest) if a.github else None)
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
