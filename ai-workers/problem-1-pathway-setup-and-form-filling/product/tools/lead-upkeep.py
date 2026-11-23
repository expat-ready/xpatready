#!/usr/bin/env python3
"""The Lead's own upkeep at every check: lead-watch.sh steps 1c (E12) and 6b (E13). Founder 21 Nov (P-772): every
valuable rule in code.

  context --state STATE.md
      E12, P-446 (1): "hand over at the first check after 200k tokens of context beyond the Lead's own start read";
      at ~150k beyond it the first standby reads RULES+STATE once. The context is read the way the lead-watch skill reads
      it: from get_usage, which only the Lead's tools can call, so the Lead passes it in LEAD_CONTEXT (tokens, "312k" or
      "312000"). The start read is LEAD_START_READ, else the "start read ~NNNk" a Lead writes on STATE's current_lead:
      line, else P-446's own figure (~90k: "about 290k total"), said as assumed. No LEAD_CONTEXT = an ACT, never a pass.
  sync [--cmd "bash tools/private-sync.sh"] [--timeout 90]
      E13, P-678: "the Lead runs the sync at each check". Runs private-sync.sh in its own process group, killed whole after the limit; exit 3 (a file looks like a real
      secret) or any other failure or a timeout is an ACT; "nothing new" or "pushed" is one line. PRIVATE_SYNC=0 skips it
      with a line saying so (tests, a copy with no private home).
Exit 0 always; lead-watch counts the ACT lines. Test: check-lead-upkeep.sh.
"""
import argparse, os, re, shlex, signal, subprocess, sys

HAND_K, WARN_K, DEFAULT_START_K = 200, 150, 90


def kilo(v):
    m = re.fullmatch(r"\s*~?(\d+(?:\.\d+)?)\s*([kK])?\s*(tokens)?\s*", v or "")
    if not m:
        return None
    n = float(m.group(1))
    if m.group(2):
        return n                                       # "312k"
    return n / 1000 if m.group(3) or n >= 1000 else n  # "300 tokens", "312000" (tokens); a bare "312" is k


def context(a):
    raw = os.environ.get("LEAD_CONTEXT", "")
    now = kilo(raw)
    if now is None:
        why = "not given" if not raw.strip() else f"unreadable ({raw[:20]!r})"
        print(f"ACT   Lead context {why}: read it with get_usage and run LEAD_CONTEXT=<k> bash product/tools/lead-watch.sh "
              "(P-446: hand over at 200k beyond the start read)")
        return
    rs = os.environ.get("LEAD_START_READ", "")
    start, src = kilo(rs), "LEAD_START_READ"
    if start is None and rs.strip():
        print(f"ACT   LEAD_START_READ unreadable ({rs[:20]!r}): give it in k, e.g. LEAD_START_READ=95k (P-446)")
        return
    if start is None:
        try:
            line = next((l for l in open(a.state, encoding="utf-8") if l.startswith("current_lead:")), "")
        except (OSError, ValueError):   # ValueError: not UTF-8
            line = ""
        m = re.search(r"start read\s*~?\s*(\d+(?:\.\d+)?\s*k?)", line, re.I)
        start, src = (kilo(m.group(1)), "STATE current_lead:") if m else (DEFAULT_START_K, "assumed, P-446's ~90k; write 'start read ~NNNk' on current_lead:")
    beyond = now - start
    if beyond < 0:   # a typo would otherwise switch the P-446 hand-over off without a word
        print(f"ACT   Lead context {now:.0f}k is under its start read {start:.0f}k ({src}): one of them is wrong; fix it (P-446)")
        return
    print(f"lead  context {now:.0f}k · start read {start:.0f}k ({src}) · {beyond:.0f}k beyond it (hand over at {HAND_K}k, P-446)")
    if beyond >= HAND_K:
        print(f"ACT   Lead context {beyond:.0f}k beyond the start read (over {HAND_K}k): refresh RULES.md, then hand over to the "
              "first standby now (P-446, P-286; lead skill, hand-over)")
    elif beyond >= WARN_K:
        print(f"ACT   Lead context {beyond:.0f}k beyond the start read (over {WARN_K}k): tell the first standby to read RULES+STATE "
              "once, so the hand-over gap is minutes (P-446)")


def sync(a):
    if os.environ.get("PRIVATE_SYNC") == "0":
        print("private sync skipped (PRIVATE_SYNC=0)")
        return
    # Lead 9 (21 Nov, #2605): a copy without the side-notes folder (a cloud copy) skips quietly; an ACT only where the
    # folder exists and the sync fails.
    if not os.path.lexists(a.notes):   # absent only; a file or a dangling link in its place runs the sync, which refuses
        print("private sync skipped: no side-notes folder in this copy (P-678)")
        return
    # Own process group, no stdin, no git credential prompt: on a timeout the whole group (git, rsync) is killed, so
    # nothing keeps running into the next check (reviewer Major, 21 Nov).
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "true", "SSH_ASKPASS": "true"}
    try:
        p = subprocess.Popen(shlex.split(a.cmd), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, env=env, start_new_session=True)
    except OSError as e:
        print(f"ACT   private sync could not start ({e.strerror}): run tools/private-sync.sh by hand (P-678)")
        return
    try:
        out, errs = p.communicate(timeout=a.timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except OSError:
            pass
        p.communicate()
        print(f"ACT   private sync did not finish in {a.timeout} s (stopped, with its git and rsync): run tools/private-sync.sh by hand and read its output (P-678)")
        return
    last = ((out or "").strip().splitlines() or [""])[-1]
    err = " ".join((errs or "").split())[:160]
    if p.returncode == 0:
        print(f"private sync {last.removeprefix('private-sync: ') or 'ran'} (P-678)")
    elif p.returncode == 3 and "refused" in err:   # rsync's own exit 3 is a failure, not a secret
        print(f"ACT   private sync refused: a note looks like it holds a real secret; remove it from the side notes, then rerun (P-678): {err}")
    else:
        print(f"ACT   private sync failed (exit {p.returncode}): {err or last or 'no output'}; fix and rerun tools/private-sync.sh (P-678)")


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    p = argparse.ArgumentParser()
    s = p.add_subparsers(dest="cmd_name", required=True)
    c = s.add_parser("context"); c.add_argument("--state", required=True)
    y = s.add_parser("sync"); y.add_argument("--cmd", default="bash " + shlex.quote(os.path.join(here, "private-sync.sh"))); y.add_argument("--timeout", type=int, default=90)
    y.add_argument("--notes", default=os.environ.get("PRIVATE_NOTES_DIR") or os.path.expanduser("~/Library/Application Support/Claude/side-session-notes"))
    a = p.parse_args()
    try:
        (context if a.cmd_name == "context" else sync)(a)
    except Exception as e:   # never a traceback with no ACT: lead-watch counts ACT lines only
        print(f"ACT   lead-upkeep {a.cmd_name} crashed ({type(e).__name__}: {str(e)[:80]}): nothing was checked")


if __name__ == "__main__":
    main()
