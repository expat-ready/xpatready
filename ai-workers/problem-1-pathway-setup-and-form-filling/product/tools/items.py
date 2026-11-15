#!/usr/bin/env python3
"""One "needs Lead" queue with acknowledgement and timeout (P-611 (2), row G-1; founder, 15 Nov: a lane's "ready for Lead"
comment sat unseen 1.5 h across a hand-over). The queue is product/state/items.json (schema: items.schema.json beside it).
Lanes report with a comment whose FIRST line is   LANE-REPORT: <ready|blocked|question|approval> <item-id>
(optional later lines "owner: <role>", "branch: <name>", "next: <step>"). lead-queue.sh feeds those comments to `ingest`.

  items.py add <id> <kind> [--owner O] [--branch B] [--pr N] [--waiting-on W] [--next S]
  items.py ack <id> --by WHO          the Lead has seen it; clears ACT and FOUNDER lines until the next report on that id
  items.py done <id> [--by WHO]
  items.py list [--open] [--stale MIN]  --stale: open, un-acked, older than MIN minutes (default 45)
  items.py ingest [--since ISO]       stdin: JSON [{pr, branch, author, created_at, body, id}] (PR comments)
  items.py watch [--act 45] [--founder 90]   ACT for open un-acked items over 45 min, FOUNDER over 90; exit = ACT count
  items.py blocking                  open un-acked items, one per line; exit 1 when any (handover.sh, row G-2, refuses on them)

Env: ITEMS_FILE (default ../state/items.json from this file), ITEMS_NOW (ISO time, tests only). Stdlib only, US$0.
Test: check-items.sh."""
import json, os, re, sys, tempfile
from datetime import datetime, timezone

KINDS = ("ready", "blocked", "question", "approval")
NEXT = {"ready": "merge, test, publish", "blocked": "unblock it", "question": "answer it", "approval": "approve or refuse"}
LOOSE = re.compile(r"^\s*LANE-REPORT\b", re.I)
REPORT = re.compile(r"^\s*LANE-REPORT:\s+(ready|blocked|question|approval)\s+([A-Za-z0-9][A-Za-z0-9._/-]*)\s*$")
FILE = os.environ.get("ITEMS_FILE") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "state", "items.json")


def die(msg, code=2):
    sys.stderr.write("items: " + msg + "\n"); sys.exit(code)


def parse_time(s):
    m = re.match(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?(Z|[+-]\d\d:?\d\d)$", (s or "").strip())
    if not m: raise ValueError("bad time: %r" % s)
    return datetime.strptime(m.group(1) + m.group(2).replace("Z", "+0000").replace(":", ""), "%Y-%m-%dT%H:%M:%S%z")


def now():
    return parse_time(os.environ["ITEMS_NOW"]) if os.environ.get("ITEMS_NOW") else datetime.now(timezone.utc).replace(microsecond=0)


def iso(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load():
    if not os.path.exists(FILE): return []
    with open(FILE) as f: data = json.load(f)
    if not isinstance(data, list): die(FILE + " is not a JSON array")
    return data


def save(items):
    d = os.path.dirname(os.path.abspath(FILE)); os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".items.")
    with os.fdopen(fd, "w") as f: json.dump(items, f, indent=2); f.write("\n")
    os.replace(tmp, FILE)   # atomic: a check never reads a half-written queue


def find(items, iid):
    return next((i for i in items if i["id"] == iid), None)


def flags(args, names):
    out, pos, i = {}, [], 0
    while i < len(args):
        a = args[i]
        if a.startswith("--") and a[2:] in names:
            if i + 1 >= len(args): die("--%s needs a value" % a[2:])
            out[a[2:]] = args[i + 1]; i += 2
        elif a.startswith("--"): die("unknown flag " + a)
        else: pos.append(a); i += 1
    return out, pos


def new_item(iid, kind, t, owner="", branch="", pr=None, waiting_on="Lead", next_step="", source=""):
    if kind not in KINDS: die("kind must be one of " + "|".join(KINDS))
    return {"id": iid, "kind": kind, "owner": owner, "branch": branch, "pr": pr, "status": "open", "waiting_on": waiting_on,
            "next_step": next_step or NEXT[kind], "created_at": iso(t), "updated_at": iso(t), "last_ack_by": None,
            "acked_at": None, "opened_at": iso(t), "source": source}


def reopen(it, kind, t, source, **kv):
    """A new report on a known id (question, then ready): it needs the Lead again, so the ack is cleared. While the item
    is still open the clock keeps running from opened_at: a lane re-posting never resets the 45/90-min timeouts."""
    if it["status"] != "open": it["opened_at"] = iso(t)
    it.update(kind=kind, status="open", updated_at=iso(t), last_ack_by=None, acked_at=None, source=source,
              next_step=kv.get("next_step") or NEXT[kind])
    for k in ("owner", "branch", "pr"):
        if kv.get(k): it[k] = kv[k]


def age_min(it, t):
    return int((t - parse_time(it.get("opened_at") or it["updated_at"])).total_seconds() // 60)


def unacked(it):
    return it["status"] == "open"


def line(it, t):
    pr = " #%s" % it["pr"] if it.get("pr") else ""
    br = " %s" % it["branch"] if it.get("branch") else ""
    return "%s %s%s%s (owner %s, waiting on %s, %d min): %s" % (
        it["kind"], it["id"], pr, br, it.get("owner") or "?", it.get("waiting_on") or "?", age_min(it, t), it["next_step"])


def cmd_add(args):
    f, pos = flags(args, ("owner", "branch", "pr", "waiting-on", "next"))
    if len(pos) != 2: die("usage: add <id> <kind> [--owner O] [--branch B] [--pr N] [--waiting-on W] [--next S]")
    items, t = load(), now()
    pr = int(f["pr"]) if f.get("pr") else None
    it = find(items, pos[0])
    if it: reopen(it, pos[1] if pos[1] in KINDS else die("bad kind"), t, "manual", owner=f.get("owner"), branch=f.get("branch"),
                  pr=pr, next_step=f.get("next"))
    else: items.append(new_item(pos[0], pos[1], t, f.get("owner", ""), f.get("branch", ""), pr, f.get("waiting-on", "Lead"),
                                f.get("next", ""), "manual"))
    save(items); print("added  " + line(find(items, pos[0]), t))


def cmd_ack(args):
    f, pos = flags(args, ("by",))
    if len(pos) != 1 or not f.get("by"): die("usage: ack <id> --by WHO")
    items, t = load(), now(); it = find(items, pos[0]) or die("no item " + pos[0], 1)
    if it["status"] == "done": die(pos[0] + " is done already", 1)
    it.update(status="acked", last_ack_by=f["by"], acked_at=iso(t)); save(items); print("acked  %s by %s" % (pos[0], f["by"]))


def cmd_done(args):
    f, pos = flags(args, ("by",))
    if len(pos) != 1: die("usage: done <id> [--by WHO]")
    items, t = load(), now(); it = find(items, pos[0]) or die("no item " + pos[0], 1)
    it.update(status="done", updated_at=iso(t))
    if f.get("by"): it.update(last_ack_by=f["by"], acked_at=it.get("acked_at") or iso(t))
    save(items); print("done   " + pos[0])


def cmd_list(args):
    if "--stale" in args:
        i = args.index("--stale")
        mins = int(args[i + 1]) if i + 1 < len(args) and args[i + 1].isdigit() else 45
    else: mins = None
    items, t = load(), now()
    for it in items:
        if mins is not None and not (unacked(it) and age_min(it, t) > mins): continue
        if "--open" in args and it["status"] == "done": continue
        print("%-6s %s" % (it["status"], line(it, t)))


def cmd_ingest(args):
    f, _ = flags(args, ("since",))
    since = parse_time(f["since"]) if f.get("since") else None
    comments = json.load(sys.stdin)
    items, added, reopened, updated = load(), 0, 0, 0
    for c in sorted(comments, key=lambda c: c.get("created_at") or ""):
        body = (c.get("body") or "").replace("\r", "")
        first = body.split("\n", 1)[0]
        m = REPORT.match(first)
        if not m:
            if LOOSE.match(first): print("warn  #%s: malformed report line, not queued (want LANE-REPORT: <%s> <item-id>): %s"
                                         % (c.get("pr"), "|".join(KINDS), first.strip()[:100]))
            continue
        try: t = parse_time(c.get("created_at"))
        except ValueError: print("warn  #%s: report with unreadable time %r, not queued" % (c.get("pr"), c.get("created_at"))); continue
        if since and t < since: continue
        kind, iid = m.group(1), m.group(2)
        extra = dict(re.findall(r"(?mi)^(owner|branch|next):\s*(\S.*?)\s*$", body))
        extra = {k.lower(): v for k, v in extra.items()}
        source = str(c.get("id") or "%s@%s" % (c.get("pr"), c["created_at"]))
        source = re.sub(r"^https?://[^/]+/[^/]+/[^/]+/", "", source)  # no account name in records (AGENTS rule 5, push guard)
        it = find(items, iid)
        if it and (it.get("source") == source or parse_time(it["updated_at"]) >= t): continue  # seen, or older than the item
        # owner is a role, never the GitHub login (AGENTS rule 5)
        kv = dict(owner=extra.get("owner") or "lane", branch=extra.get("branch") or c.get("branch") or "",
                  pr=c.get("pr"), next_step=extra.get("next", ""))
        if it:
            if it["status"] == "open": updated += 1
            else: reopened += 1
            reopen(it, kind, t, source, **kv)
        else: items.append(new_item(iid, kind, t, kv["owner"], kv["branch"], kv["pr"], "Lead", kv["next_step"], source)); added += 1
    if added or reopened or updated: save(items)
    print("ingest %d new, %d reopened, %d updated while open" % (added, reopened, updated))


def cmd_watch(args):
    f, _ = flags(args, ("act", "founder"))
    act_m, fou_m = int(f.get("act", 45)), int(f.get("founder", 90))
    items, t, n = load(), now(), 0
    for it in items:
        if not unacked(it): continue
        a = age_min(it, t)
        if a > act_m:
            n += 1; print("ACT   needs Lead, not acked over %d min: %s; then: items.py ack %s --by <Lead N>" % (act_m, line(it, t), it["id"]))
        if a > fou_m:
            print("FOUNDER  %s %s has waited %d min un-acknowledged (P-611 (2)); tell the founder" % (it["kind"], it["id"], a))
    sys.exit(min(n, 125))


def cmd_blocking(args):
    items, t = load(), now(); bad = [it for it in items if unacked(it)]
    for it in bad: print("open   " + line(it, t))
    sys.exit(1 if bad else 0)


def main():
    if len(sys.argv) < 2: die(__doc__.split("\n\n")[1])
    cmds = dict(add=cmd_add, ack=cmd_ack, done=cmd_done, list=cmd_list, ingest=cmd_ingest, watch=cmd_watch, blocking=cmd_blocking)
    (cmds.get(sys.argv[1]) or (lambda a: die("unknown command " + sys.argv[1])))(sys.argv[2:])


if __name__ == "__main__":
    main()
