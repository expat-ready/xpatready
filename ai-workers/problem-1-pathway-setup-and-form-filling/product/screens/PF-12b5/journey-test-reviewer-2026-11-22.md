# PF-12b part 5: journey test (reviewer, 22 Nov 2026 00:5x IST), commit d67f746d74ca89fd4e5c23ef615ce97b0d5815fa

This is a backend row with no screen. What a user would notice is whether Stripe's events still reach the firm's subscription, and whether one firm can see another firm's billing receipts.
- I used the isolated copy `rev_pf12b5` on runtime port 4436 (never :4400). The API ran as `xr_app` behind the walls, with the real pg-boss scheduler, the fake billing port and `PLATFORM_IDENTITY=local`.
- I sent signed events over HTTP and read the database with SQL and the copy's `api.log`.
- Afterwards I stopped the copy (its database was dropped).
- The app code and migration on the copy are identical in d67f746d and in `da611793b` (the HEAD of the shared checkout moved during the run; only test, rollback and records files differ).

## Journeys (persona, goal, expected result: outcome)
1. **Stripe tells us about a customer we do not know (unmatched).** Goal: "the event is kept and marked, and nothing breaks". I ran `check_pf28_inputs` DW6 against the copy, which sends a signed `customer.subscription.updated` for `cus_pf28nobody`.
   - Expected: 200, one receipt with no firm, handled `no firm matched`, and one firm-less bypass line.
   - **Held.** The receipt read `customer.subscription.updated: no firm matched`, with firm_id NULL and handled_at set. One `platform.bypass` line was written, firm NULL, step `billing.no-firm-matched`, key = the event id. pf28 was 27/27.
2. **Stripe tells us about Sample Firm's checkout (matched).** I sent a signed `checkout.session.completed` with `client_reference_id` set to Sample Firm's id.
   - Expected: 200, the receipt stores the firm, and one bypass line on that firm.
   - **Held.** The receipt read `checkout.session.completed: no subscription yet`, with firm_id = Sample Firm. One `platform.bypass` line was written on Sample Firm.
3. **Stripe sends the same event again.**
   - **Held.** The second post was answered `{"received":true,"duplicate":true}` and nothing was handled twice. The duplicate check reads the receipt through the bypass.
4. **A receipt whose handling never finished (the sweep).** I inserted an unhandled receipt dated 10 minutes earlier, with an event the fake does not know.
   - **Held.** The 19:20 UTC sweep ran on `job:platform.billing.webhook_sweep`. It read the firm-less receipt across the wall and recorded `retry 1`, as designed for a failing event. The log showed `[billing] sweep: receipt … failed (Error), try 1`.
5. **Wrong firm (the point of the row).** This was not walked on the copy, because no route exposes receipts to a firm.
   - The walls suite's DEMO lines prove it on a database with every migration applied (`check_pf12_walls.ts:250-259`, 106/0):
     - firm A reads only A's receipt;
     - with no firm, nothing is read;
     - A cannot insert for B or for no firm, and cannot update B's;
     - the bypass reads all of them and writes an unmatched receipt with its outcome.
6. **Recovery:** a migration rollback.
   - I read `rollback.sql`: it drops the trigger and the policy, then removes FORCE and DISABLE. I did not run it.

Console and page errors: N/A (no page). Server errors in `api.log`: only the intended failed try in journey 4.

## Break-it pass
- **Without the migration** (d67f746d via `git archive`, migration folder removed): 5 webhook_receipt checks went red, so the tests fail when the rule is removed.
- **A new non-family table with firm_id and no policy:** the suite's own `widget_pf12_probe` is named. The widened guard works.
- **A family exception given a plain trigger function:** it is no longer named by `unguarded`. This is review m1, a narrowing of main's guard; no table is affected today.
- **A firm_id exception later walled by CS-W4:** it stays exempt, with no failure. This is review m2.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1 to 4: every Stripe path works on the walled server |
| Next step obvious | 1 | No user step. The operator sees outcomes on the receipt (`no firm matched`, `retry n`, set aside) |
| Plain words | 1 | The outcomes and the bypass line's summary are plain; the migration comment explains why |
| Feedback and state | 1 | Each receipt carries handled_at and an outcome; a duplicate is answered as such |
| Correct data | 1 | One receipt per event; firm stored only when matched; the bypass line on the right firm or none |
| Error recovery | 1 | Journey 4: the sweep retries; the rollback is provided |
| Accessibility and screen sizes | 1 | N/A: no UI in the diff |
| Speed | 1 | Responses were immediate; one policy predicate on indexed keys |
| Visual quality | 1 | N/A: no UI in the diff |
| Trust and sources | ½ | The guard's exception reasons misname the owning rows (CS-W3 for CS-W4; AUD-4 "firmScope"), review m3. The list is the record a later builder trusts |

**9.5 / 10: pass** (8 or more, and no 0).

Not tested:
- a real Stripe account (the fake billing port only);
- the matched path with a live subscription refresh (the fake has no subscription, so the outcome was `no subscription yet`);
- running the rollback;
- a screen reader, and an intended user (D17 and D20 stay with the founder).
