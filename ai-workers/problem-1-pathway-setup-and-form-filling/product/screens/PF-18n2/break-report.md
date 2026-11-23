# PF-18n part 2: break report (PR #3289, head c97b85ca34d04c7a55ecbad8240885a977027814)

Breaker, 23 Nov 2026. Back-end row: lead-assigned notifications and labels that follow the lead's own visibility. How I tested:
- scratch probes modelled on `tests/check_pf18n2_lead_notices.ts`, each on its own database `xr_breaker_pf18n2_<pid>`, dropped at the end;
- the row's own test, run from a copy: 24 passed, 0 failed;
- an isolated copy (`tools/isolated.sh brk18n2 4583`, local sign-in), so the real HTTP path ran as `xr_app` behind the firm walls. It is stopped and its database dropped.

No app code was changed. Scope is the row as the Lead described it, plus what the PR says about itself.

## Findings

### M1 (Major): a booking's host is never told, though the PR says they are
- **Steps:** a public booking arrives through `PrismaArrival`, built the way the running app builds it (`runtimeBookingPorts`). The host O owns the new lead.
- **Evidence:** O owns the lead, and O has **0** `msg_notification` rows for it. Control: give the same adapter a NotificationPort and O gets 1 row.
- **Cause:** `api/src/front-office/booking/runtime-ports.ts:19` builds `new PrismaArrival({ audit, consent })`. Its ports type (`sales/arrival-port.ts:29`) has no `notifications`, so `arrive()` gets none and `tellAssigned` returns at its first line (`arrival.ts:151`).
- **What the PR claims:** `front-office/MODULE.rows/PF-18n2.md` says it "tells a lead's rule-placed, booking-host or one-user-firm owner". The comment at `arrival.ts:141` says the same ("a booking's host"). No test covers the booking door.
- **Suggested fix:**
  - add `notifications?: NotificationPort<Tx> | null` to `PrismaArrival`'s ports;
  - give it the real `NOTIFICATION_PORT` where the booking feature builds `runtimeBookingPorts` (optional, as in `front-office-sales.ts`).
  - Watch for one case: a staff booking (FO-3sr) where the person booking is also the host must not tell that person (AG-7-39 r4). Pass the actor through, or skip when the host is the booker.
- **Fail test:** a booking through `runtimeBookingPorts(...).arrival.bookingArrived` gives its host exactly 1 `lead-assigned` row. Without the wiring it gives 0, which fails.

### m1 (Minor): a long real name loses the label and the link for the lead's own owner
- **Steps:** a web-form lead with a 100-character first name and a 100-character last name (each door's own maximum) is placed on O by the rule.
- **Evidence:** O gets 1 row, but `label: null, link: null`. O's GET leads/:id answers 200.
- **Cause:** the label is "name (L-00001)", 211 characters, and `labels.ts:238` refuses any label over 200. O cannot open their own lead from the list.
- **Suggested fix:** shorten the name part in `lead-notification-labels.ts` (for example to 180 characters plus "…") so that the label always passes. Do not raise the cap blindly.
- **Fail test:** a 100+100 name gives a label that ends in "(L-…)" and a link. Today it gives null, which fails.

### m2 (Minor, latent): the labeller skips the route's key check
- **The gap:** GET leads/:id requires `agent/prospect:show` (`sales/routes.ts:82`; the guard answers 403). The labeller uses only `visibilityOf` + `sees`.
- **Evidence:** an ACTIVE staff member with no role grant gets a lead through Assign (allowed: "any role"). They get 1 row with `label "P4 Sample (L-00007)"` and a link, yet their GET would be 403.
- **Why it is latent:** today all six roles hold the key, and a role change needs at least one role. So this only bites if the role catalogue changes. It is still a second rule beside the one GET uses.
- **Suggested fix:** `LeadNotificationLabels.of` returns an empty map unless `reader.keys` includes `agent/prospect:show`.
- **Fail test:** for a reader whose keys do not include `agent/prospect:show`, the item for a lead they own shows label null and link null.

### m3 (Minor, hardening): the link check accepts protocol-relative links
- `labels.ts:217` uses `PAGE = /^\/[A-Za-z0-9/_-]{1,200}$/`, which accepts `//intranet` and `//evil-host/x` (checked with node). A front end that puts this in an `href` would leave the app.
- Labellers are our own code, so the risk is low. It does break the promise in the file's comment, "never an outside link".
- **Suggested fix:** `/^\/(?!\/)[A-Za-z0-9/_-]{0,199}$/`.
- **Fail test:** a labeller that returns `//evil-host/x` gets no label.

### m4 (Minor, latent): case items are labelled without the reader's case scope
- **The gap:**
  - `store.ts` now sends the case number as `label`, and the link (already there before this PR) for `case`, `case-stage` and `case-milestone` items, for any reader in the firm.
  - `case-access.ts` `caseScope` (view.own: file owner or team only) is never asked.
  - So a person taken off a case still sees its number and link.
- **What the PR claims:** the new `NotificationView` comment says "both null when the item is gone or the reader may no longer open it". That is true only for leads.
- **Why it is latent:** every seeded role holds `agent/case:view.all`.
- **Suggested fix:** filter `linksOf` by `caseScopeWhere(await caseScope(db, reader))`, or reword the comment and MODULE row to say case items are not filtered yet.
- **Fail test:** a reader with only view.own, not on the team, sees label and link null for a case item.

## What held (with evidence)
- **Another firm's lead id** planted in O's row: label and link null. So were a case id or staff id filed as `lead`, and a lead id filed as `case` or `staff`.
- **A hostile labeller:**
  - an extra id outside the ones asked: dropped;
  - an `https://` link: dropped;
  - a 201-character label: dropped;
  - a labeller that throws: the list still answers, with a warning logged by kind only.
- **The visibility rule matches GET leads/:id in every case I tried:**

  | Case | Label and link | GET leads/:id |
  |---|---|---|
  | own-only firm, lead reassigned away | null | 404 |
  | new owner | named and linked | 200 |
  | owner deactivated, reader holds view.all | named | 200 |
  | owner deactivated, reader without view.all or assign | null | 404 |
  | everyone-sees-all on, reader holds view.all | named | 200 |
  | everyone-sees-all on, reader without view.all | null | 404 |
  | closed lead, its owner | named | 200 |

- **The real app over HTTP on :4583, as `xr_app`:**
  - after R→O, O's list names the lead and gives `zone` America/Toronto;
  - after O→T with sees-all on, O still sees it named; with sees-all off, label and link are null and O's GET is 404;
  - T sees it named and gets 200;
  - an unknown query key answers 422, and no token answers 401.
- **No duplicates or misses:**
  - Assign A→B→A gives one row each, and the re-assign sets the row back to unread;
  - two Assigns at once from Unassigned: one wins, one row for the winner, none for the loser (rolled back);
  - 12 parallel round-robin arrivals split 6 and 6, with exactly 1 row per lead, each to its owner;
  - an Unassigned arrival tells nobody.
- **Transactions:** a notify that throws rolls back the arrival (0 leads written) and the Assign (owner unchanged). An arrival with no owner never calls notify, so a broken port cannot lose an Unassigned enquiry. The rollback of a placed lead's arrival is the PF-18n contract (notify runs inside the caller's transaction), so it is not a finding.
- **Wrong people and wrong firms:**
  - Assign to a deactivated person: 422;
  - notifying a deactivated person, or a firm-B person, directly: 0 rows;
  - `tellAssigned(A)` called inside a firm-B scope writes under firm A (the lead's firm);
  - In-app switched off: no row, and the lead is still assigned.
- **Names in other scripts:** emoji, Arabic, "Ñandú-李" and an empty name ("(no name)") are all labelled correctly.

Probes: `/tmp/claude-0/-home-user-xpatready/d4a803f4-3580-57ec-aa34-45a99ccaeb6a/scratchpad/breaker/probe.mts`, `http.sh`.

Verdict: Changes c97b85ca34d04c7a55ecbad8240885a977027814
