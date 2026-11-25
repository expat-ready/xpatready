#!/usr/bin/env python3
"""Wake on merge (founder 24 Nov, through Lead 25; design/wake-on-merge-design-2026-11-24.md, option A): an open pull request
that waits for others is an ACT in the Lead's check as soon as all of them are on main, with the words to type in its lane.
Without --post it types, posts and starts nothing. With --post (OS-49, design/os-backlog.md; lead-watch 4b in the Lead's copy)
the wake is a comment on the waiting PR, once per PR and set of waits: a cloud lane is subscribed to its own PR, so the
comment wakes it with no Lead turn. Posted is an info line; still not taken 60 min after the post is an ACT again; a failed
post is the ACT with the words to type. Memory: <state>/merge-wake.json ({"<pr>:<waits>": epoch posted}).
  Waits    a line of its own in the PR's body, "Waits on: #12" or "Stacked on: #12, #13" (nothing else on the line but
           numbers; not in a code block, HTML comment or quote). Prose is not read; a wait line that cannot be read is an ACT.
  Wake     every number merged on main ("Merge pull request #n"), and the PR's branch does not hold those merges yet. It stays
           an ACT until it does, or the PR closes. An approved or queued PR is an info line: nothing is to be typed.
  Broken   a number that is neither open nor merged (closed, or no pull request) is an ACT of its own.
The lane is the app view's line that names the PR or its branch; not found is said. Reads git, the open PRs step 2b saved
and the saved app view; no network, US$0. What cannot be read is an ACT. Exit 0. Test: check-merge-wake.sh.
   python3 -I product/tools/merge-wake.py --prs prs-body.json [--app-view FILE] [--repo DIR] [--ref origin/main] [--now EPOCH]
                                          [--post --state DIR]"""
import argparse, json, os, re, shlex, subprocess, time
HERE = os.path.dirname(os.path.abspath(__file__))
MERGE = re.compile(r"^(\d+) ([0-9a-f]{40}) Merge pull request #(\d+) from ")
WAIT = re.compile(r"^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?(?:waits|stacked) on(?:\*\*)?[ \t]*:(?:\*\*)?([^\n]*)$", re.I)
AGAIN = 3600  # seconds after a post with no merge of main before the Lead is asked again
POSTS = 3     # wake comments per check at most; the rest stay ACT lines with the words to type
KEY = re.compile(r"^\d+:#\d+(?: #\d+)*$")


def save(path, mem):
    """Write the memory at once (after each post), so a later failure never makes a wake post twice."""
    with open(path + ".tmp", "w") as f:
        f.write(json.dumps(mem))
    os.replace(path + ".tmp", path)
ONE = re.compile(r"(?:expat-ready/xpatready)?#(\d{1,6})\.?|\[#(\d{1,6})\]\(\S{1,200}\)\.?"); LIMIT, MANY = 200, 12


def git(d, *a):
    r = subprocess.run(["git", "-C", d, *a], capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "git failed").splitlines()[0][:100])
    return r.stdout


def clean(s, n=80):
    """One printable line: no control, escape or direction characters, cut at n."""
    s = re.sub(r"[\x00-\x1f\x7f-\x9f\u200b-\u200f\u2028-\u202e\u2066-\u2069]+", " ", str(s)).strip()
    return s if len(s) <= n else s[:n - 1] + "…"


def waits(body):
    """(the pull requests a body waits on, how many of its wait lines cannot be read)."""
    out, bad, fence = [], 0, ""
    for l in re.sub(r"<!--.*?(?:-->|\Z)", "", (body or "").replace("\r", ""), flags=re.S).split("\n"):
        f = re.match(r"\s*(`{3,}|~{3,})", l)
        if fence:
            if f and f.group(1)[0] == fence[0] and len(f.group(1)) >= len(fence) and l.strip() == f.group(1):
                fence = ""
            continue
        if f and "`" not in l.strip().lstrip("`"):
            fence = f.group(1); continue
        m = WAIT.match(l) if len(l) <= 400 else None
        if not m:
            bad += len(l) > 400 and bool(WAIT.match(l[:60])); continue
        ws = [x for x in re.split(r"[\s,+]+", m.group(1).strip(" \t*")) if x and x != "and"]
        got = [ONE.fullmatch(x) for x in ws]
        if " ".join(ws).lower().rstrip(".") in ("none", "nothing", "main"):
            continue
        if ws and all(got) and len(ws) <= MANY:
            out += [int(g.group(1) or g.group(2)) for g in got]
        else:
            bad += 1
    return sorted(set(out)), bad


def ist(t):
    return time.strftime("%d %b %H:%M IST", time.gmtime(t + 19800))


def lane(view, n, branch):
    """The lane whose line names the branch; else the one that names the pull request; two or more are all named."""
    by = {"branch": [], "number": []}
    for l in view.splitlines():
        m = re.match(r"^(?:ok|FLAG) +(.*?) · (cloud|mac) · (.*)$", l)
        if not m:
            continue
        i = re.findall(r" · idle (\d+) min\b", l); x = f"{clean(m.group(1), 60)} ({m.group(2)}, " + (f"idle {i[-1]} min)" if i else "idle ?)")
        if re.search(rf"(?<![\w/-]){re.escape(branch)}(?![\w/-])", l):
            by["branch"].append(x)
        elif re.search(rf"(?:#|/pull/){n}\b", l):
            by["number"].append(x)
    got = by["branch"] or by["number"]
    return "lane not found in the app view" if not got else got[0] if len(got) == 1 else f"{len(got)} lanes name it, look first: " + " or ".join(got[:3])


def has_all(repo, branch, shas):
    """The branch holds every one of these merges (a commit after them that does not take main is no answer)."""
    return all(subprocess.run(["git", "-C", repo, "merge-base", "--is-ancestor", s, f"refs/remotes/origin/{branch}"], capture_output=True).returncode == 0 for s in shas)


def main():
    a = argparse.ArgumentParser(); a.add_argument("--prs", required=True); a.add_argument("--repo", default=os.path.join(HERE, "..", "..", "..", ".."))
    a.add_argument("--app-view", default=os.path.join(HERE, "..", "state", "app-view-latest.txt")); a.add_argument("--ref", default="origin/main"); a.add_argument("--now", type=float)
    a.add_argument("--post", action="store_true"); a.add_argument("--state")
    o = a.parse_args(); now = o.now or time.time()
    mem, mpath = {}, os.path.join(o.state, "merge-wake.json") if o.state else None
    if o.post and not mpath:
        raise RuntimeError("--post needs --state")
    if o.post:
        try:
            mem = json.load(open(mpath)); assert isinstance(mem, dict)
        except FileNotFoundError:
            mem = {}
        except Exception:
            mem = {}; print("wake  memory unreadable, rebuilt empty (a wake may be posted twice)")
        good = {k: v for k, v in mem.items() if KEY.match(str(k)) and isinstance(v, (int, float)) and not isinstance(v, bool)}
        if len(good) != len(mem):
            print(f"wake  memory: {len(mem) - len(good)} entr{'y' if len(mem) - len(good) == 1 else 'ies'} not of the form \"<pr>:#<n>\": <epoch> dropped")
        mem = good
        try:
            os.makedirs(o.state, exist_ok=True); save(mpath, mem)
        except Exception as e:   # a memory that cannot be written would post again every check: post nothing
            o.post = False; print(f"ACT   wake: memory {clean(mpath, 60)} cannot be written ({type(e).__name__}): no wake posted, the words to type below")
    prs = json.load(open(o.prs, encoding="utf-8"))
    if not isinstance(prs, list) or not prs:
        raise RuntimeError("no open pull request read")
    merged, shas = {}, {}
    for l in git(o.repo, "log", "--first-parent", "--merges", "--format=%ct %H %s", o.ref).splitlines():
        m = MERGE.match(l)
        if m:
            merged.setdefault(int(m.group(3)), int(m.group(1))); shas.setdefault(int(m.group(3)), m.group(2))
    if not merged:
        raise RuntimeError(f"no merged pull request on {o.ref}")
    view = open(o.app_view, encoding="utf-8").read() if os.path.exists(o.app_view) else ""
    if len(prs) >= LIMIT:
        print(f"ACT   wake: {len(prs)} open pull requests read, the list may be cut at {LIMIT}: a wait may be missed or called closed")
    if not view:
        print("wake  no app view in this copy: no lane can be named")
    up, n, wake, unread, posted = {p["number"] for p in prs}, 0, 0, [], 0
    for p in sorted(prs, key=lambda x: x["number"]):
        w, bad = waits(p.get("body")); w = [x for x in w if x != p["number"]]
        if bad or len(w) > MANY:
            unread.append(p["number"])
        if len(w) > MANY:      # over the cap in all: printed short, judged not at all
            continue
        if not w:
            continue
        n += 1
        lost = [x for x in w if x not in up and x not in merged]
        if lost:
            print(f"ACT   wake: #{p['number']} waits on {' '.join('#%d' % x for x in lost)}, neither open nor merged by a merge commit on main: {lane(view, p['number'], p['headRefName'])}: settle what it waits for")
        if lost or any(x not in merged for x in w):
            continue
        t = max(merged[x] for x in w)
        try:
            git(o.repo, "rev-parse", "--verify", "-q", f"refs/remotes/origin/{p['headRefName']}")
        except RuntimeError:
            print(f"ACT   wake: #{p['number']}: its branch {clean(p['headRefName'], 60)} is not in this copy, so whether it holds them is unknown"); continue
        ws = " ".join("#%d" % x for x in w)
        if has_all(o.repo, p["headRefName"], [shas[x] for x in w]):
            continue
        labels = {(x.get("name") if isinstance(x, dict) else x) for x in p.get("labels") or []}
        if labels & {"queued", "review: approved"}:
            print(f"wake  #{p['number']} waited on {ws}, all on main; it is approved or queued: nothing to type (a new commit would void its Approve)"); continue
        wake += 1; failed = ""
        if o.post:
            k, words = f"{p['number']}:{ws}", f"{ws} {'is' if len(w) == 1 else 'are'} on main: merge main once and go on with #{p['number']}"
            if k in mem:
                if now - mem[k] < AGAIN:
                    print(f"wake  #{p['number']}: woken by a PR comment {(now - mem[k]) / 60:.0f} min ago ({ws} on main); waiting for its lane to merge main"); continue
                print(f"ACT   wake: #{p['number']} was woken by a PR comment {(now - mem[k]) / 60:.0f} min ago and has not merged {ws} yet: {lane(view, p['number'], p['headRefName'])}. Type: \"{words}\""); continue
            if posted >= POSTS:
                failed = f" (not posted: {POSTS} wakes posted this check already)"
            else:
                # gh api, not gh pr comment: tools/gh.sh's curl fallback (P-363, the Mac's TLS) answers api calls only
                gh = shlex.split(os.environ["MERGE_WAKE_GH"]) if os.environ.get("MERGE_WAKE_GH") else ["bash", os.path.join(HERE, "gh.sh")]
                body = f"**Wake on merge (OS-49, lead-watch):** {words}. (Posted once by the tech lead's check; P-339b.)"
                posted += 1
                try:
                    r = subprocess.run(gh + ["api", "-X", "POST", f"repos/{{owner}}/{{repo}}/issues/{p['number']}/comments", "-f", f"body={body}"],
                                       capture_output=True, text=True, timeout=60)
                    rc, why = r.returncode, clean(r.stderr or r.stdout, 80)
                except subprocess.TimeoutExpired:
                    rc, why = "timeout", "no answer in 60 s"
                except OSError as e:
                    rc, why = 1, clean(f"{type(e).__name__}: {e}", 80)
                if rc == 0 or rc == "timeout":   # a timed-out post may have landed: remembered, never posted twice
                    mem[k] = now
                    try:
                        save(mpath, mem)
                    except Exception as e:
                        o.post = False; print(f"ACT   wake: memory not written after the post on #{p['number']} ({type(e).__name__}): no more wakes posted this check")
                    if rc == 0:
                        print(f"wake  #{p['number']}: {ws} on main since {ist(t)}; wake comment posted on the PR (its lane is woken by it)"); continue
                    print(f"ACT   wake: the wake post on #{p['number']} got {why}; it may have landed (look at the PR; not posted again): {words}"); continue
                failed = f" (posting the wake on #{p['number']} failed: {why})"
        print(f"ACT   wake{failed}: {ws} on main since {ist(t)} ({(now - t) / 60:.0f} min); #{p['number']} waited: {lane(view, p['number'], p['headRefName'])}. Type: \"{ws} {'is' if len(w) == 1 else 'are'} on main: merge main once and go on with #{p['number']}\"")
    if unread:
        print(f"ACT   wake: {len(unread)} pull request{'s' * (len(unread) > 1)} with a wait line that cannot be read (numbers only, at most {MANY}: \"Waits on: #12, #13\"): " + " ".join("#%d" % x for x in unread[:10]))
    if o.post:
        mem = {k: v for k, v in mem.items() if int(k.split(":")[0]) in up}   # closed PRs leave the memory
        try:
            save(mpath, mem)
        except Exception as e:
            print(f"ACT   wake: memory not pruned ({type(e).__name__})")
    print(f"wake  {n} of {len(prs)} open pull requests say what they wait on, {wake} may go on; {sum(1 for t in merged.values() if now - t < 3600)} merges in the last hour")


try:
    main()
except Exception as e:   # said, never a silent pass
    print(f"ACT   wake: not read ({type(e).__name__}: {str(e)[:120]})")
