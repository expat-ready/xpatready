# FO-2 part 1 review (PR #1813, commit b4db3a009, API only, no screen)

Reviewer: Opus, fresh context, did not build it (P-303). Diff: `git diff origin/main...b4db3a009`, 8 files, +777 lines (under 800).
Read: brief FO-2 and BACKLOG rows FO-2 and FO-2 rev 15.1; contracts §0, §2.1, §7 §2.1; AG-2-5, -13c, -49, -84 (trace).
**Verdict (skill scale): Ship after fixes.** Gate line at the end.

## What I ran (all against b4db3a009 itself)
* The shared checkout had moved on (HEAD 8498a4977 plus uncommitted builder edits), so I checked out a clean worktree at b4db3a009 in my scratchpad and ran everything from there.
* Suite `tests/check_fo2_leads_prospects.ts`: **55 passed, 0 failed.**
* Mutation check (3 throwaway copies). Removing the honeypot check failed 7 tests. Removing the receipt's repeat return failed 3. Removing the Take-it owner check failed 1. So the tests do catch it when these rules are removed.
* Live API on :4433 (my own database, now dropped). I seeded the front office, published an EMAIL/MARKETING wording through `ConsentStore.publishWording`, and turned the form on. Then I walked the journeys over HTTP (journey report: `journey-test-reviewer-2026-11-15.md`).
* Held live:
  * 5 parallel posts with one `submissionId` made 1 lead.
  * 3 parallel Take it calls gave one 200, two 409s naming the owner, and 1 `lead.taken` event.
  * Honeypot, a 1-second fill, an off-site Origin, an unknown token, no email and no phone, firm B reading firm A's lead (404), a Case officer calling Assign (403): all behaved as written.
  * The message is stored as a plain-text INTERNAL note. The phone is kept in E.164; an unreadable phone is flagged `fixNumber`. `utm_campaign` was stored, and one consent row was written for `FO_PERSON`.

## Is the split sound?
Yes for part 1. It is split along a real seam: the door and arrival path, then the lead lists and the owner moves. It can be tested on its own, and it writes no schema. Two caveats:
* **Part 2 as now listed is too big.** It holds Add a lead, Close, Reopen, Engage, the prospect board and list, move, lost, convert and undo, calls, notes and the timeline. That will exceed 800 lines again. Split it now (for example 2a leads and activity, 2b prospects), not at review time.
* **The PR body is stale.** Title, body and "Shared contract changed" still claim Add a lead, Close, Reopen, the Closed view and the `lead.closed`/`lead.reopened` events. Commit b4db3a009 has none of them, and "Checks and results" still says "In progress".

## Known deviations: my judgement
* **30 per IP / 60 per form vs the row's "sixth post → 429".** The code is right. AG-2-49 rule 1 says "The tests check these defaults", and requirements outrank the row (AGENTS.md rule 2). The row should be corrected by Lead B. This is not a code finding.
* **`agent/prospect:show` instead of the unseeded `agent/prospect:list`.** Acceptable: show is seeded on every role that should read, and view.all/view.own still choose the rows. Record it as a question to Lead B (it is in a code comment only).
* **32 KB checked after the app-wide 5 MB parser.** At b4db3a009 this does not meet AG-2-49 rule 2 ("refused before it is read in full"). The later commit 8498a4977 (Lead B's ruling) addresses it. I did not review that commit. It makes finding M1 worse until it lands.

## D1-D20 (API only; screen dimensions N/A)
D1 requirement fit: 3 of 4 with gaps (M1, M2, m4) · D2 integrity: 4/4 (races held live, firm-scoped, outbox last) · D3 N/A · D4 N/A · D5 stability: 2/4 (M2: a restart silently loses enquiries) · D6 audit: 3/4 (assign audit has no previous owner, m4) · D7 N/A (no AI) · D8-D14 N/A (no screen) · D15 speed: 3/4 (no per-row requests; list capped at 500, m5) · D16 testability: 3/4 (rules are mutation-sensitive; services are called directly, not over HTTP, m8) · D17, D20: simulated only · D18 provenance: 4/4 (source, form name, attribution, possible-match line) · D19: N/A for part 1 (no screen; FO-4 closes it).
BIC-01..20 (EXPERIENCE §6): N/A, there is no case-side screen. Graph (P-86): `graph.mjs` lists no FO-2 routes in GRAPH.md, so it gives no evidence either way.

## Findings
**Blocker:** none.

**Major**
* **M1. Oversized posts skip the rate limit** (`api/src/front-office/sales/public.ts:84-88`).
  * The 413 return runs before the limit lines `limit(post:ip)` and `limit(post:form)`, so a refused oversized post is never counted.
  * Live: 35 posts of 40 KB from one address all got 413, and the 36th normal post got 400, not 429.
  * Failure scenario: a bot sends unlimited ~5 MB bodies per address. Each is parsed by the 5 MB parser and then serialised again (`JSON.stringify(body)`, line 85), so the per-IP flood limit (AG-2-49 rule 1) does nothing against the most expensive requests.
  * Fix: count both limits first, then refuse on size. Add a test: 31 oversized posts, then a normal one gets 429.
* **M2. A real person's enquiry is silently lost after a restart or an old page** (`public.ts:60`, `:99`, `:150-157`; the claim in the comment at `:10` is untrue).
  * The stamp key is random per process unless `FO_FORM_STAMP_KEY` is set, and that name appears nowhere in `deploy/`. A stamp that fails the MAC, or is older than 24 h, is answered with the thank-you text, and nothing is stored, not even a receipt.
  * Live: I loaded the form, restarted the API and posted as a person. I got 201 "Thank you", with 0 people and 0 new receipts.
  * Failure scenario: any deploy, crash or second instance drops every enquiry from an open page while telling the visitor it was received. This breaks AG16-60 ("Duplicate beats a miss") and AG-2-49 §10 ("a refused real person sees a message that tells them to try again").
  * Fix: keep the silent drop only for the honeypot and for a fill under 2 s with a valid MAC. Answer an invalid or expired stamp with a 4xx "Please reload the page and try again" (still nothing saved, which keeps the "altered stamp → dropped" test true). Put `FO_FORM_STAMP_KEY` in the secrets runbook as a question to Lead B (deploy is outside the touch list). Add a test with a second `PublicForms` that has a different key.

**Minor**
* **m1. No CORS on the public door** (`public.ts:181-190`). OPTIONS returns 404, and GET and POST carry no `Access-Control-Allow-Origin`. A script on an allowed site cannot read the open read or post, so the Origin check only ever sees curl and our own page. It is FO-4b's door, but the headers belong on these routes. Write one hand-off line in the PR.
* **m2. `frame-ancestors` is only on the JSON read** (`public.ts:68`). A CSP on a JSON response protects no page. The Done-when "the served page carries frame-ancestors" is met only nominally. Hand it to FO-4's hosted page, in writing.
* **m3. A wrong site gives 403 where an unknown token gives 404** (`public.ts:89-92`). This tells a prober that a token exists (AG-2-49 §10). The risk is low because the token is public in the embed. Either give the same answer or note the choice.
* **m4. Assign loses facts the card asks for** (`leads.ts:96`, `:117-120`; `arrival.ts:61-65`).
  * Assign writes `lead.taken` with no `assignedBy` and no previous owner, and its audit detail has no previous owner (AG-2-13c rules 4 and 9).
  * The one-user-firm owner set at arrival raises no assigned event (AG-2-84 rule 12).
  * Contracts §2.1 list only `lead.taken`, so ask Lead B, or add `fromStaffId` and `by` (`PERSON`/`FACT`) to the payload and the audit.
* **m5. The "all" view filters after `take: 500`** (`leads.ts:40-45`). With everyone-sees-all off, a view.own person in a firm with more than 500 open leads may not see their own older leads, and there is no next page. Filter in the query.
* **m6. Take it can give 404 instead of 409** (`leads.ts:110`). With everyone-sees-all off, a second taker who holds only assign or view.all gets 404 rather than "409 with the owner's name". The firm default is on, so this is only an edge case.
* **m7. The open read has no `Cache-Control: no-store`** (`public.ts:65-80`). A shared cache could hand the same `submissionId` to two visitors, and the second enquiry would fold into the first lead.
* **m8. No test goes through HTTP and the guards.** "Read-only cannot write" is proven by route metadata only, and there is no race test for a repeated submission or for Take it. Both races held live. Add one HTTP-level check for each.
* **m9. Stale PR body** (see the split section).

## Could not check
* A real browser embed: there is no page or script yet (FO-4, FO-4b).
* A real Read-only user over HTTP: the Sample firm has none.
* The rev 15.1 seeds and the demo reset: these are part 3.
* Commit 8498a4977 and the builder's uncommitted edits: outside this review.

Journey score: **6.5 of 8 applicable criteria (8.1/10 scaled); pass bar met, error recovery ½ because of M2** (`journey-test-reviewer-2026-11-15.md`).

Verdict: Block
Fix list: M1 (count the limits before the size refusal, with a test); M2 (no silent drop for a stamp that fails the MAC or is expired; key from config, as a question to Lead B; with a test). The Minors may go in the same push or be recorded as hand-offs.
