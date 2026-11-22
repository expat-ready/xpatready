#!/usr/bin/env python3
"""Sources for domain values (P-801, founder 14:4x and 15:1x IST 22 Nov: "Don't ask me question related to domain ...
you have to find what are the best practices in the industry, competitive analysis, government RCIC documents"; ENF-798).
Called by brief-check.sh on the text of a brief (--brief, lane-preflight.sh's hook) or a PR body (pr-rules.yml).
  (a) --brief only: a text that states a domain value (a form, program, province rule, fee, tax rate, day count or
      threshold) needs a "Source:" line naming one of
        - a requirement: a path under domain/requirements-*, sources/drive-snapshot-* or a requirement card
          ("AG-6-4@374fb7a9" or "SA-2-1@...", the house citation of trace-requirements.py);
        - an official page: an https URL on a government host (canada.ca, *.gc.ca, the CICC, a province's site) with a
          quoted line and a date;
        - a market-research note: the words "market research" and a file path or URL.
      On a line that says "Sample" (AGENTS rule 4) amounts, rates, counts and thresholds are not counted; a form,
      program or province named there still is. PR bodies quote form names all the
      time and are not checked for (a).
  (b) any text: a "Question for the founder" (anywhere on a line, but not in quotes or backticks, which name the rule; "Questions for the founder: none", or that heading
      with "None." on the next line, is no question) needs a "Sources checked:" line.
Prints what is missing, one ";"-ended clause per problem; exit 1 then, 0 when clean. Test: test-enf-798.sh.
"""
import re, sys

PATTERNS = [
    ("form", r"\b(IMM|EMP|CIT|PRC)[ -]?\d{4}[A-Z]?\b", 0),
    ("program", r"\b(express entry|federal skilled (worker|trades)|canadian experience class|provincial nominee|PNP|OINP|start-?up visa|super visa|study permit|work permit|visitor visa|post-graduation work permit|PGWP|spous(al|e) sponsorship|family sponsorship|caregiver program|LMIA|temporary resident visa|permanent resident card)\b", re.I),
    ("province rule", r"\b(ontario|quebec|québec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|nunavut|northwest territories)\b", re.I),
    ("fee", r"(\bfees?\b[^\n]{0,40}\$ ?\d|\bCA?\$ ?\d|\bCAD ?\d|\d ?CAD\b)", re.I),
    ("rate", r"(?=.*\b(tax|GST|HST|PST|QST|interest)\b).*\d+(\.\d+)? ?%", re.I),
    ("day count", r"(?=.*\b(processing|valid(ity)?|deadline|expir\w*|biometric\w*|physically present|IRCC|ESDC|refund)\b).*\b\d+ ?(calendar |business |working )?days?\b", re.I),
    ("threshold", r"(\b(CRS|CLB|NCLC|NOC|TEER|LICO|IELTS|CELPIP|TEF)\b.*\d|\bminimum (score|income|funds)\b)", 0),
]
SRC_LINE = re.compile(r"^[\s*>-]*Sources?[*]*:[\s*]*(.*)$", re.M)
CHECKED = re.compile(r"^[\s*>-]*Sources checked[*]*:[\s*]*\S", re.M)
REQ = re.compile(r"(domain/requirements-\S+|sources/drive-snapshot-\S+|requirements-\d{4}-\d{2}-\d{2}/\S+|\b[A-Z]{2,3}-\d+-\d+@[0-9a-f]{7,40}\b)")   # cards: AG-6-4@374fb7a9, SA-2-1@...
OFFICIAL = re.compile(r"https://([a-z0-9-]+\.)*(canada\.ca|gc\.ca|cicc-ccic\.ca|college-ic\.ca|ontario\.ca|gov\.bc\.ca|alberta\.ca|quebec\.ca|saskatchewan\.ca|gov\.mb\.ca|novascotia\.ca|gnb\.ca|gov\.nl\.ca|princeedwardisland\.ca|yukon\.ca|gov\.nt\.ca|gov\.nu\.ca)(/\S*)?", re.I)
QUOTE = re.compile(r"[\"“”][^\"“”]{3,}[\"“”]")
DATE = re.compile(r"\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}\b|\b\d{4}-\d{2}-\d{2}\b")
MARKET = re.compile(r"(?i)market[- ]research")
PATHISH = re.compile(r"(\S+/\S+\.(md|pdf|html)\b|https?://\S+)")
QUESTION = re.compile(r"(?i)(?<![\"“`'])questions? for the founder(?![\"”`'])")   # a quoted mention names the rule, asks nothing
NONE_AFTER = re.compile(r"(?i)questions? for the founder\W*(none|no questions?)\W*$")


def domain_hits(text):
    hits = []
    for line in text.splitlines():
        if SRC_LINE.match(line) or CHECKED.match(line):
            continue
        sample = bool(re.search(r"\bSample\b", line))   # a Sample value (AGENTS rule 4): its amounts and counts are no claim
        line = re.sub(r"US\$ ?[0-9][0-9.,]*", "", line)
        for name, rx, fl in PATTERNS:
            if sample and name not in ("form", "program", "province rule"):
                continue
            m = re.search(rx, line, fl)
            if m and name not in [h[0] for h in hits]:
                hits.append((name, m.group(0).strip()[:30]))
    return hits


def good_source(src):
    if REQ.search(src):
        return True
    if OFFICIAL.search(src) and QUOTE.search(src) and DATE.search(src):
        return True
    return bool(MARKET.search(src) and PATHISH.search(src))


def founder_question(text):
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if not QUESTION.search(line) or NONE_AFTER.search(line):
            continue
        nxt = next((l for l in lines[i + 1:] if l.strip()), "")
        if re.match(r"(?i)^#+\s*questions? for the founder\W*$", line.strip()) and re.match(r"(?i)^\W*(none|no questions?)\W*$", nxt):
            continue
        return True
    return False


def main(argv):
    text = sys.stdin.read().replace("\r", "")
    bad = []
    if "--brief" in argv:
        hits = domain_hits(text)
        if hits:
            what = "; ".join(f'{n} "{v}"' for n, v in hits)
            srcs = [s.strip() for s in SRC_LINE.findall(text) if s.strip()]
            if not srcs:
                bad.append(f'states a domain value ({what}) with no "Source:" line (a requirement path or card, an official '
                           'government URL with a quoted line and a date, or a market-research note with its file; P-801);')
            elif not any(good_source(s) for s in srcs):
                bad.append(f'a "Source:" line that is neither a requirement path or card, an official government URL with a quoted '
                           f'line and a date, nor a market-research note with its file (got: {srcs[0][:80]}; P-801);')
    if founder_question(text) and not CHECKED.search(text):
        bad.append('a "Question for the founder" with no "Sources checked:" line (requirements, official pages, market '
                   'research checked first; P-801);')
    if bad:
        print(" ".join(bad))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
