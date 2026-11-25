#!/bin/bash
# ENF-763 (founder 20 Nov: "Everything has to be done by the agent, either using API or built-in browser ... Is this rule
# not enforced yet?"; P-752, P-758 (3), P-762, P-763). In the Lead's copy only (lane.sh whoami = lead), a turn may not
# end on a message asking the founder to do a step on github.com, claude.ai or a cloud console (click, Convert to draft,
# add the label, Ready for review, reopen, close, archive, merge, press, dispatch, Run workflow: ENF-778a E-c, P-778;
# "open #NNNN ... and", in the console) unless the same message names a step only
# the founder can do: sign-in, password, 2FA or one-time code, payment, a new account or key (P-551), a permission
# widening (P-387). Run by stop-check.sh part (4) on the Stop hook's JSON; prints {decision:"block",reason} or nothing.
#   bash product/tools/founder-click-guard.sh < hook.json          (Stop hook part)
#   bash product/tools/founder-click-guard.sh --text < message.txt (the verdict on one message: "ask: <sentence>" lines)
#   bash product/tools/founder-click-guard.sh --state STATE.md     (lead-watch: asks to the founder that are clicks)
DIR="$(cd "$(dirname "$0")" && pwd)"
judge() {  # $1 mode (text|state) on stdin → one "ask: ..." line per founder click, none when the message is fine
  python3 -I -c '
import re, sys
mode, text = sys.argv[1], sys.stdin.read()
I = re.I
# A step on github.com, claude.ai or a cloud console.
ASK = re.compile(r"\bclick(s|ing)?\b|\bconvert(ing)?\b[^.\n]{0,30}\bto (a )?draft\b|\badd(ing)?\b[^.\n]{0,40}\blabel\b|\blabel (#\d+|it|this|that|the (pr|pull request|issue))\b"
  r"|\b(mark|set|make|move|press|hit|select)\b[^.\n]{0,30}\bready for review\b|\breopen(ing)?\b|\b(merge|approve)\b (the (pr|pull request)|#\d+)"
  r"|\bopen #\d+\b[^.\n]{0,60}\band (then )?(click|press|hit|add|convert|mark|reopen|merge|approve|label|select)\b|\bin the ([\w.-]+ ){0,3}console\b"
  r"|\b(press|hit) (the )?[\w ]{0,20}button\b|\bgo to (https?://)?(github\.com|claude\.ai)"
  # 21 Nov (founder: "whatever you are asking me to do, right, to add one line, please do yourself"): a link to open,
  # Edit on a description or title, or a line to add to a PR are clicks too (Lead 6 asked all three and passed).
  r"|\bopen (https?://)?(github\.com|claude\.ai)\S*[^.\n]{0,60}\b(press|click|hit|add|edit|type|convert|mark|reopen|merge|approve|label|select)\b|\b(press|click|hit|use|choose) (the )?edit\b"
  r"|\bedit (the |its |this )?(pr |pull request )?(description|body|title)\b"
  r"|\badd\b[^.\n]{0,40}\bline\b[^.\n]{0,40}(#\d+|\bdescription\b|\bbody\b|\bpr\b|pull request)"
  # ENF-778a E-c (P-778): "also matches close, archive, reopen, label, dispatch, Run workflow, merge and press"
  # The verb and its own object (review of #3665: a bare "press" or "dispatch" blocked "Press coverage is fine", "the
  # nightly dispatch result"; "merge conflicts on the branch" is no ask): the, this, its, up to two words, then the thing.
  r"|\b(close|closed|archive|archived|merge|merged|reopen|reopened)\s+((the|this|that|its|both|all)\s+(of the\s+)?)?((?!(of|on|in|at|for|to|from|with|by|after|before)\b)[\w#-]+\s+){0,4}(#\d+|prs?|pull requests?|issues?|sessions?|lanes?|branch(es)?|it|them)\b"
  r"|\b(dispatch|trigger)\s+((the|this|that|its)\s+)?((?!(of|on|in|at|for|to|with|after|before)\b)[\w#-]+\s+){0,3}(workflows?|runs?|nightly|jobs?|#\d+|it|by hand|from the actions)\b"
  r"|\b(dispatch|trigger)\s+[\w-]+(\.ya?ml)?\s+by hand\b|\brun (the |this )?workflow\b"
  r"|\bpress\s+((the|this|that|its)\s+)?([\w-]+\s+){0,2}(button|run workflow|merge|approve|edit|return|enter|ready|re-?run|#\d+)\b"
  + (r"|\b(close|merge|label|archive|dispatch) #\d+" if mode == "state" else ""), I)
# Addressed to the founder (a message): a request, or a sentence that starts with the step itself.
# Not an ask (review 2 of #3665): the Lead offering to do it, or telling the founder not to.
NOT_ASK = re.compile(r"(\b(would you like me to|do you want me to|want me to|shall i|should i)|\bi can(?!not\b)(?=\s))((\s+|,\s+then\s+)(?!(please|pls|could|so|but|otherwise|you|your|or|while|if|when)\b)[\w#][\w#-]*)*"  # an offer: to the end of its clause, whose verbs the Lead does
  r"|(\b(should|must|need|do|does)( not|n.t)\b(?!\s+(forget|hesitate)\b)|\bno need\b|\bnever\b(?!\s+(forget|hesitate)\b)|\bnothing (left )?for you( to do)?\b)(\s+(?!(please|pls|could|so|but|otherwise)\b)[\w#][\w#-]*){0,4}", I)  # a "not": with its own verbs, never past please or could; "do not forget to" stays an ask
YOU = re.compile(r"\bif you \w+ed\b|\byou can (?!see\b|now see\b|also see\b)\w|\b(please|pls|could you|can you|would you|will you|need you|want you|you (need|have|must|should)\b|for you to|"
  r"yourself|needs you|your (click|turn|side))", I)
IMP = re.compile(r"^\W*(\(?\w{1,2}[.)]\s*)?((recommend(ed)?)\s*:?\s*)?(at [\d:x]+( IST)?,?\s*)?"
  r"(then |and |just |now |otherwise,? |if not,? |first,? |kindly |go ahead and )?(click|open|add|press|convert|mark|reopen|go to|select|hit|tap|edit|close|archive|merge|dispatch|trigger|label"
  r"|run (the )?workflow(?! (was|is|ran|has)\b))\b", I)   # E-c verbs as a plain command too (review of #3665)
# Only the founder can: sign-in, password, 2FA/one-time code, payment, new account or key (P-551), permission widening (P-387).
ONLY = re.compile(r"sign(ed)?[- ]?(in|out)|log(ged)?[- ]?(in|out)|password|\b2fa\b|two[- ]factor|one[- ]time (code|password)|\botp\b|passkey"
  r"|verification code|payment|billing|credit card|\bnew (account|key|token)\b|create (a |an )?(new )?account|\b(api|access|secret|ssh) key"
  r"|personal access token|permission[- ]widen|widen(ing)? (the |a )?(permission|access)|grant(ing)? (the |a )?(permission|access)|P-551|P-387", I)
def asks(chunk, need_you):
    out = []
    for s in re.split(r"(?<=[.!?])\s+|\n+|;\s+|\s\(\w\)\s", chunk):
        s = s.strip(" *-|>")
        # Review 3 of #3665: an offer or a "not" span (with the next four words) is cut out, never the whole sentence, so
        # "No need to wait: please merge #12" still asks and "Would you like me to merge it?" does not.
        k = NOT_ASK.sub(" OFFERED ", s) if need_you else s
        imp = any(IMP.search(p) for p in re.split(r"OFFERED[\s,:;-]*|,\s+", k))   # after a cut span, or after a leading clause (Lead 7)
        if k and ASK.search(k) and (not need_you or YOU.search(k) or imp) and not ONLY.search(s):
            out.append(re.sub(r"\s+", " ", s)[:140])
    return out
if mode == "text":
    hits = [] if ONLY.search(text) else asks(text, True)
else:  # the lines of STATE that ask the founder for something
    hits = [h for l in text.splitlines() if re.search(r"for the founder|founder asks open|needs you|(^|[\s*(-])ask:", l, I) for h in asks(l, False)]
for h in hits: print("ask: " + h)
' "$1"; }
case "${1:-}" in
  --text) judge text; exit 0;;
  --state) f="${2:-}"; [ -r "$f" ] || { echo "ACT   founder asks: $f unreadable, nothing was checked (ENF-763)"; exit 0; }
    hits=$(judge state < "$f"); n=$(grep -c '^ask: ' <<<"$hits")
    echo "founder asks that are GitHub/claude.ai clicks: $n (P-752/P-763: the Lead does them in the built-in browser)"
    while IFS= read -r h; do [ -n "$h" ] && echo "ACT   founder ask is a click, do it yourself in the built-in browser (P-752/P-763): ${h#ask: }"; done <<<"$hits"
    exit 0;;
esac
input=$(cat)
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
ROOT=$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null) || exit 0
lane=$(cd "$ROOT" && bash "$ROOT/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lane.sh" whoami 2>/dev/null)
[ "$lane" = lead ] || exit 0
# The last assistant message: the hook's own field when Claude Code sends it, else the transcript's last assistant text.
msg=$(printf '%s' "$input" | jq -r '.last_assistant_message // empty' 2>/dev/null)
if [ -z "$msg" ]; then
  tp=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
  [ -r "$tp" ] && msg=$(jq -rs '[.[] | select(.type == "assistant") | [.message.content[]? | select(.type == "text") | .text] | join("\n") | select(length > 0)] | last // empty' "$tp" 2>/dev/null)
fi
[ -n "$msg" ] || exit 0
hits=$(printf '%s' "$msg" | judge text)
[ -z "$hits" ] && exit 0
jq -n --arg h "$hits" '{decision:"block",reason:("- The last message asks the founder to do a GitHub, claude.ai or console step. Do it yourself now: do it in the built-in browser (P-752; P-763, P-778 E-c), then tell the founder it is done. Only sign-in, password, 2FA or one-time code, payment, a new account or key (P-551) or a permission widening (P-387) go to the founder, named as the reason in the same message:\n" + $h + "\n")}'
