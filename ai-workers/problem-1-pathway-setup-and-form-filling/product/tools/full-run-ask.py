#!/usr/bin/env python3
"""Full run on ask (OS-06, design/os-backlog.md; P-439, P-731, P-293b). A lane that needs the full run on its PR's head
often asks the Lead in a "Question for the tech lead" instead of typing comment-run.yml's "/run full", and waits for a Lead
turn. This reads the comments lead-watch.sh already fetched (step 3) and, for each one on an open PR that is a question for
the tech lead AND asks for the full run, posts "/run full" on that PR once: comment-run.yml (main's copy) then checks the
head, starts the run and replies, or replies why not. It never labels, merges or cancels anything (P-371).
  asks       a line of its own starts "Question for the tech lead" (any "#", "*", ">" or spaces before it, any case), and
             the comment names the full run: "full run", "full-run", "/run full" or "run the full ...", outside a code block.
  once       <state>/full-run-ask.json keeps the asks already answered (PR number + a hash of the comment's text); an
             unreadable memory is rebuilt empty and said, so an ask may be answered twice, never dropped.
  open only  a PR not in the open-PR list (prs-body.json from lead-watch) is skipped; an unreadable list skips every PR
             and says so (never a post to a closed PR).
--post makes the comment through gh (the Lead's copy, whose account comment-run accepts); without it the line is an ACT
with the words to type. A failed post is an ACT. Prints nothing when no comment asks. Exit 0 (a crash is not 0); lead-watch.sh counts the ACT lines. US$0.
  python3 -I product/tools/full-run-ask.py --comments FILE --prs FILE --state DIR [--post]
Comments FILE: one JSON object per line, {"n": "<PR number>", "b": "<body>"} (lead-watch's $cm). Test: check-full-run-ask.sh."""
import argparse, hashlib, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
HEAD = re.compile(r"^[\s#*>_]*question for the tech lead\b", re.I | re.M)
ASK = re.compile(r"full[ -]run|/run full\b|\brun the full\b", re.I)
FENCE = re.compile(r"^\s*(```|~~~).*?^\s*\1", re.S | re.M)
INLINE = re.compile(r"`[^`\n]*`")
MAX = 10  # posts per check: a flood of asks is an ACT, not a flood of runs


def asks_full_run(body):
    text = FENCE.sub("", body or "")
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    if not HEAD.search(text):
        return False
    return bool(ASK.search(INLINE.sub(lambda m: m.group(0).strip("`"), text)))


def key(n, body):
    return f"{n}:{hashlib.sha256((body or '').encode()).hexdigest()[:16]}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--comments", required=True); ap.add_argument("--prs", required=True)
    ap.add_argument("--state", required=True); ap.add_argument("--post", action="store_true")
    a = ap.parse_args()
    out, cand, bad = [], [], 0
    for line in open(a.comments, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            c = json.loads(line); n, b = str(c["n"]), c.get("b") or ""
        except Exception:
            bad += 1; continue
        if asks_full_run(b):
            cand.append((n, key(n, b)))
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
        done = set(json.load(open(mem_path)))
    except FileNotFoundError:
        done = set()
    except Exception:
        done = set(); out.append("warn  full-run ask: memory unreadable, rebuilt empty (an ask may be answered twice)")
    asks = [(n, k) for n, k in cand if n in open_ and k not in done]
    seen, posted, tried = set(), set(), 0
    for n, k in asks:
        if n in seen:  # one "/run full" per PR per check; a later ask on it counts as answered only if the post went out
            if n in posted:
                done.add(k)
            continue
        seen.add(n)
        if tried >= MAX:
            out.append(f"ACT   full-run ask: more than {MAX} PRs asked this check; #{n} and later not answered: read them"); break
        tried += 1
        if not a.post:
            out.append(f"ACT   #{n} asks for the full run: type /run full on it (comment-run.yml)"); continue
        gh = os.environ.get("FULL_RUN_ASK_GH") or f"bash {HERE}/gh.sh"
        r = subprocess.run(gh.split() + ["pr", "comment", n, "--body", "/run full"], capture_output=True, text=True, timeout=60)
        if r.returncode:
            out.append(f"ACT   #{n} asks for the full run; posting /run full failed ({(r.stderr or r.stdout).strip()[:100]}): type it")
            continue
        posted.add(n); done.add(k)
        out.append(f"full-run ask: #{n} asked for the full run; /run full posted (comment-run.yml starts it and replies)")
    if a.post:
        try:
            os.makedirs(a.state, exist_ok=True)
            with open(mem_path + ".tmp", "w") as f:
                json.dump(sorted(done), f)
            os.replace(mem_path + ".tmp", mem_path)
        except Exception as e:
            out.append(f"ACT   full-run ask: memory not written ({e}): the same ask may be answered again")
    out.append(f"full-run ask: {len(asks)} new ask(s) on open PRs")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
