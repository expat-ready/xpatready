# qa capability R1.89 (public pricing page), re-walk after #2926, 22 Nov 2026

Run: `/qa capability R1.89` (Lead 3, task LX939) · main 71984ae8a (#2926 merged as 0ef5179ec) · isolated copy :4489 (`j89`, `PLATFORM_IDENTITY=local`, no Stripe key), fresh for each run, stopped · live AI off · US$0 · no Stripe call · no priced button.

## Verdict: Pass (Works once the GitHub run on this PR's head is green and named in the row, P-339)

Done when: "Plans, prices and trial read from the plan table (no number typed into the page); a plan change shows without a deploy; keyboard, 400 px, axe clean". Every clause holds.

## j_89, twice on fresh copies of main's head: 17/17, exit 0, same lines
* W1 the active plans exactly as stored (name, seats, trial days), fewest seats first; 282-395 ms.
* W2 a table change (name, trial 14 → 21, a plan switched off) shows after a reload, no restart; fails before the change.
* W3 every digit on a card is that plan's stored seats, trial days or price as written (before and after W2).
* W4 keyboard only: Tab, Right arrow (Yearly), Tab, Enter → Sign up with "Solo (Sample), yearly" (R1.90's first step).
* W5 400, 1024, 1440 px: no sideways scroll, axe WCAG 2.2 A/AA clean.
* W6 every card shows its stored price, Monthly then Yearly, "+ applicable taxes", equal to GET /api/public/plans: solo $49/$490, team $99/$990, firm $199/$1,990 (Sample, CAD); no "Prices unavailable".
* W6b a price changed in the table (solo 55.00) shows as $55 after a reload; fails before the change.
* W7 the page's half alone (stand-in, said): the first price swapped in the browser shows "$1,234.50 per month, CAD"; only that card changes.
* W8 QA-742: a 0-day plan shows no trial line, its button reads "Sign up", the lead drops "Every plan starts with a free trial"; fails before the change.
* No page error.

Changes to j_89 since #2912 (Lead 2's ask on #2912): W3 allows each plan's stored price digits; W6/W6b judge the table's cents (the ruled source); W7 judges only the card the stand-in changed; W8 added; W2's fail-before no longer passes trivially (review Minor on #2912).

## Bugs
QA-741 and QA-742 closed (`history/qa-bugs-closed-2026-11-22-r189.md`). No new finding.

## Journey score: 9.5 / 10
Task completed 1 · next step obvious 1 · plain words 1 · feedback and state 1 · correct data 1 · error recovery 1 (load failure, unknown plan: walked 22 Nov, unchanged code) · accessibility and sizes 1 · speed 1 · visual quality 1 · trust and sources ½ (prices and names marked Sample, as they must be until the founder's prices).

## Could not test
Stripe test mode (no key in a lane, by rule); the shared demo :4400 (cloud session); a real screen reader; D17/D20. Screenshots are the GitHub walk's own (not committed: a screens path holds the queue for the Lead's read).
