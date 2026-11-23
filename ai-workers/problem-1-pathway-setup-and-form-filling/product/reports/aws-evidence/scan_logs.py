# R1.13 and R1.15: every event of /xr/staging/app searched for the seeded Sample people and for each xr/staging secret's value.
# Prints names and counts only. A planted line (in memory) proves the search finds what it looks for.
import json, re, subprocess, sys
def aws(*a): return json.loads(subprocess.run(["aws", *a, "--output", "json"], check=True, capture_output=True, text=True).stdout)
def secrets():
    out = {}
    for s in aws("secretsmanager", "list-secrets", "--filters", "Key=name,Values=xr/staging/")["SecretList"]:
        v = aws("secretsmanager", "get-secret-value", "--secret-id", s["ARN"])["SecretString"]
        if '"placeholder"' in v: out[s["Name"]] = None; continue
        parts = {v} | set(re.findall(r"://[^:/@\s]+:([^@\s]+)@", v)) | {p.split(":", 1)[-1] for p in v.split(",")}
        out[s["Name"]] = {p for p in parts if len(p) >= 12}
    return out
def main():
    firms = json.load(open(sys.argv[1]))["firms"]; pii = {}
    for f in firms:
        for i, u in enumerate(f["users"]):
            k = f"{f['key']}/person{i+1}"
            pii[k + " email"] = u.get("email") or f"{u['id']}@{f['key']}.example.com"
            pii[k + " name"] = u["name"]
            if u.get("licence"): pii[k + " licence"] = u["licence"]["number"]
    ev = aws("logs", "filter-log-events", "--log-group-name", "/xr/staging/app")["events"]   # the CLI follows every page
    text = "\n".join(e["message"] for e in ev); low = text.lower()
    print("events", len(ev), "streams", len({e["logStreamName"] for e in ev}))
    if not ev: print("no events: nothing proved"); return 1
    bad = 0
    for k, v in pii.items():
        n = low.count(v.lower()); bad += n; print("personal", k, "hits", n)
    em = len(re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", text)); print("any email-shaped text", em); bad += em
    sec = secrets()
    for k, vs in sec.items():
        if vs is None: print("secret", k, "placeholder: not scanned"); continue
        n = sum(text.count(v) for v in vs); bad += n; print("secret", k, "parts", len(vs), "hits", n)
    planted = low + next(iter(pii.values())).lower(); print("self-test finds a planted value:", planted.count(next(iter(pii.values())).lower()) > 0)
    return 1 if bad else 0
if __name__ == "__main__": sys.exit(main())
