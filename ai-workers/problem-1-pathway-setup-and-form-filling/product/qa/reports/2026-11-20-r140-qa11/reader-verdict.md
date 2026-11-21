# R1.40 — fresh reader's verdict (Opus, fresh context, read code and git only, ran nothing; 20 Nov, main 418be9f1a)

**(1) Verdict: Partial.** J-38 is red on main's head on GitHub (33 PASS, 1 FAIL in both runs). No open Major or Critical against R1.40's product; this is only P-305's green-pack rule. Judgement: the product meets the Done-when line; one stale assertion in J-38 holds it.

**(2) DW1 is a stale test, not a product bug (hypothesis confirmed).** Facts: `api/src/platform/messages/send/messages.ts:186` marks the row SENT; `channels/email/local.ts:36-52`: when notices are connected, the local adapter applies a Delivery test event via `setImmediate` after the worker commits; `bounces.ts:131-134` moves SENT → DELIVERED; the running app connects this at `features/platform-messages.ts:40`. Git order: b9104da5b (dated 18 Nov) reached main only in #2397 (4b1c1eb1b, 20 Nov 01:36Z); J-38 was written before (e62731483, 820be19d3, f7510648c, 19 Nov). Only `j_38.ts:161` tests `state === "SENT"` (header comment :5 says "SENT"). `demo-inbox.ts:32` and `unsubscribe.ts:88` read both SENT and DELIVERED; nothing else needs SENT. Judgement: Defect · Major against the pack only; owner runtime (J-38 owner). The event is async, so accept both: at `j_38.ts:161` replace `o.state === "SENT"` with `["SENT","DELIVERED"].includes(o.state)`; label :162 and comment :5 "sent (SENT or DELIVERED) by".

**(3) Gate A: yes, it reaches row 42's first step by screens.** `tests/qa/check_r138_r140_booking_page_walk.ts:102-108` clicks Reschedule on the confirmation, :113-143 moves, cancels and checks three invites. (The reader could not see qa's run logs: uncommitted at the time of reading; committed since in `2026-11-20-r140-qa11/`.)

**(4) Host-change finding: real, Gap · Minor.** `api/src/front-office/booking/service.ts:572-576` can reassign `staffId` when the old host is not free at the new time (:573); the host mail at :665-668 goes only to `b.staffId` (now the new host); the original host gets no METHOD:CANCEL. Only on a reassigning move in a type with several hosts; the Done when is met for the booker and the current host, so no change to the verdict.

**(5) QA-522: close once J-38 is green** (W7 and W8 walk a staff move and a staff cancel since #2376). Note: J-38 shows change and cancel as staff actions; the booker's own Reschedule and Cancel are shown by qa's walk, not by the pack.

**(6) Nothing else would change the verdict.** After the one-line fix and two green walks.yml runs on main, the reader would score Works.
