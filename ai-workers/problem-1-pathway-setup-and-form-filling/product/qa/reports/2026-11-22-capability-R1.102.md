# qa capability R1.102 (find a person or case by name, email or file number), 22 Nov 2026

Run: `/qa capability R1.102` (re-walk check after the last part, #2913 CS-S1 part 2, merged as 0e244033e; #2884 PF-30a and #2921 PF-30s merged before) · main 0e244033e · isolated copy :4473 (`j102`, `PLATFORM_IDENTITY=local`), fresh for each run, stopped · live AI off · US$0 · Sample data only.

## Verdict: Pass (Works once a GitHub walk of j_102 on main is green and named in the row, P-339)

Done when: "A search by name, email or file number finds the firm's people and cases only, within the person's rights". Every clause holds.

## j_102, twice on fresh copies of main's head: 20/20, exit 0, same lines
* W0 (fails on the fake): before the records exist, "/" opens the top bar's find box and the name answers "No matches".
* W1, by name: firm A's lead appears under "Leads and prospects" and firm A's case principal under "People on cases". Firm B's lead and case of the same name never appear. The box shows the find door's rows one for one.
* W2, by email: the lead and the case principal appear with "Matched: Email". Firm B's lead with the same email is never listed to firm A, and firm B's own search finds it.
* W3, by file number: firm A's and firm B's case numbers are both C-2026-00001. Each firm's search names only its own case. Typed in lower case, the number lists the case first with "Matched: File number", and Enter opens the case page (the next capability's first step).
* W4, rights:
  * the case officer never finds another person's lead (box and door), while that lead's owner does;
  * firm B's user finds only firm B's records;
  * the records' own routes refuse the other person (404, 403).
* W5: keyboard only, "/", type, ArrowDown to the second row, Enter opens it.
* W6: 400, 1024 and 1440 px, with no sideways scroll and no serious axe violation. No page error.

The rule "own cases only" rests on CS-S1 part 2's own check, `tests/check_css1_search.ts` (#2913): every role holds view.all on main's seed, so a screen walk cannot reach it.

## Bugs
None new.

## Journey score: 10 / 10
Task completed 1 · next step obvious 1 · plain words 1 · feedback and state 1 · correct data 1 · error recovery 1 · accessibility and sizes 1 · speed 1 · visual quality 1 · trust and sources 1.

## Could not test
The shared demo :4400 (cloud session); a real screen reader; D17/D20. Screenshots are the GitHub walk's own (not committed).
