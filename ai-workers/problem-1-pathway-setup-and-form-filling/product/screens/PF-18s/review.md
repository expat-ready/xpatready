# PF-18s part 1 (My account → Offices): independent review

Commit reviewed: **f5a1ea6c40c2a208d0de5009ce749a280c18fa44** (branch `claude/affectionate-cerf-jw9hv7`, PR #2897). Reviewer: a fresh context that did not build it. Spec: `concept-draft.md` + `challenge.md` on `origin/claude/runtime-pf18s-concept` (#2332, Lead 19: 7 Majors as written, part 1 = Offices + the owed PUT + provinces read (M2) + `officeId` on the staff read (m1); Q1 lines stay in My account). Requirement: AG-16-68 (+ AG-16-75 rule 1, AG-1-74 rule 2). Run on isolated copy :4443 (fresh database per run), live AI off, US$0. Journey test: `journey-test-reviewer-2026-11-22.md` (**7/10, below the pass**, after B1 and M1 below).

## Verdict: Rework (Block) for f5a1ea6c. One Blocker, one Major, seven Minors.
My own walk found only Minors. The breaker's report (`break-report.md`, same commit, written in parallel) names **B1** and **M1**. I confirmed both in the code at f5a1ea6c (the working tree had moved on, so not in a browser). Both are open at the commit I reviewed. The fixes claimed in the later commit 90f7f5c38 are **not reviewed here**: that head needs its own round before it can be labelled.

## Blocker and Major (Must)
* **B1 (Blocker): Offices and Team (and Licences, Availability, Types) share one cache entry with different parsers.** `offices-page.tsx:19` uses `queryKey ["pf","staff","list",token]` with `People.parse`, which strips `email`, `roles` and `seats`. `team-page.tsx:22` uses the same key with `StaffList.parse`, which strips `officeId`. If you open Offices and then click Team, Team reads the stripped rows (`team-page.tsx:39-44, 63` `seats.line`, `p.roles.map`): the page goes blank. The other way round, "Who works where" shows "No office" for people who are placed until a reload, and Save is disabled for taking them out. The first breaks an existing screen one click away; the second shows wrong data on this part's own fact. Fix: give the key its own name (e.g. `["pf","staff","offices",token]`), or parse one shared shape. Add a browser check that goes Offices → Team → Offices by client navigation.
* **M1 (Major): after a province, choosing "Your firm's time zone" saves the province's zone, and the audit says `province`.** The option's value is `""` (`office-panel.tsx:17, 89`). `:43` sends `timeZone` only `if f.zoneTouched && f.zone`, so the explicit choice is dropped and the server pre-fills from the province again. This breaks challenge M2 (the person confirms or edits the zone, AG-16-75 §10) and the build notes' "chosen when picked". Fix: do not offer the firm option while a province gives a zone, or send the firm's zone explicitly. Add a test that fails on the old line.

## Concept fit (part 1's share)
* **M1 met:** menu line and page keyed `agent/settings:edit` (`account-sections.ts:14`, `offices-contract.ts:24`); Case Officer: no line, refusal in words by address, provinces/PUT/staff read 403 (J5). One office: no list, no zone, only "Add an office" and its line (J3, AG-16-68 "hidden until a second office exists").
* **M2 met for Canada:** `GET offices/provinces` from `zones.ts` only (`routes.ts:20-21`); zone pre-filled on province pick before saving, editable, `timeZone` sent only when picked (audit `province` vs `chosen`, builder DW3 + my J1). Codes, no typed names (challenge rule). Outside Canada the option reads "Your firm's time zone" without naming it (m-1 below).
* **Owed PUT met:** `PUT /api/platform/staff/:staffId/office`, strict body, id checked first, `agent/staff:manage` (challenge m1's choice, recorded), 404 for another firm's person/office/bad id, 422 extra field, no-change writes nothing (`service.ts:165`), last-wins without version recorded in build notes (STANDARDS §4 reason given).
* **m1 met:** `officeId` on `GET /api/platform/staff` rows (`staff-read/service.ts:17, 39`), no new route. **m5 met:** right panel. **m8 met:** "In Settings: Advanced → Offices".
* **States:** empty (one office teaches Add), loading (text status, the PF-6 pages' pattern), normal, long content (118-char name), error on field + summary, read-only (refusal says why), conflict (409 loads latest). 375 px "tables become stacked rows" not done (m-3).

## Minors (ranked; Should)
1. **m-1 Outside Canada the zone is not shown before saving.** A London office saves on America/Toronto; the panel only says "Your firm's time zone" (`office-panel.tsx:87-90`; build-notes deviation). Fix: name the zone in the option ("Your firm's time zone (America/Toronto)"), e.g. from the first office row when two exist, or record it as a follow-up row.
2. **m-2 Error words below EXPERIENCE §2.10 / BIC-13.** "a country code on the ISO list" (`api/src/platform/settings/offices/service.ts:30`) is a fragment; "This is required." alone (`api/src/platform/http/input.ts:40-42`); duplicate name shown only in the summary, not on Office name (`office-panel.tsx:61`; the 409 has no `fields`). Fix: "Enter a two-letter country code, for example GB"; "Enter the office's name"; map the duplicate to `errors.name`.
3. **m-3 Narrow widths squeeze tables.** At 400 px and 200 % zoom names break mid-word ("immigratio n firm"); at 1024 px hours wrap to three lines (`offices-page.tsx:127-133`; reviewer screenshot `review-4-1024-at-200pct`). No sideways scroll, so not an [M] break. Fix: stacked rows below ~640 px as concept §4 says; `whitespace-nowrap` on hours.
4. **m-4 Flaky check.** `check_pf18s_offices_browser.ts:101-103` failed 1 of 3 fresh runs (`backOnAdd:false`); my walk saw focus return every time. Fix: wait for focus (`expect.poll`/`waitForFunction`) after the dialog detaches.
5. **m-5 Focus after a failed save** lands on the panel, not the summary or first bad field (Notice is `role="alert"`, so it is announced). Fix: focus the summary.
6. **m-6 Stale title after 409:** panel says "Edit Calgary" while "Calgary downtown" is loaded (`office-panel.tsx:68`). Fix: title from the loaded form/version.
7. **m-7 Owed PUT tests sit in the browser check,** not the API suite the owed line named; they run on real PostgreSQL with pass/fail pairs, so coverage is real, but the graph cannot see them (below). Fix: none needed beyond the graph note, or mirror the 6 API cases into `check_pf18a_offices`.

## Graph (P-86)
`graph.mjs`: G1 0, G2 0. G3 lists `GET /platform/offices/provinces`, `PATCH /platform/offices/:id`, `PUT /platform/staff/:staffId/office` as "no test reaches … no page uses it". Checked by hand: false positives of the tool, which matches only `api(` web calls, `call("M", …)` test calls and App.tsx routes, while the platform module uses `staffApi(` and module routes and this test uses `api(t, "M", …)`. All three are exercised (DW1, DW3, DW5, DW6) and used by `/platform/offices`. Every element serves this screen's capability (R1.92 "office times shown in each office's zone": the Case Officer's needs-you zone becomes America/Edmonton after placement, J7). No scaffolding on the demo path (P-33).

## Code (STANDARDS [M])
Server authorisation on all three new/changed routes, deny by default (met). Concurrency: office change versioned (409); placement under the firm's advisory lock, last-wins accepted with reason (met). Duplicates under race: double click on Add office and on placement Save → one office, one audit line (met; `sending` ref + server name check). Client cache: one key shared by two parsers (B1, not met). Migrations: none. Field errors: 422 `fields` on each field (met, m-2 wording). No per-row requests: one staff read, one offices read, one provinces read per view (met; the staff read's existing per-person two-step call is PF-6's, challenge m1 accepted it). Strict types, no new `any`, contract parsed at the edge (`offices-contract.ts`), module-card rows present, comments cite decisions (met). "A rule's test fails when the rule is removed": reasoned, not mutated (I may not edit code): removing the no-change guard turns DW6's audit count 2 → 3; keying the menu `settings:list` fails DW1; always sending `timeZone` fails DW3's `province` audit; removing the PUT's key fails DW6's 403. Retrofit mapping: the team's code is Mac-only, so, as in the challenge, Unverified.

## D1–D20 (1–5)
| D | Score | Evidence |
|---|---|---|
| D1 | 3 | AG-16-68 hide-until-second, M1 and the owed PUT behave; challenge M2 broken on the firm-zone path (M1) |
| D2 | 3 | Duplicate refused; another firm 404; stale 409; double clicks write once; but a zone other than the one chosen is saved (M1) |
| D3 | 5 | Reuses `allZones`, the staff read, `Panel`/`Table`; provinces only from the pack |
| D4 | N/A | No dependent questions or rules on this page |
| D5 | 2 | Moving Offices → Team blanks Team until a reload (B1); one flaky check (m-4) |
| D6 | 4 | Every add, change, placement audited with from/to and zone origin; no-change no line |
| D7 | N/A | No AI |
| D8 | 4 | "My account › Offices" + "In Settings: Advanced → Offices" |
| D9 | 4 | Add 3 steps; place 3 clicks; unplaced notice points to the next step |
| D10 | 3 | Codes and IANA ids (accepted gaps); error fragments (m-2) |
| D11 | 3 | Toasts name the zone; busy; refusal and 409 in words; stale "No office" rows after Team (B1) |
| D12 | 4 | Team look; mid-word breaks at 200 % (m-3) |
| D13 | 4 | axe clean every state; keyboard path; focus ring; 1024 px and 200 % no sideways scroll |
| D14 | 4 | Team components and words; PF-6 frame unchanged |
| D15 | 5 | 133 ms open, 125 ms add → list (local copy) |
| D16 | 3 | 25 pass/fail checks on real PostgreSQL, but none catches B1 or M1; 24/25 then 25/25 twice; graph blind spot |
| D17 | — | Simulated only |
| D18 | 3 | "Pre-filled from AB", "First office"; the audit says `province` for a person's firm-zone choice (M1) |
| D19 | — | Not yet evidenced (part 1 of 3); the hand-off to the person's zone holds (J7) |
| D20 | — | Simulated only |

## Scorecard (EXPERIENCE §6; not case-side, concept §4c)
BIC-11 Met (one filled button per page and panel: "Add an office", "Add office", "Save") · BIC-13 Partly (field + summary, input kept; m-2, m-5) · BIC-14 Met (no icon-only buttons or chips; "Edit"/"Change" carry full accessible names) · BIC-18 Met (states above; never "no records" before data) · BIC-19 Met (one heading per panel, red only for errors, orange only for the unplaced notice) · BIC-20 Met (keyboard, 200 %, headings h1 → h2) · BIC-04 Partly (Province and Time zone are optional but not marked "(optional)") · BIC-01–03, 05–10, 12, 15–17 N/A (no facts, AI, filing, review or roles here). Evidence: builder screenshots `pf18s-5-offices-list-1440.png`, `pf18s-7-offices-1024.png`; reviewer walk J1–J8.

## Could not check
A real screen reader; an intended user's walk (D17, D20: the founder); an Admin persona (none in the Sample firm); the team's code (retrofit). I restored one tracked screenshot that the builder's check rewrote during my runs. An untracked `break-report.md` in this folder is not mine.

**Verdict: Block** (commit f5a1ea6c40c2a208d0de5009ce749a280c18fa44). To fix: **Blocker** B1 (the shared staff-list cache key); **Major** M1 (the firm-zone choice dropped after a province); **Minor** m-1 to m-7 (fix or list as follow-ups). Re-review the new head (90f7f5c38 or later) before labelling.

Reviewer: Block f5a1ea6c40c2a208d0de5009ce749a280c18fa44
