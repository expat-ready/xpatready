# Track B (case side and client money): verified rows, first lanes, questions, forecast

Lead B (Track B), Opus 5.5 medium, 22 Nov 10:49–11:3x IST, under P-785 (3). Read against `main` `01841047d` (then #2883 merged at 11:01 IST), open PRs listed at 10:5x IST, `qa/CAPABILITIES.md`, `BACKLOG.md`, and the briefs on `main`, `claude/build-lead-c-647b40` and `lead-b-front-office`. Records only. Briefs: `design/briefs/track-b/`.

## 1. Corrections to the collision map's Track B list (§C)
* **R1.67 is Works** (qa 10, 20 Nov, main `2547b3db1`): drop it from Track B.
* **R1.98 is shaped**, not "needs shaping": BACKLOG rows CS-98r, CS-98a–e, CS-98s1–s2 and briefs `design/briefs/CS-98*.md` exist. It waits on two migrations (CS-98r, CS-98a) and a screen concept (CS-98s1).
* **R1.76's front-office half is on `main`:** lead and prospect notes and timelines (FO-2 part 4: `POST …/leads/:id/notes`, `POST …/prospects/:id/notes`, `GET …/timeline` in `front-office/sales/routes.ts` lines 93-110). The qa note of 18 Nov (FO-2 note routes "not merged") is out of date; qa should re-read. What is left: CS-NT1 (case notes, 3 parts; part 1 is #2320) and a person's own timeline (new row CS-NT1t).
* **Question 6 (R1.75) is settled in the row:** PF-29a's home is `prisma/schema/platform-tasks.prisma`.
* **P-561 does not hold signing:** it chose BoldSign behind `SigningPort` on four conditions; what waits is the sandbox account, the founder's to open when needed (P-568).
* **Track A touched client money today:** #2883 (PF-28 part 6) changed `client-money/invoices/*` and `ports/client-money.ts`; merged 11:01 IST. PF-28's later parts may do so again: the Lead keeps PF-28 off `client-money/` while Track B holds it.

## 2. Verified table (parts left; M = needs a migration)
| Row | Parts merged | Parts left (M = migration) | Shaped? | Outside dependency | Needs from Track A |
|---|---|---|---|---|---|
| R1.3 walls between firms | CS-W1 p1, CS-W3 p1 (#2349) | CS-W2 10 parts (all M), CS-W3 2-cases / 2-forms / 2-review / 2-evidence-links / 3, CS-W4 (M + CI gate) | yes (`CS-W2.md`, `CS-W3.md`, `CS-W4.md`) | none | none; but 10 migrations on today's single baton |
| R1.76 notes, timelines | FO-2 p4 (lead and prospect notes and timelines) | CS-NT1 p1 (#2320, M, draft), p2 (M: rich text, delete), p3 (case-client notes, @mentions); CS-NT1t (new row) | yes; CS-NT1t written today | none | `NotificationPort` for @mentions (exists) |
| R1.58 trust or operating, ledger, to move | FO-7a, FO-7mv, FO-7a2, FO-7ts p1-2, FO-7lk | FO-7ts p3 (#2368, M, **dirty since 21 Nov 07:31 IST, no owner**), FO-7t p1-3, FO-7s3a, FO-7s3b, FO-7m (M) | yes | none | none |
| R1.56 invoices, provincial tax, government fee | FO-7a, FO-7b p1a (the arithmetic; first commit 20 Nov 14:52 IST, on `main` by 20 Nov 23:02 IST) | FO-7b p1b, FO-7g p1, FO-7g p1w (new), FO-7q, FO-7s1; **the client's province (FO-7g p3) has no address row** (question 1) | yes, except the client's province | cited CRA table (in Build Lead C's FO-7g brief, read 18 Nov; builder re-reads) | none |
| R1.96 reversals, refunds, credit notes, plans, write-offs | FO-7a2 (credit notes on trust-paid invoices, schema) | FO-7b p1b-p2, FO-7v, FO-7p (waits FO-7c), FO-7r p1, FO-7s4 | yes | Stripe test key for plans (FO-7p) | none |
| R1.111 statement, period exports | none | FO-7r p1-p2, FO-7s5 | yes | none | PF-14 (merged) |
| R1.75 tasks | none | PF-29a (M), PF-29b-e, PF-29f (concept first), CS-T1 | yes | none | none (PF-29 is in this row) |
| R1.98 corporate, LMIA | corporate prospect (FO) | CS-98r (M), CS-98a (M), CS-98b-e, CS-98s1 (concept), CS-98s2 | yes | ESDC LMIA pages cited row by row | none |
| R1.64 resumable upload | PF-Fd, PF-Fp p1 | PF-F2 (M, tus), CS-D1 (M) | rows yes, no brief for PF-F2 | new technology gate (tus) | none |
| R1.65 private storage in Canada | PF-Fd | PF-F1 (brief today), PF-F1c | yes | **AWS account (founder)** for PF-F1c and the proof | none |
| R1.66 virus scan | none | PF-F3 (waits PF-F2) | row yes | AWS GuardDuty in ca-central-1 (P-624) | PF-23 `AlertPort` (merged), PF-18n (merged) |
| R1.68 preview | PF-Fp p1 | CS-D5 (API, then screen with concept) | yes | none | none |
| R1.69 read log, fingerprint, keep period | AUD-5 p1 | CS-D6 (M) | yes | none | AUD-1 trail (merged) |
| R1.70 expiry, translation, notarisation flags | none | CS-D7c (M), CS-D7 (M) | yes | none | none |
| R1.57 card payment into operating | none | FO-7c p1-3, FO-7s2 | yes | **Stripe test-mode key** (proof only; build on fakes) | **PF-27** `firmAllows(firmId, 'pay')` for FO-7c p2 (not built) |
| R1.61 sign and pay by single-use link | FO-6 p2 (`SigningPort`, fake, contract) | FO-6 routes and screens, FO-7c p2, J-61 (new row) | yes; J-61 written today | BoldSign sandbox (founder, P-561, P-568) | PF-27 (through FO-7c p2) |

**Migrations in Track B today:** #2368 (FO-7ts p3), #2320 (CS-NT1 p1); queued product-wide ahead of them: #2885 (QA-644, Track A, `queued`), #2129 (AUD-1c, Track A). Track B's recommended baton order: #2368 → #2320 → CS-W2 `filings`.

## 3. Lanes
First four (start today; no migration; no file an open PR changes — checked with `tools/touch-overlap.py` at ~11:0x IST, all exit 0; `brief-check.sh --brief` exit 0):
1. `track-b/FO-7b-1b.md` — issue, receipts, offline payments, credit notes (R1.56, R1.60). Holds `client-money/invoices/`.
2. `track-b/FO-7g-1.md` — cited GST/HST table and the tax-default route (R1.56); narrowed so it does not touch `invoices/` (its draft-step calls are the new row FO-7g part 1w).
3. `track-b/FO-7c-1.md` — the firm's payment account on a fake rail (R1.57); `client-money/card/`.
4. `track-b/PF-F1.md` — the S3 files adapter on a recorded fake client (R1.65); `platform/files/`, `package.json`.

Next four:
5. `track-b/CS-W3-2-review.md` — can also start today (no migration, no overlap) if the cap allows.
6. `track-b/FO-7t-1.md` — after FO-7b p1b merges and #2919 (events split) merges or closes.
7. `track-b/CS-W2-filings.md` — a migration: built now, queued when the Lead gives the baton.
8. `track-b/CS-W3-2-forms.md` — after CS-W3 2-review (both edit the census list).

Order on `client-money/invoices/`: FO-7b p1b → FO-7g p1w → FO-7t p2 → FO-7r p1. Not briefed (owner gone): **#2368 needs a lane** to merge `main` and re-stamp; it blocks FO-7t p2 and R1.58.

**The start hook will refuse all eight today:** `product/focus-list.md` lists no Track B item (focus-check exit 1 for each). With these lines added (the Lead keeps the list), all eight pass (exit 0, checked with `FOCUS_LIST` on a copy):

```
## Track B (case side and client money; Lead B (Track B), P-785)
| Item | Rows a brief may name | Lead | Parts left |
|---|---|---|---|
| R1.56, R1.60 | FO-7b, FO-7g | Lead B (Track B) | FO-7b part 1b, FO-7g parts 1 and 1w |
| R1.57 | FO-7c | Lead B (Track B) | FO-7c parts 1-3 |
| R1.58 | FO-7t, FO-7ts | Lead B (Track B) | FO-7ts part 3 (#2368), FO-7t parts 1-3 |
| R1.65 | PF-F1 | Lead B (Track B) | PF-F1, PF-F1c |
| R1.3 | CS-W2, CS-W3 | Lead B (Track B) | CS-W2 parts, CS-W3 parts 2-3, CS-W4 |
```

## 4. Rows written today (no builder waits on shaping)
`BACKLOG.md`: **FO-7g part 1w** (the tax default reaches each draft line), **J-61** (one link signs then pays; gap G2), **CS-NT1t** (a person's own timeline). Still needing a screen concept before their screen parts: CS-98s1 (LMIA board), PF-29f (tasks), CS-D5 (preview); FO-7s1-s5 have FO-7s0's approved concept.

## 5. Product questions for the founder (through Lead 1), each with a recommendation
1. **Whose province sets the tax on an invoice?** R1.56 says "the client's province", but no row gives a person or company an address, so FO-7g part 1 uses the firm's province. CRA's place-of-supply rules generally follow the client's address for services (to be cited by the builder; Unconfirmed: no accountant). **Recommended:** a "Bill-to province" on each invoice, picked on the draft, filled from the client's address when one exists and otherwise the firm's, frozen at issue; one column in the next `client-money.prisma` migration (FO-7g part 3). Alternative: the firm's province for Release 1, stated on the invoice.
2. **Stripe test-mode key for the firm-side card proof (R1.57, R1.96 plans).** **Recommended:** build on fakes now; the founder creates one Stripe test-mode Connect platform account before FO-7c part 2's proof (an outside dependency with ~1 week lead time; register it today).
3. **BoldSign sandbox (R1.61).** **Recommended:** open it when FO-6's routes start (P-568's own words: "whenever it is needed"); J-61 and FO-6 build on the fake until then.

## 6. Honest forecast
* **Track B rows provable by 07:00 IST 23 Nov: 0.** Every Track B row has three or more unmerged parts; the nearest (R1.56) needs FO-7b p1b, FO-7g p1, p1w and the province answer, each with an Opus reviewer and the breaker (money). A money part took about a day from first commit to `main` this week (FO-7b p1a: 20 Nov 14:52 to before 23:02 IST), and that was the smallest part.
* **After the structural changes land** (per-area migration baton, one-file-per-part lists): about **1 row every 2 days for the first week** (R1.56 first, ~24 Nov; then R1.65 once AWS is in; R1.76 when CS-NT1's three migrations pass; R1.58 after #2368 and FO-7t 1-3 and two screens), rising to **~1 a day** in week 2 when the screens (FO-7s1-s5) run in parallel with the API parts. **R1.3 needs 10 CS-W2 migrations**: on one product-wide baton that is about two weeks; with a per-area baton, about a week.
* The collision map's "Track B ~2-4 in 24 h" is not supported: it assumed near-done rows, and Track B has none.
