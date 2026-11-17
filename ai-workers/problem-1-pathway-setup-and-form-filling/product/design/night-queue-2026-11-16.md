# Night queue for the lane-starter routines (Lead 70, 22:1x IST 16 Nov; founder approved "Yes, 3 routines" at 22:1x)

Three hourly cloud routines ("lane starter 1-3", at :05, :25 and :45 UTC past each hour) read this file from branch `lead/2026-11-07-lead31`. **Test 0, before anything else (CI brake, Lead 70, 23:1x IST):** count Actions runs waiting for a machine (`repos/<owner>/<name>/actions/runs?status=queued&per_page=1`, its `total_count`). Over 30: reply "CI busy" and stop; change nothing. Each run takes the **first row from the top** that passes all three tests, then builds it to a labelled PR:
1. **Gate:** every item in "After" is merged: a `#n` is a merged PR; a row id is merged when a merged PR's title contains that id (and that part) (the GitHub pulls API for this repository, `repos/<owner>/<name>/pulls/<n>` with owner/name from `git remote get-url origin`, shows `"merged": true`).
2. **Not taken:** no open PR title contains the row id, and no branch `claim/<row id>` exists (`git ls-remote origin "refs/heads/claim/*"`).
3. **Claimed:** `git push origin origin/main:refs/heads/claim/<row id>` succeeds. If it fails, someone else took the row: go to the next one.

**CI rule for every run (Lead 70, 22:5x IST; 68 runs were queued):** open the PR as a **draft**, and mark it ready only after the reviewer approves the head, so there is one full ci run per row. **Network rule (Lead 70, 23:4x IST):** never ask for a network or environment change and never wait on one. If a needed public page is blocked, write "Not verified: <site> blocked on the cloud network" in the PR or concept, use what the repository already holds, and go on. Only the tech lead edits this file. Build Leads send rows to the Lead; the Lead adds them here at each check. Rows that a warm lane takes as its second brief are not listed here.

| Row id | Area | Brief (branch:path under product/design/) | After | Effort, breaker |
|---|---|---|---|---|
| QA-498q | runtime | lead-b-front-office:lead-b-briefs/QA-498q.md (one file, tools/run-suites.sh: check_bk5_start_browser.cjs on QUARANTINE with the QA-498 comment; Lead 71 ruling 17 Nov) — **first: it unblocks #2021**; "Ready for Lead read"; the Lead labels, lands ahead (P-214) | — | medium, no |
| QA-498 | runtime | lead-b-front-office:lead-b-briefs/QA-498.md (root cause first, never loosen BR-6, 5 green runs alone and after shard 1's order, takes the suite off QUARANTINE) | QA-498q merged | high, no |
| PF-12b part 1 | runtime | lead-b-front-office:lead-b-briefs/PF-12b.md (QA-499: every bypass use that crosses firms writes one platform.bypass audit_event row per firm it touches, in that firm's transaction, or is refused; adds an `audit` field to every BYPASS_USES entry) — **first: it frees R1.4 to be proven** | — | high, yes |
| FO-9b part 0 | runtime | main:lead-b-briefs/FO-9b.md (port only) | — | high, no |
| PF-21b part 1 | runtime | main:lead-b-briefs/PF-21b.md (port only) | — | high, no |
| PF-Fp part 1 | runtime | lead-b-front-office:lead-b-briefs/P-630-amendments.md PF-Fp row + tech-gate-platform-front-office-2026-11-14.md entry 17 (toPdf port, fake, Gotenberg adapter; the container line comes with PF-8) | — | high, yes; shared port: "Ready for Lead read" |
| AUD-4s part 1 | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/AUD-4s-1.md (concept records, with a fresh challenger) | — | medium, no |
| FO-6 | runtime | lead-b-front-office:lead-b-briefs/FO-6.md | — | medium, no |
| PF-19e | runtime | lead-b-front-office:lead-b-briefs/PF-19e.md | #1956, #1961, #2029 (messages/send/messages.ts) | medium, no |
| AUD-1b | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/AUD-1b.md | #2003 | high, yes (audit) |
| CS-DL1b | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/CS-DL1b.md | #2000 | medium, no |
| PF-12b part 2 | runtime | lead-b-front-office:lead-b-briefs/PF-12b.md (the 7 own-firm doors move to narrow xr_wall_reader definer lookups); never beside PF-4c part 1, PF-6m2, PF-4pc or PF-4s (skip while an open PR names one) | PF-12b part 1 | high, yes; migration: "Ready for Lead read" |
| CS-NK1 | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/CS-NK1.md (commit ac54fe014; bug F2 from #2017's breaker) | #2017 (one builder at a time on the schema, P-438b) | high, yes; schema: "Ready for Lead read" |
| AUD-1c part 1 | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/AUD-1c-1.md (may run beside AUD-1b) | #2003 | high, yes; schema: "Ready for Lead read" |
| PF-6 part 2a | runtime | lead-b-front-office:lead-b-briefs/PF-6p2.md | #1945 merged 03:37 IST: free now (touch lists checked by Build Lead A; PF-4c part 1 merges main on a MODULE.md conflict, P-270) | high, yes |
| PF-6m2 | runtime | lead-b-front-office:lead-b-briefs/PF-6m2.md | #1945 merged 03:37 IST: free now (touch lists checked by Build Lead A; PF-4c part 1 merges main on a MODULE.md conflict, P-270) | high, yes |
| PF-4c part 1 | runtime | main:lead-b-briefs/PF-4c.md | #1945 merged 03:37 IST: free now (touch lists checked by Build Lead A; PF-4c part 1 merges main on a MODULE.md conflict, P-270) | high, yes |
| PF-4dn | runtime | lead-b-front-office:lead-b-briefs/PF-4dn.md (invite carries an optional displayName, AG-01 §3.2) | #2044; never beside PF-4c part 1 or PF-6m2 (identity) | medium, no |
| PF-11 part 1 | runtime | main:lead-b-briefs/PF-11.md + the corrections in #1972 comment 6916991708 | #1959 | high, yes; migration: "Ready for Lead read" |
| FO-3a part 1b | runtime | main:lead-b-briefs/FO-3a.md + lead-b-front-office:lead-b-briefs/P-626-order.md A2 | #1918 | high, no |
| FO-3a part 2a | runtime | lead-b-front-office:lead-b-briefs/FO-3a2.md (may run beside 1b) | #1918 | high, no |
| FO-3vr | runtime | main:lead-b-briefs/FO-3vr.md | #1918, FO-3a part 1b | high, yes |
| FO-3st2 | runtime | main:lead-b-briefs/FO-3st2.md + lead-b-front-office:lead-b-briefs/P-626-order.md A3 | FO-3a part 1b | high, no |
| FO-3st3 | runtime | main:lead-b-briefs/FO-3st3.md + lead-b-front-office:lead-b-briefs/P-626-order.md A3 | FO-3a part 1b | high, no |
| FO-3v part 1 | runtime | main:lead-b-briefs/FO-3v.md | #1918, FO-3a part 1b, FO-3vr | high, no |
| FO-3c part 1 | runtime | main:lead-b-briefs/FO-3c.md + P-627-amendments.md FO-3c block; never beside FO-5b or FO-5p (skip while an open PR names either) | FO-3a part 1b | high, no |
| FO-5cr | runtime | lead-b-front-office:lead-b-briefs/P-626-order.md "New row FO-5cr" | FO-3a part 2a | high, no |
| PF-15 part 1 | runtime | main:lead-b-briefs/PF-15.md | #1997, PF-4c part 1 | high, yes |
| PF-19c part 1 | runtime | main:lead-b-briefs/PF-19c.md + P-630-amendments.md PF-19c block | #1956, #1961, PF-19e, PF-13 part 1 | high, no |
| PF-19ad | runtime | main:lead-b-briefs/PF-19ad.md | PF-19c part 1 | high, no |
| BK-21 | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/BK-21.md (QA-397, R1.77; reads the pinned release's snapshot.combination.portal; check_qa397 5/5). **Lead 71 names this lane the `case-prepare.ts` holder (P-438b)**; walk-2 condition met (BK-25, BK-26 on main) | — | medium, no |
| AS-1m | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/AS-1m.md (R1.106) | #2007 and CS-V1 part 2 merged (both touch api/src/assessments.ts) | medium, no |
| AS-1g | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/AS-1g.md (R1.106; schema) | #2017 merged, then the Lead names it the configurator schema-baton holder; never with CS-NK1 | high, yes; schema: "Ready for Lead read" |
| AS-1s | engine | claude/build-lead-c-647b40:build-lead-c-briefs/AS-1s.md (R1.106; pure rules) | AS-1m and AS-1g merged | high, no |
| AS-1c | data | claude/build-lead-c-647b40:build-lead-c-briefs/AS-1c.md (R1.106; P-650: gates and grids added to the existing Express Entry combination; forms, answer sheet, hard stop byte-equal) | AS-1g and AS-1s merged | high, no; reviewer checks every citation |
| AS-2e | engine | claude/build-lead-c-647b40:build-lead-c-briefs/AS-2e.md (gates-only stream, no score line; migration) | AS-1s and AS-1g merged, then the Lead names the schema baton; never with AS-1c or CS-NK1 | high, no; Lead reads the migration |
| AS-2d1 | data | claude/build-lead-c-647b40:build-lead-c-briefs/AS-2d1.md (Ontario, BC) | AS-2e merged and the founder's streams card (P-607 (9)) | high, no |
| AS-2d2 | data | claude/build-lead-c-647b40:build-lead-c-briefs/AS-2d2.md (Alberta, Saskatchewan, Manitoba) | AS-2e merged and the founder's streams card | high, no |
| QA-53k | forms (tests only) | inline (Lead 72, 07:3x IST 17 Nov, on #2035's root cause, comment 6935433301): `tests/check_forms_qa53.ts` starts its firm copy with `execFileSync` (line ~125), which blocks the event loop while the main copy's keep-alive socket idles out, so the next request gets `SocketError: other side closed`. Fix in the test only: start the copy without blocking (or open a fresh connection for the first request after it); no app code. **Done when** the suite passes 5 runs in a row alone and in shard 1's order, and it comes off the B122 automatic quarantine (owner forms, due back 23 Nov) | — | medium, no |
| PF-5tv | runtime | lead-b-front-office:lead-b-briefs/PF-5tv.md (one rule for the current terms at sign-up and at the gate: one shared exported read ordered `published_at desc, version desc, id desc`; no migration; evidence #1957 body point 3; Build Lead A, 08:5x IST 17 Nov, added by Lead 74) | #2029 (signup.ts); never beside PF-12b part 2 (skip while an open PR names it) | medium, no |

Chains on shared files run one after another, never side by side (Build Lead A, rev 16.80): booking/service.ts: FO-3a part 1b → FO-3vr → FO-3v; the messages files: PF-19e → PF-13 part 1 → PF-19c → PF-19ad. Sources: Build Lead A rev 16.80 (1671fb76e), Build Lead C 93004803b, 22:2x IST 16 Nov.

Removed 22:3x (Lead 70): CS-V1-2. The CS-V1 lane (#2007) takes it warm after #2007 merges, once Build Lead C confirms the scope.


Held 08:4x IST 17 Nov (Lead 73; WIP P-623, Build Lead C 7f471e8b0: the case side has R1.80 and R1.77 waiting for qa since 04:00 IST): CS-W3 part 0 comes back when qa clears one of them. CS-DL1b (part 2 of the started CS-DL1) and CS-NK1 (bug F2 from #2017's breaker) went back into the table at 08:5x (Build Lead C 0e1330cc3: parts of started rows and bug fixes carry on, P-606, P-623). CS-S1 part 1 removed: taken (#2035, in Mergify batch #2061). The rows, word for word:
| CS-W3 part 0 | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/CS-W3-0.md (records-only spike on a scratch copy) | — | medium, no |
| CS-S1 part 1 | runtime | claude/build-lead-c-647b40:build-lead-c-briefs/CS-S1-1.md | — ; **skip this row if #2002 (CS-C1b) is merged** (WIP P-623) | high, yes; schema: "Ready for Lead read" |