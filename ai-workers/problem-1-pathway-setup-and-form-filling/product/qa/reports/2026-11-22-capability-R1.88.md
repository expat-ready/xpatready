# qa capability R1.88 (the firm reads its own audit log), 22 Nov 2026

Run: `/qa capability R1.88` (re-walk check after #2916 AUD-4s merged as f198c943b) · main f198c943b · isolated copy :4471 (`j88`, `AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), fresh for each run, stopped · live AI off · US$0 · Sample data only.

## Verdict: Pass, R1.88 Works (P-339): GitHub walks runs 45019291303 and 45019288306, dispatched on main f198c943b, j_88 26/26, exit 0 in each

Done when: "An Owner or Admin filters by person, record and date and exports; other roles refused". Every clause holds.

## j_88, twice on fresh copies of main's head: 26/26, exit 0, same lines
* Setup: the Sample firm with its Owner, an Admin, a Case Officer, and one Sample person each as Case Manager, Billing and finance and Read-only; five Sample audit lines (four in firm A, one in firm B).
* W1, W2: the Owner signs in on the sign-in card and finds My account › Activity log in the menu. The default 7 days shows firm A's newest lines as `audit_event` holds them, in order, without the 20-day-old line or firm B's.
* W3-W5, the Owner's filters, each judged against `audit_event` with a fail-before:
  * Person = the Admin;
  * Record type and Record reference;
  * From 30 days back.
* W6: Export CSV. The file's rows match the filtered lines row by row (when and what), as many as the list shows and as X-Export-Rows says. The export writes one new `audit.exported` line.
* W7: keyboard, Tab to a line and Enter opens it in place.
* W8, the Admin: the menu entry, then Person, Record, From and To (the To date leaves out yesterday's line), then Export, each with its fail-before.
* W9: Case Officer, Case Manager, Billing and finance and Read-only each have no menu entry, see "You do not have access to the activity log" with no line shown, and get 403 on read and export.
* W10: 375, 1024 and 1440 px, with no sideways scroll and axe clean. No page error.

The j_88.ts add/add clash between #2916 and #2943 resolved as qa suggested: main holds qa's 268-line journey.

## Bugs
None new.

## Journey score: 10 / 10
Task completed 1 · next step obvious 1 · plain words 1 · feedback and state 1 · correct data 1 · error recovery 1 · accessibility and sizes 1 · speed 1 · visual quality 1 · trust and sources 1.

## Could not test
The shared demo :4400 (cloud session); a real screen reader; D17/D20. Screenshots are the GitHub walk's own (not committed).
