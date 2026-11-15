#!/usr/bin/env python3 -I
# Lead B watch, one GraphQL call per run (Lead 58, 15 Nov: the REST hour is shared by every session; fewest calls).
# Prints new PF/FO PR comments that ask Lead B or the tech lead, as "#<pr> [<title>] comment <id>: <start>";
# "WATCH-ERROR <reason>" on a failed call. Seen ids live in seen.txt next to this file (not committed).
# usage: GH_TOKEN=$(gh auth token) python3 -I scan-pr-questions-gql.py SINCE   (SINCE like 2026-11-15T04:00:00Z)
import json, os, sys, urllib.request

W = os.path.dirname(os.path.abspath(__file__))
SEEN = os.path.join(W, "seen.txt")
since = sys.argv[1][:10]
q = ('query($q:String!){rateLimit{remaining resetAt} search(query:$q,type:ISSUE,first:40){nodes{... on PullRequest{'
     'number title comments(last:8){nodes{databaseId body}}}}}}')
import subprocess
REPO = subprocess.run(["git", "-C", W, "remote", "get-url", "origin"], capture_output=True, text=True).stdout.strip()
REPO = REPO.split("github.com", 1)[1].lstrip(":/").removesuffix(".git")  # owner/name, read from the clone (no name in this file)
v = {"q": f"repo:{REPO} is:pr updated:>={since}"}
try:
    # curl reads large answers through the proxy where urllib stops short (IncompleteRead)
    out = subprocess.run(["curl", "-s", "--retry", "3", "--max-time", "90", "-X", "POST", "https://api.github.com/graphql",
                          "-H", "Authorization: Bearer " + os.environ["GH_TOKEN"], "--data-binary", "@-"],
                         input=json.dumps({"query": q, "variables": v}).encode(), capture_output=True, check=True).stdout
    d = json.loads(out)
    nodes = d["data"]["search"]["nodes"]
except Exception as e:  # noqa: BLE001 - any failure is reported, never hidden
    print(f"WATCH-ERROR {type(e).__name__}: {str(e)[:120]}")
    sys.exit(0)
seen = set(open(SEEN).read().split()) if os.path.exists(SEEN) else set()
new = []
for pr in nodes:
    if not pr or ("PF-" not in pr["title"] and "FO-" not in pr["title"]):
        continue
    for c in pr["comments"]["nodes"]:
        i, b = str(c["databaseId"]), c["body"] or ""
        if i in seen:
            continue
        h = b[:300]
        mine = ("from Lead B" in h or "Answers from Lead B" in h or "Answer from Lead B" in h
                or h.lstrip().startswith("**Lead B (") or "Lead B (row owner of" in h[:80])
        asks = "question for the tech lead" in b.lower() or "lead b" in b.lower()
        new.append(i)
        if not mine and asks:
            print(f"#{pr['number']} [{pr['title'][:60]}] comment {i}: {b[:160].replace(chr(10), ' ')}")
if new:
    with open(SEEN, "a") as f:
        f.write("\n".join(new) + "\n")
