#!/usr/bin/env python3
"""Full run on ask (OS-06, design/os-backlog.md; P-439, P-731, P-293b). A lane that needs the full run on its PR's head
often asks the Lead in a "Question for the tech lead" instead of typing comment-run.yml's "/run full", and waits for a Lead
turn. This reads the comments lead-watch.sh already fetched (step 3) and, for each one on an open PR that is a question for
the tech lead AND asks for the full run, posts "/run full" on that PR once: comment-run.yml (main's copy) then checks the
head, starts the run and replies, or replies why not. It never labels, merges or cancels anything (P-371).
  asks       a line of its own starts "Question for the tech lead" (after "#", "*", "_", a list mark or spaces; never ">",
             a quote is a reply), and that question's paragraph asks to start it: an ask verb (start, dispatch, trigger,
             kick off, launch, run, rerun) before "full run", or "/run full"; with no word of a result, need or negation
             (failed, green, passed, flaky, need, not, no, already, why ...): those are questions about a run, for the Lead.
             Code blocks, inline code marks and HTML comments are read as text or dropped as written.
  once       <state>/full-run-ask.json keeps the asks answered in the last 14 days (PR number + the comment's id, or a hash
             of its text when no id is given); an unreadable memory is rebuilt empty and said.
  open only  a PR not in the open-PR list (prs-body.json from lead-watch) is skipped; an unreadable list skips every PR
             and says so (never a post to a closed PR).
--post makes the comment through gh (the Lead's copy, whose account comment-run accepts); without it the line is an ACT
with the words to type. A failed post is an ACT. Prints nothing when no comment asks. Exit 0 (a crash is not 0); lead-watch.sh counts the ACT lines. US$0.
  python3 -I product/tools/full-run-ask.py --comments FILE --prs FILE --state DIR [--post]
Comments FILE: one JSON object per line, {"n": "<PR number>", "b": "<body>"} (lead-watch's $cm). Test: check-full-run-ask.sh."""
import argparse, hashlib, json, os, re, shlex, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
HEAD = re.compile(r"^[ \t]*(?:[-*+]|\d+\.)?[ \t]*[#*_]*[ \t]*question for the tech lead(?![A-Za-z0-9-])[^\n]*(?:\n(?![ \t]*\n)[^\n]*)*", re.I | re.M)
FULL = r"(?:the |a |one )?(?:full[ -]run|full ci run|full set of suites)(?![\w-])"
ASK = re.compile(r"(?:\b(?:start|dispatch|trigger|kick off|launch|run|re-?run)\b[^.?!]{0,25}?" + FULL + r"|/run full(?![\w-]))", re.I)
NOT = re.compile(r"\b(?:failed|fails|failing|red|green|passed|passes|flak\w*|need(?:ed|s)?|not|no|never|without|skip|instead|enough|already"
                 r"|was|did|done|why|wait|yet|later|until|after|before|when|locally|myself|who|should i|should we|ok if|okay if)\b"
                 r"|\w+n['’]t\b|\b(?:dont|cant|wont|shouldnt|isnt|arent|didnt|doesnt)\b", re.I)
FENCE = re.compile(r"^\s*(```|~~~).*?^\s*\1", re.S | re.M)
INLINE = re.compile(r"`[^`\n]*`")
MAX = 10  # posts per check: a flood of asks is an ACT, not a flood of runs
KEEP = 14 * 86400  # memory entries older than this are dropped


def asks_full_run(body):
    """The question's own paragraph (the heading line and the lines after it up to a blank line) asks to start the full
    run: an ask verb before "full run", or "/run full"; and it says nothing of a result, a need or a negation (those are
    questions about a run, which the Lead answers: step 3's ACT). A quoted question (">") is a reply, never an ask."""
    text = FENCE.sub("", body or "")
    text = re.sub(r"<!--.*?(?:-->|\Z)", "", text, flags=re.S)
    text = INLINE.sub(lambda m: m.group(0).strip("`"), text)
    for m in HEAD.finditer(text):
        para = m.group(0)
        if ASK.search(para) and not NOT.search(para):
            return True
    return False


def key(n, cid, body):
    """The comment's id when lead-watch gives it (a re-ask in the same words is a new ask); else a hash of its text."""
    return f"{n}:id{cid}" if cid else f"{n}:{hashlib.sha256((body or '').encode()).hexdigest()[:16]}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--comments", required=True); ap.add_argument("--prs", required=True)
    ap.add_argument("--state", required=True); ap.add_argument("--post", action="store_true")
    a = ap.parse_args(); now = time.time()
    out, cand, bad = [], [], 0
    for line in open(a.comments, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            c = json.loads(line); n, b, cid = str(c["n"]), c.get("b") or "", str(c.get("id") or "")
        except Exception:
            bad += 1; continue
        if asks_full_run(b):
            cand.append((n, key(n, cid, b)))
    if bad:
        out.append(f"ACT   full-run ask: {bad} comment line(s) unreadable: an ask may be missed this check")
    if not cand:  # quiet when nobody asked
        if out:
            print("\n".join(out))
        return 0
    try:
        prs = json.load(open(a.prs))
        assert isinstance(prs, list) and prs
        open_ = {str(p["number"]) for p in prs}
    except Exception:
        out.append(f"ACT   full-run ask: {len(cand)} ask(s), but the open-PR list is unreadable or empty: none answered this check")
        print("\n".join(out)); return 0
    mem_path = os.path.join(a.state, "full-run-ask.json")
    try:
        done = json.load(open(mem_path)); assert isinstance(done, dict)
        done = {k: float(v) for k, v in done.items()}
    except FileNotFoundError:
        done = {}
    except Exception:
        done = {}; out.append("warn  full-run ask: memory unreadable, rebuilt empty (an ask may be answered twice)")
    asks = [(n, k) for n, k in cand if n in open_ and k not in done]
    def save():
        os.makedirs(a.state, exist_ok=True)
        with open(mem_path + ".tmp", "w") as f:
            json.dump({k: v for k, v in done.items() if now - v < KEEP}, f)
        os.replace(mem_path + ".tmp", mem_path)
    if a.post:
        try:
            save()   # a memory that cannot be written would post again every check: post nothing
        except Exception as e:
            a.post = False; out.append(f"ACT   full-run ask: memory cannot be written ({type(e).__name__}): nothing posted, the words to type below")
    seen, posted, tried = set(), set(), 0
    for n, k in asks:
        if n in seen:  # one "/run full" per PR per check; a later ask on it counts as answered only if the post went out
            if n in posted:
                done[k] = now
            continue
        seen.add(n)
        if tried >= MAX:
            out.append(f"ACT   full-run ask: more than {MAX} PRs asked this check; #{n} and later not answered: read them"); break
        tried += 1
        if not a.post:
            out.append(f"ACT   #{n} asks for the full run: type /run full on it (comment-run.yml)"); continue
        # gh api, not gh pr comment: tools/gh.sh's curl fallback (P-363, the Mac's TLS) answers api calls only
        gh = shlex.split(os.environ["FULL_RUN_ASK_GH"]) if os.environ.get("FULL_RUN_ASK_GH") else ["bash", os.path.join(HERE, "gh.sh")]
        try:
            r = subprocess.run(gh + ["api", "-X", "POST", f"repos/{{owner}}/{{repo}}/issues/{n}/comments", "-f", "body=/run full"],
                               capture_output=True, text=True, timeout=60)
            rc, why = r.returncode, (r.stderr or r.stdout).strip()[:100]
        except subprocess.TimeoutExpired:
            rc, why = "timeout", "no answer in 60 s"
        except OSError as e:
            rc, why = 1, f"{type(e).__name__}"
        if rc not in (0, "timeout"):
            out.append(f"ACT   #{n} asks for the full run; posting /run full failed ({why}): type it")
            continue
        posted.add(n); done[k] = now   # a timed-out post may have landed: remembered, never posted twice
        try:
            save()
        except Exception as e:
            a.post = False; out.append(f"ACT   full-run ask: memory not written after the post on #{n} ({type(e).__name__}): nothing more posted this check")
        if rc == "timeout":
            out.append(f"ACT   #{n} asks for the full run; the /run full post got no answer in 60 s and may have landed: look at the PR (not posted again)"); continue
        out.append(f"full-run ask: #{n} asked for the full run; /run full posted (comment-run.yml starts it and replies)")
    if a.post and posted:
        try:
            save()   # the later asks on a PR already answered this check
        except Exception as e:
            out.append(f"ACT   full-run ask: memory not written ({type(e).__name__}): an ask may be answered again")
    out.append(f"full-run ask: {len(asks)} new ask(s) on open PRs")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
