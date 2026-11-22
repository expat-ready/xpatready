# PF-18s part 3 (My account → Notifications): journey test, reviewer role, 2026-11-22

Commit: dc04e9a7f792ed52a86ae73a379b4a964519759b (code identical at d78d78fe7). Isolated copy pf18snr :4446, fresh database, `AI_LIVE=off PLATFORM_IDENTITY=local`, stopped after. US$0. Never :4400. Sample firm `sample-firm`: Case Officer (user-O), Representative with Owner + Case Manager (user-R).

## Journeys (written from board A, challenge m2/m3, before the walk)
1. **Main (Case Officer):** "I don't want emails for mentions." Home → My account → Notifications → untick Email for Mentions → Save → reload. Expect: toast, one saved row, still off after reload.
2. **Alternate (Owner):** sees all 8 groups incl. Team watch, Payments, Firm and connections.
3. **Empty/default:** first visit, every row says "Default", Save disabled, leaving does not ask.
4. **Error, refusal:** server refuses (422) → its words, change kept, nothing written.
5. **Error, network:** Save fails → "Your changes are still here; try again."; load fails → Try again.
6. **Conflict (second tab):** another tab saved first → 409 words, latest loaded, my change on top, next Save goes.
7. **Recovery:** double click Save → one PUT; reload mid-edit asks (beforeunload).
8. **Wrong role / role change:** a group that stops reaching me while the page is open.
9. **Keyboard, 1024 px, 200 % zoom, 375 px.**
10. **Across the boundary:** the menu line leads in; leaving with unsaved changes asks; the bell (PF-18ns) is Not built.

## What held
* Builder's check `tests/check_pf18s_notifications_browser.ts` run twice: **31/31, exit 0** both times (~14 s), no flake. Covers journeys 1-7, 9 with DB reads and axe on 5 states + 3 widths.
* My walk (own Playwright script, scratch only; screenshots r1-r6 kept outside the repo):
  * J1 menu line visible, `aria-current="page"`, crumb "My account › Notifications"; open 91 ms; Save 93 ms; DB `MENTIONS|t|f` only.
  * J2 keyboard: 11 Tabs from the top to the first checkbox (frame → menu → table), visible outline, Space toggles, hint "1 unsaved change. Changes apply when you press Save."
  * J3 1024 px and 200 % zoom (720 css px at 2x): no sideways scroll; menu becomes a top row.
  * B4 slow GET (1.5 s): "Loading your notification settings…" as a status line.

## Findings (all Minor; detail and fixes in `review-part3.md`)
* B1 409 then the re-read fails: text says "We've loaded the latest" but old values stay; one more Save needed (`notifications-page.tsx:58-60`).
* B2 overlay is per group: another tab's In app change on a group I changed (Email) is shown and re-saved as my old In app value (`notifications-contract.ts:27-30`). Matches challenge m2 literally.
* B3 role removed while open: 422 lists "FIRM_AND_CONNECTIONS cannot reach you" (raw code) and every Save fails until a manual reload.
* J1 after a successful Save focus falls to `<body>`.
* Billing role's Payments leg not walked (no Sample Billing user).

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 + DN2: saved, reload keeps it, DB one row |
| Next step obvious | 1 | Save disabled until a change; hint "Changes apply when you press Save"; one primary |
| Plain words | ½ | §5 copy exact; raw `FIRM_AND_CONNECTIONS` in the B3 refusal |
| Feedback and state | 1 | unsaved count, Default tags, toast, busy Save, conflict/refusal notices (n3, n4) |
| Correct data | 1 | only changed groups written; stale saves 409, nothing written (DN3, API line); B2 writes what is on screen |
| Error recovery | ½ | 409, 422, failed send, failed load all keep edits; B1 misstates, B3 has no way forward without reload |
| Accessibility and sizes | ½ | axe clean on every state, 375/1024/1440, 200 % zoom, keyboard path; focus lost after Save |
| Speed | 1 | 91 ms open, 93 ms save |
| Visual quality | 1 | aligned matrix, team look (r1, n1, n7-1024) |
| Trust and sources | 1 | no AI; "Default" shows where each value comes from; security row says Always on |
| **Total** | **8.5 / 10** | **Pass** (≥ 8, no 0) |

To raise it, most valuable first: honest 409 text when the re-read fails and a 422 path that re-reads (error recovery, plain words); focus after Save (accessibility).

## Could not test
A real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); a Billing role; two different people (the route is `me`-only, so no cross-person case exists).

## Round 2 (22 Nov, b2154d65c, diff-only)
Copy pf18snr :4446, check 40/40, then a scratch probe of the fixed paths (Case Officer user-O, Owner user-R for the role change).
* **P1 keyboard Save, PUT held 800 ms:** focus stays on Save ("Saving…", aria-disabled); Enter + Enter + Space → 1 PUT; after → heading; toast. Held.
* **P5 two tabs, same group, other box:** other tab Needs you in-app off, I untick Email → 409 notice (focused), row shows off/off, Save writes off/off. Held (per box).
* **P3 leave and come back:** other tab changes My deadlines while I am on another page; Back shows the new value, Save disabled. Held.
* **P2 role change, only the removed group changed:** notice names Payments by label, Save disabled, focus on notice; text ends "it already matches your changes", which is untrue (review r2-m1).
* **DN8 role change with another change:** Payments dropped, Mentions kept, next Save 200. Held.
* **P7 role restored while open:** next Save's answer brings Payments back. Held.

| Criterion | R1 | R2 | Evidence |
|---|---|---|---|
| Task completed | 1 | 1 | DN2, P1 |
| Next step obvious | 1 | 1 | one Save, hint, "nothing left to save" when so |
| Plain words | ½ | ½ | raw code gone; P2 sentence contradicts itself (r2-m1) |
| Feedback and state | 1 | 1 | "Saving…", notices, toast |
| Correct data | 1 | 1 | per-box overlay (P5), nothing written for a dropped group (DN8) |
| Error recovery | ½ | 1 | 409, 422 role change, failed re-read ("reload the page") all leave a way forward |
| Accessibility and sizes | ½ | 1 | focus kept while sending and on the heading after; axe clean 375/1024/1440 |
| Speed | 1 | 1 | unchanged paths; one extra GET only on 409/422 |
| Visual quality | 1 | 1 | busy Save grey without spinner (nit) |
| Trust and sources | 1 | 1 | unchanged |
| **Total** | 8.5 | **9.5 / 10** | **Pass** (≥ 8, no 0) |

Could not test: a real screen reader; an intended user's unaided walk (D17, D20); a Billing role.
