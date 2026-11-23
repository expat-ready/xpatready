#!/bin/bash
# ENF-771 (P-771, founder 21 Nov 01:0x IST: "we should not blindly assume resources on machines, because there are many
# incidences when agent assumes that and then he's mostly wrong. So it should always challenge ... double checking, triple
# checking"). In every copy (Lead, builders, qa), a turn may not end blaming machines, runners, capacity or resources unless
# the same message carries a measured number for it (a wait in seconds or minutes, a count of queued runs or jobs, a run id,
# free GB, a plan %). 21 Nov 00:17 IST: Lead 6 named "merge queue and machines" the constraint; the batch's jobs had waited 3-4 s.
# Run by stop-check.sh part (5) on the Stop hook's JSON; prints {decision:"block",reason} or nothing.
#   bash product/tools/resource-claim-guard.sh < hook.json      (Stop hook part)
#   bash product/tools/resource-claim-guard.sh --text < msg.txt (one "claim: <sentence>" line per unmeasured claim)
judge() {
  python3 -I -c '
import re, sys
text = sys.stdin.read(); I = re.I
# CI resources only (review 1: bare capacity, memory, resources and disk are product and code words in builder turns).
RES = r"(machines?|runners?|job slots?|(ci|github|actions|build) (capacity|minutes|compute|machines?|runners?))"
CLAIM = re.compile(
  r"\b(not enough|too few|short (of|on)|shortage of|lack of|out of|no (free |spare )?)\s*(github |self-hosted |the |free |spare )?" + RES +
  r"|\b" + RES + r"\b[^.\n]{0,30}\b(is|are|were|was)\b[^.\n]{0,15}\b(the )?(constraint|bottleneck|short|limited|exhausted|busy|full|saturated|scarce)\b"
  r"|\b(constraint|bottleneck)\b[^.\n]{0,40}\b(is|are|was)\b[^.\n]{0,40}\b" + RES +
  r"|\bwait(ing|s|ed)? (for|on) (a |free |spare )?(machine|runner)s?\b|\b(machine|runner) (wait|queue|shortage|limit)s?\b", I)
# A denial of the claim itself, not any "not" in the sentence (review 1).
NEG = re.compile(r"\b(is|are|was|were)(n\x27t|n’t| not)\b[^.\n]{0,25}\b(the )?(constraint|bottleneck|short|problem|limited|busy)\b"
  r"|\bnot (the )?(constraint|bottleneck|problem)\b|\bno shortage\b|\bnever (short|the constraint)\b"
  r"|\bnot (the |our )?" + RES + r"\b|\b" + RES + r" (is|are|were|was) (fine|idle|free)\b", I)   # review: "X, not runners" / "runners are fine" deny it
# A measured number in the claim sentence or the one next to it (review 1: a number anywhere was too loose).
EVID = re.compile(r"\b\d+(\.\d+)?(-\d+)? ?(s|sec|secs|seconds|min|mins|minutes)\b|\b\d+ (runs?|jobs?) (waiting|queued|in queue)\b"
  r"|\brun (id )?\d{8,}|\bbatch \d{8,}|\b\d+(\.\d+)? ?GB\b|runs-waiting|get_usage|df -h", I)
sents = [x.strip(" *-|>") for x in re.split(r"(?<=[.!?])\s+|\n+", text)]
for i, s in enumerate(sents):
    if s and CLAIM.search(s) and not NEG.search(s) and not EVID.search(" ".join(sents[max(0, i - 1):i + 2])):
        print("claim: " + re.sub(r"\s+", " ", s)[:140])
'; }
[ "${1:-}" = --text ] && { judge; exit 0; }
input=$(cat)
msg=$(printf '%s' "$input" | jq -r '.last_assistant_message // empty' 2>/dev/null)
if [ -z "$msg" ]; then
  tp=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
  [ -r "$tp" ] && msg=$(tail -n 200 "$tp" | jq -rs '[.[]|select(.type=="assistant")|.message.content[]?|select(.type=="text")|.text]|last // empty' 2>/dev/null)
fi
[ -n "$msg" ] || exit 0
hits=$(printf '%s' "$msg" | judge)
[ -n "$hits" ] || exit 0
reason="P-771 (ENF-771): this message blames machines, runners or capacity with no measured number: ${hits//$'\n'/ | }. Measure before you claim it: tools/runs-waiting.py (runs waiting for a machine), the last batch's job created→started seconds (actions/runs/<id>/jobs), df -h, get_usage. Quote the number and its run id, or drop the claim. A machine shortage is rare here (Enterprise Cloud, 500 jobs); prove it twice before you say it."
jq -nc --arg r "$reason" '{decision:"block",reason:$r}'
