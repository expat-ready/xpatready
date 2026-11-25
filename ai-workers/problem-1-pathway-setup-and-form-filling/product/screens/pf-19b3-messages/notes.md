# PF-19b part 3: delivery state and the staff message list (draft notes, before the PR)

Row: PF-19b part 3 (R1.48; needed by J-48). Brief: `design/lead-b-briefs/PF-19b3.md` on `lead-b-front-office` (c5bf956f9), overlapped start (row 4 of `overlap-starts-2026-11-18.md`). Base: `claude/funny-edison-0xod9n` (#1961, 2aa433a4e). The PR opens only after #1961 merges and main is merged in (P-270).

## What it does, in product terms
* Each email a firm sends now shows whether it was **Sent, Delivered or Bounced**, from the email provider's delivery notices. A delivery notice never undoes a bounce or a failure.
* On the demo copy (no real email provider) every email gets a test delivery notice by itself, and the Sample bounce addresses bounce. A bounced address gets nothing more.
* Staff see a **Messages** box on a lead's page listing that lead's emails: what each was, to whom (masked: `m…@example.com`), from whom (the firm's name), its state in words and when each step happened. The email's words are never shown or sent to the screen.
* Only people who may see the lead see its messages; anyone else, and another firm, get "not found".

## Done when (P-606) and the tests
| Line | Test | Result on this branch |
|---|---|---|
| DW1-DW5 | `tests/check_pf19b3_delivery.ts` | 24 passed, 0 failed (after the review fixes too) (includes PF-19b part 2's suite, 44/0, unchanged) |
| DW4, DW5 on the running copy, DW6 | `tests/check_pf19b3_panel_browser.ts` (isolated copy, `PLATFORM_IDENTITY=local`) | 24/24 passed after the review fixes (M1 reasons in words, m1 focus, m2 Try again; m3 cursors 400 in the delivery suite); screenshots in `screenshots/` at 375, 1024, 1440 px |

## Duplicate check (P-526)
Searched `main` (`git grep DELIVERED` under `api/src`: only the type and the unsubscribe page's state filter), open PRs (none names PF-19b; #1961 is PF-19p), `BACKLOG.md` (PF-19r moves senders, not state): none.

## Questions for the tech lead (Lead B), to post on the PR
1. **One line outside the touch list, on PF-19e's list:** `api/src/platform/messages/demo-inbox.ts` lists `state: "SENT"` only. With the demo's test events every local email becomes DELIVERED within a worker cycle, so without a change the demo inbox (and every walk that reads it: sign-up, booking mail, unsubscribe) would go empty. I changed that one filter to `SENT` or `DELIVERED`. PF-19e also edits this file (open on read); the two edits are on different lines. Recommendation: keep it here; if PF-19e merges first, I merge main and keep both.
2. **The lead page edit is two lines** (the import and the mount), not one.
3. **Purpose:** the outbox stores no purpose. The read gives the template key when the row has one, else the head of its sending key (`booking` for MailPort's `mail:booking:…`), else null (the panel says "Message"). MailPort messages (booking mail) carry no template key today (`mail.ts` drops it); storing it would need `mail.ts`, PF-19e's area. Recommendation: a later row.
4. **Case parties:** no staff case read on the platform side yet. The rule used: `agent/case:show` plus the party being a participant of a case whose `firm_key` is the viewer's firm. No case-team narrowing (none exists for platform staff). Build Lead C's case-page row may tighten it.
5. **@OwnOrAll:** the route is not marked `@OwnOrAll("agent/prospect")` because the sweep (`check_pf6b_permission_rules.ts`, not on the touch list) fails a marked route with no entry. The own-or-all rule is applied in the service and tested (DW5).
6. **@OwnOrAll sweep entry (review m5):** asking for `GET /api/platform/messages` to get a sweep entry in `check_pf6b_permission_rules.ts` (its own row), then the marker.
7. **PR body (review m5):** `Card unchanged:` lines for the `api-features` and `web-shell` cards (one line each: a provider/controller line and a two-line mount, no entry point of theirs changes).
8. `api/src/front-office/MODULE.md` is 42 lines on the base (module-cards fails before this change); not touched here.
9. **From-name (break m3):** the read gives the firm's current operating name; after a rename, old messages read the new name. The name each email was sent with is only in its stored rendered file, which PF-19e seals (only the worker and the demo inbox open it). R1.48's from-name clause is J-48's to prove (brief, "Not in this part"). Recommendation: store `from_name` on the outbox row in a later row (a schema change), not by opening the file here.
10. **Person, not lead (break m4):** the lead page lists the person's messages (the outbox keys on the person), so two leads of one person show the same list; it matches the person read rule. The box now says "Every email to this person, from any of their leads." Recommendation: keep.

Break report (`break-report.md`): Major B1 and Minors m6, m7 fixed in ed67de0b9; m1 (year 0000 cursor) and m2 (cache key under "pf", cleared at sign-out) fixed after it; m3, m4 and m5 are questions 9, 10 and 3 above.
11. **Case firm id (CS-W1):** cases now carry a nullable `firm_id` (csw1) beside `firm_key`. The case-party rule still uses `firm_key`, since `firm_id` can be empty. When CS-W1 part 2 makes it required, `staff-routes.ts` should switch to `case: { firmId: ctx.firmId }` (the case side's row).

## On hold (Lead 87, 19 Nov 10:5x IST; P-723 drain, nothing new starts)
* Branch `claude/intelligent-mayer-ymi4sl` at 335922e2a: reviewer Approve on 5890bcc2f (merge with #1961 at 88d03c665; the head adds only review.md). Both suites pass there: delivery 24/0, panel browser 24/24.
* Not merged and no PR: the PR opens only after #1961 is on main (overlap rule), and #1961 is not. Its tip has moved again (c27308ea1), not merged into this branch.
* Next step when Lead B says so: merge #1961's tip (or main, once #1961 is merged) once, re-run both suites, diff-only re-review, then open the PR non-draft with the `Card unchanged:` lines, the P-423 schema-read note and the questions above. No label by the builder.

## Resumed (19 Nov ~13:xx IST, a new runtime lane; Lead B's lane line: merge, diff-only re-review, open the PR)
* #1961 was labelled and queued but not yet on main, and its tip had moved to 6c775f43c (which carries main 8cefcc6c6). Merged that tip once (801181365) instead of main alone, so the PR's diff is part 3 only the moment #1961 lands. One conflict, the platform card: main's card taken whole; part 3's card lines are now `api/src/platform/MODULE.rows/PF-19b3.md` (P-712). `platform/settings.ts` merged clean with #1961's line kept.
* **Found and fixed:** `tests/check_pf19b3_panel_browser.ts` ended `process.exit(summary() ? 0 : 1)`; `summary()` returns the failure count, so the suite exited 1 on 24/24 and would have exited 0 on a failure. Now `? 1 : 0` (30c459762). The earlier "24/24 passed" lines above were read from the output, not the exit code.
* On 30c459762: delivery suite exit 0 (24 passed, 0 failed, part 2's 44/0 inside); panel browser suite exit 0 (24/24) on an isolated copy; `graph.mjs --check` exit 0; explicit any 417 → 417; `tsc -p web` 0 errors; `tsc -p api` 15 errors in 5 test files this branch does not touch (check_c18_age_case, check_c69_runs, check_cost_check, check_vv_checklist, check_x2b_bulk_apply), none in the messages code. Not run here: the full `run-suites.sh --changed` (the base still lacks #1961, so it selects every suite; the PR's own check runs them).
* Reviewer (Opus, high, fresh context, diff-only): `review-merge-2026-11-19.md`, Approve 30c459762bc6d825d0be6e49252103eb8c644645, no Blocker or Major; Minor m1 = the two `Card unchanged:` lines (question 7 above), in the PR body.
* Size: 704 changed lines of code and tests against #1961's tip (records under `product/screens/` are not counted, pr-rules.yml). The four records were taken out in 30c459762 on a wrong reading of the size rule and put back unchanged in the next commit.
* The PR opens when #1961 is on main. The builder does not label it: the staff read decides who may see a record's messages (permissions), so it waits for the tech lead's read (P-423).
