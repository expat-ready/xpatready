#!/usr/bin/env python3
"""npm audit of the studio package, counted (P-776's condition: npm ci and npm audit in CI on the package; Lead 25, 24 Nov).
Report only: main has findings already, so nothing here fails a PR. Reads two `npm audit --json` answers, the PR's and the
base's: the PR's count by severity, and the packages with a finding the base does not have.
   python3 -I product/tools/npm-audit-report.py --head head.json [--base base.json] [--summary FILE]
An answer that is no audit (network, registry error, cut) is said, exit 2, never "0 findings". Test: check-npm-audit-report.sh."""
import argparse, json, re, sys
ORDER = ("critical", "high", "moderate", "low", "info")


def safe(s, n=80):
    return re.sub(r"[^ -~]+", " ", str(s)).replace("::", ": :").replace("##[", "# #[").replace("|", "/").replace("<", "&lt;").replace("`", "'")[:n]


def read(path):
    d = json.load(open(path, encoding="utf-8"))
    c, v = d["metadata"]["vulnerabilities"], d["vulnerabilities"]
    if d.get("error") or not isinstance(v, dict) or not all(isinstance(c.get(k), int) for k in (*ORDER, "total")):
        raise ValueError("no audit answer: " + safe((d.get("error") or {}).get("summary", "fields missing") if isinstance(d.get("error"), dict) else "fields missing"))
    if len(v) != c["total"]:
        raise ValueError(f"total {c['total']} but {len(v)} packages")
    return c, {k: x["severity"] for k, x in v.items()}


def main():
    a = argparse.ArgumentParser(); a.add_argument("--head", required=True); a.add_argument("--base"); a.add_argument("--summary"); o = a.parse_args()
    c, v = read(o.head); counts = ", ".join(f"{c[k]} {k}" for k in ORDER if c[k]) or "none"
    line = f"npm audit (studio, report only): {c['total']} packages with a finding ({counts})"
    rows, warn = [], ""
    if o.base:
        try:
            b, w = read(o.base)
            new = {k: s for k, s in v.items() if k not in w or ORDER.index(s) < ORDER.index(w[k])}
            line += f"; the base has {b['total']}; {len(new)} new or more severe here, {len([k for k in w if k not in v])} gone"
            rows = [f"| {safe(k)} | {s} |" for k, s in sorted(new.items(), key=lambda x: (ORDER.index(x[1]), x[0]))]
            warn = f"{len(new)} packages with a new or more severe finding than the base: " + ", ".join(safe(k, 40) for k in list(new)[:5]) if new else ""
        except Exception as e:
            line += "; the base could not be read"; warn = f"the base's audit could not be read ({type(e).__name__}: {safe(e)})"
    print(line)
    if warn:
        print(f"::warning title=npm audit (P-776, report only)::{warn}")
    if o.summary:
        with open(o.summary, "a", encoding="utf-8") as fh:
            fh.write(f"### {line}\n" + ("\n| New or more severe | Severity |\n|---|---|\n" + "\n".join(rows[:50]) + "\n" if rows else "") + (f"\n{len(rows) - 50} more.\n" if len(rows) > 50 else ""))


try:
    main()
except Exception as e:
    print(f"::warning title=npm audit (P-776, report only)::not read ({type(e).__name__}: {safe(e)}): the findings were not counted")
    sys.exit(2)
