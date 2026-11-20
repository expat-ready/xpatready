# qa capability R1.72 after CS-K1s: 20 Nov 2026 (cloud qa lane, asked by Lead 4 (series 3); Opus 5.5, medium; US$0, live AI off)

Main tested: **414820671**, which includes CS-K1s #2511 (merged 15:54 UTC, merge aa70168f7). The later commits up to ff6997410 change no app code. Isolated copies only (PLATFORM_IDENTITY=local, PROSPECT_WON_POLL_MS=500, ports 4471-4472); :4400 was not touched.

## R1.72 Case with applicants, representative, pinned release: **Works** (walks green on GitHub; QA-616 answered by the tech lead)

**Signal (P-606):** every checklist part is merged: C6.1 (Works), FO-8 with CS-K1 parts 1-2 (#2406), and the screen CS-K1s (#2511, which closes QA-593). The row is scored.

**Journeys on main's head**
* Local, on main 414820671's exact tree: `tests/journeys/j_72.ts` passed **31/31 twice** on fresh isolated copies, exit 0.
* GitHub's runners (P-339, P-700), dispatched by Lead 4 on main's head **ff6997410** (the app code is the same as 414820671's): walks runs **44792732814** (job 136484627528) and **44792924533** (job 136485249770). Both are green, `j_72` 31/31, exit 0.

**Fresh Opus reader (P-303), read only:** "Works for the principal-applicant path, Partial on the plural 'applicants'". Confidence medium-high.

| Part of the clause | Status on main 414820671 | Evidence |
|---|---|---|
| A won prospect | Met on screen (Convert); Signed offline via FO-5's API route | W1: Convert by keyboard from the Pipeline card (`j_72.ts:155-163`). W5: Signed offline is recorded through FO-5's route, because main has no retainer screen; the retainer is seeded by SQL (`:176-183`). The reader: winning is FO-5's job, and the clause starts at "a won prospect". |
| …hands over (becomes a client) | Met | W2: the app's poll creates the client with no hand-run command, within three poll intervals (`:164-166`). W3 then finds the client on the Clients screen by search (`:118-122`). DW-a: a second delivery makes no second client. DW-b: firm B gets 404. |
| …into a case, opened by a person (P-560) | Met on screen | Clients → client page → "Open a case?" card → **Open the case** (`:127`). The route opens only on a staff call (`api/src/case-clients/prospect-won.ts:188`). One case and one `case.opened` event. DW-c: a second open-case answers 409 OFFER_USED. |
| …with its applicants, representative and pinned release | Met for the principal; see QA-616 | W4/W8: the case page shows the client, the **principal applicant**, the representative of record and **Release 7** (`:142-146`; screenshot `screens/CS-K1/screenshots/j72-W4-case.png`). W8's representative is the signed version's `representative.staff_id` (`:189-191`). |

**Verdict: Works** (updated 00:1x IST 21 Nov). The behaviour behind every part works on main, on screen. It was held short of Works for two reasons, both now cleared:
1. ~~No green walk on GitHub's runners~~: met, runs 44792732814 and 44792924533.
2. ~~QA-616 (Ambiguity · Minor; raised as QA-615, renumbered because #2576 took that id)~~: **answered and closed.** The tech lead (Lead 6, P-294/P-628, on #2577; for the founder's review) ruled that "its applicants" are the people the prospect record holds, and the spouse and dependants are added on the case's own applicants list (AG-07 v3.12). The original point: the front office holds one person per prospect (no spouse or dependant field; grep `api/src/front-office`, the fo_ schema), and open-case carries only `principal` (`prospect-won.ts:203-204`). Family members are added on the case afterwards ("Add spouse or partner", C6.1). If "its applicants" means the people the prospect record holds, the clause is met. If it means the family too, a row is needed. This is the Lead's ruling, or the founder's if the board counts it.

Weak spots the reader named. Neither fails the clause:
* For a Convert win, the card shows "Your firm's representative of record (the retainer names none)" (`web/src/runtime/clients.tsx:233`), and W3 does not assert that line (rep is null, `j_72.ts:168`).
* The pinned-release check looks for "Release 7" anywhere in the case page's text, not in the release field.

## Bugs
* **QA-593 closed** (moved to `history/qa-bugs-closed-2026-11-20-r172.md`): the "Open a case?" screen is built and walked.
* **QA-616** · Ambiguity · Minor (raised as QA-615): does "its applicants" include the spouse and dependants? **Closed as answered** by the tech lead (moved to `history/qa-bugs-closed-2026-11-20-r172.md`).

0 Blocker · 0 Critical · 0 Major · 0 Minor open; 2 closed (QA-593 fixed, QA-616 answered).

## Could not test
* Coverage (c8) and the 400 px replay were not rerun. J-72 itself checks 1024 and 1440 px with no sideways scroll, keyboard only, and axe clean.

## Questions for the Lead
1. Done: Lead 4 dispatched both walks, and they are green.
2. Answered: QA-616, the principal only (the people the prospect record holds). Thank you.

## Suggestions
* J-72: assert the Convert card's representative line, and read the pinned release from its own field (*Later*, *Scaffolding*).
* If QA-616 is answered "family too": capture spouse and dependants on the prospect, carry them in open-case, and walk a case with a spouse and a child (*Needed for the proof* in that case; *Capability*).
* R1.100: per Lead 4, re-prove it when the builder's on-screen sign-up refusal step in `j_100` merges.
