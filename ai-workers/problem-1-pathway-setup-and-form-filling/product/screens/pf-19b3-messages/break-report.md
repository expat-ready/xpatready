# Break report: PF-19b part 3, delivery state and the staff message list (adversarial breaker)

**Target:** head `9c5207100` (diff `2aa433a4e..9c5207100`), brief `lead-b-briefs/PF-19b3.md` (c5bf956f9).
* The builder pushed `ed67de0b9` (review fixes) during this run, so items it touches were re-run on that head and marked.
* **Copy:** isolated copy `br_pf19b3` on :4543 (`PLATFORM_IDENTITY=local`), restarted once on `ed67de0b9` and stopped afterwards.
* **Method:** probes from scratch scripts against the copy's real routes, its own worker, and Playwright/axe (nothing kept in the repo).
* **Scope (P-26):** the brief's "What to build" only. The from-name's proof and OPENED are on its "Not in this part" list.

**Verdict:** no Blocker. One Major, which `ed67de0b9` fixes (verified). Five Minor are still open on `ed67de0b9`.

## Breaks

**Major**
* **B1. Keyboard focus is lost on "Show older messages"** (DW6 keyboard only, EXPERIENCE BIC-20). Fixed in `ed67de0b9`.
  * Where: `web/src/modules/platform/messages/messages-panel.tsx:47` (at 9c52).
  * Steps: the lead's owner opens a lead whose person has 120 messages, Tabs to "Show older messages" and presses Enter.
  * Expected: focus stays on the button or moves to the first new message, and a second Enter loads page 3.
  * Actual: the rows grow to 100, but `busy` disables the button and focus drops to `<body>`. A second Enter does nothing (rows stay at 100). The new rows are not announced either.
  * Re-run on `ed67de0b9`: focus lands on the first new `<li>`, and one Tab reaches the button again. **Fixed.**

**Minor**
* **m1. Impossible cursors answer 500 or the wrong words.** `api/src/platform/messages/staff-routes.ts:19,68,70`. Partly fixed in `ed67de0b9`.
  * At 9c52: `cursor=2026-13-45T25:61:61.999Z_<uuid>` and `0000-01-01T00:00:00.000Z_<uuid>` answer **500**. An id of 36 dashes, or 36 hex digits with no dashes, answers 404 "Not found (it may have been removed by a reset)." where BAD_CURSOR 400 is expected.
  * On `ed67de0b9`: those now answer 400, **except year 0000, which still gives 500** (`Date.parse` accepts it and the database refuses it). Years 0001-9999 give 200.
  * Expected: 400 BAD_CURSOR for every cursor the server did not issue.
* **m2. A staff answer outlives the session.** Sign-out and sign-in do not clear the panel's answers.
  * Where: the query key is `["platform","messages",kind,id]` (`messages-panel.tsx:35`, `:36` on ed67). Sign-out and sign-in drop or refresh only `STAFF_KEYS = [["fo"],["pf"]]` (`web/src/modules/platform/session.ts:27,36,97`, the break S2 rule: "a new person never sees the last person's rows").
  * Actual: the last person's message lists stay in the page's query cache after sign-out, and a new sign-in does not refresh them.
  * No visible leak was found: the panel mounts only after the lead read succeeds for the new person, and firm B on firm A's URL sees "Lead not found" with no panel. Fix by key prefix (`["pf", "messages", …]`).
* **m3. The from-name is the firm's name now, not the name the email carried.** `staff-routes.ts:81,87`.
  * Steps: rename `platform_firm.operating_name` to "Renamed Firm Ltd" and re-read a lead with 16 old messages.
  * Expected: each message shows the From it was sent with ("Sample immigration firm", as in the stored rendering the demo inbox shows).
  * Actual: all 16 messages read "from Renamed Firm Ltd". A record of what was sent now says something that did not happen.
* **m4. The lead page lists the person's messages, not the lead's.** `staff-routes.ts:51` maps LEAD to its FO_PERSON.
  * Steps: person P has lead L1 (owner Officer O) and lead L2 (owner Officer O2), and three emails go to P. O on L1 and O2 on L2 each see the same three messages, including any sent from the other's lead.
  * This matches the person read rule (`leads.ts:166`), so it is not a wall break, but the panel does not say that it lists the person's messages. Recommendation: a question for the tech lead, not a code change.
* **m5. Most rows have no purpose** (builder Q3, reviewer m4). Already raised, and still open on `ed67de0b9`.
  * Every row with no template key reads "Message".
  * Booking mail reads "Booking" for its confirmation, its reminders and the host copy alike (`staff-routes.ts:31-35`).
* **m6. Raw stored codes on the panel** (`messages-panel.tsx:19` at 9c52). Fixed in `ed67de0b9`.
  * At 9c52: "(content changed)", "(SUPPRESSED: HARD_BOUNCE)", and an unknown state shown as its code ("WEIRD_NEW").
  * On `ed67de0b9`: "Not sent: an earlier email to this address bounced" and "Unknown". **Fixed.**
* **m7. The error state has no recovery control** (`messages-panel.tsx:44` at 9c52). Fixed in `ed67de0b9`.
  * At 9c52: an injected 500 or 403 shows "Please try again" with no button.
  * On `ed67de0b9`: a Try again button. **Fixed.**

## What held

**Walls (DW5)**
* I ran 7 roles × 5 leads: Officer O, Officer O2, Read-only, Owner, an Officer later deactivated, Billing, and firm B's Owner. On leads owned by O, by O2, by the deactivated Officer, unassigned, and in firm B, every one of the 35 cells matched the lead page's own status (200 or 404).
* Read-only gets 404 on someone else's lead, and 200 on an unassigned one (it holds view.all), the same as the lead page.
* FO_PERSON reads follow the same rule. Firm B gets 404 on everything of firm A's.
* **Owner change:** the old owner gets 404 at once (lead, LEAD messages and FO_PERSON messages).
* **Deactivated or suspended owner:** the lead counts as Unassigned, identically on the lead page and in the messages read. The deactivated person's own token gets 401.
* **The same 404 words** ("Not found" / "No such record in your firm." / NOT_FOUND) for: firm B, unseen, a lead that does not exist, an unknown kind, a malformed id.
* **No session or a bad token:** 401.

**Tampering**
* These all answer the same 404:
  * a repeated `subjectId` or `subjectKind`;
  * an array or an object as a parameter;
  * a lowercase `lead`;
  * a leading space, a NUL byte, or a 5,000-character id;
  * `STAFF`, a person id sent as LEAD, a lead id sent as FO_PERSON, or a random CASE_PARTY.
* An uppercase id is accepted. Extra `firmId` and `audience` parameters are ignored. An empty or repeated cursor answers 400.
* A cursor with an uppercase id pages correctly. Another subject's message id used as a cursor is only a position (no rows from that subject).

**Leaks**
* No body text, subject line, full address or address local part in the answer. The address reads `o…@example.com`.
* Non-ASCII addresses are refused at send.

**Paging and budgets**
* 120 messages with the same millisecond: pages of 50/50/20, 120 unique, none missing, 10-13 ms a page.

**Delivery state (DW1-DW3)**
* SENT plus a Delivery → DELIVERED with one event. The same notice again → `repeated`. A second notice id → ignored and logged.
* Bounce then Delivery → BOUNCED. Delivery then Bounce → BOUNCED (forward).
* 8 rows, each sent 6 Deliveries and 1 Bounce at once → each BOUNCED, with exactly 1 DELIVERED and 1 BOUNCED event.
* These are all ignored:
  * a Delivery on a QUEUED row (logged) or on a FAILED row;
  * a Delivery tagged firm B for firm A's row;
  * an SES notice naming a `local:` row;
  * `notificationType: "delivery"` in lower case.
* An unsigned notice at the copy's `/api/public/messages/ses-notices` → 400 "not signed by Amazon SNS".

**The local adapter's test events (DW4)**
* 60 deliveries on a 10-connection pool and 120 on a 3-connection pool, all at once: every one DELIVERED, no lost or failed event, no log line.
* On the copy's own worker, the uppercase `Bounce@Example.COM` became BOUNCED with suppression HARD_BOUNCE, and the next send to it became SUPPRESSED.
* The demo inbox lists DELIVERED rows (50 of 187, its cap) and drops the BOUNCED Sample row.
* Observation, not this row's: the worker sends about 30 a minute (`pgboss-jobs.ts:98,268`, poll 2 s, batch 1, PF-14). A backlog of 400 therefore takes minutes, not "one worker cycle".

**Panel (DW6)**
* No sideways scroll at 1440, 1024, 375 and 320 px, or at 200 % zoom (640 CSS px).
* axe finds no A/AA violation with 120 messages, in light or dark.
* A 300-character purpose and an RTL from-name wrap within 375 px.
* Back and reload keep the list (16 rows).
* 404, 500, 403 and a malformed answer each show an alert, and the rest of the lead page still works.
