# MVP checklist: what we are tracking toward the first real firm

**What this page is.** One checklist that answers "what are we tracking toward the MVP?": (A) every capability in the agreed scope and where it stands, (B) what "done" means for one row, (C) what must be true before the first real firm's data goes in.
**Where the numbers come from.** Scope: the capability map, draft 6 (baseline P-586: 112 rows, Build 101, Optional 8, Held 3). Rows that build it: `BACKLOG.md`, section "Full MVP: platform (PF) and front office (FO)" (rev 14.1) and the Bake rows (BK-). Proof: `qa/CAPABILITIES.md` on `main` 4eec4ed2 (93 of 98 Works; M2 60/60, M3 27/29, T 6/8). Open pull requests: GitHub API, read 12:3x IST. Launch conditions: `RULES.md` (as of P-590).
**Date.** 14 Nov 2026, 12:3x IST. **The one tracking page for Release 1 (P-592, founder 15:1x IST 14 Nov)**: the Lead updates the status column at each records pass; a row reaches qa Works only from a qa verdict on an `R1` capability in `qa/CAPABILITIES.md`.
**Refreshed 20 Nov 2026 (records refresh: qa's verdicts carried into the status column).** Source: `qa/CAPABILITIES.md` on `main` 4c6fd7078 (qa #2415), compared with its state on `main` c1310f4c5 (16 Nov 21:15 IST, this page's last refresh). Every R1 verdict qa recorded or changed since then is carried: a qa Works verdict sets the row to qa Works; a Partial verdict is added to the row's status with the parts qa names as missing, and the row keeps its own status (least advanced part) unless qa says its last part is merged; an open Major keeps a row out of qa Works (P-488, P-305 (3)). Rows qa re-confirmed as Not built with no part merged (1, 21, 22, 23, 34, 35, 36, 39, 43, 45, 46, 50, 52, 57, 60, 62, 64, 65, 66, 68, 69, 70, 75, 76, 79, 86, 87, 88, 89, 91, 95, 96, 97, 107, 111, 112; qa wave 0 re-scores of 18 Nov on main 15c75cd52, commits 9af718751 (#2136, sections A-F) and 361a0f49f (#2131, sections G-L), carried forward 19 Nov on main 4c47c1bad, 36805794c (#2160); row 21 also re-confirmed 16 Nov, 6b81a55e1 (#1950)) keep their status unchanged. Counts below are a tally of the Status column of the 101 Build rows in this section by its first word(s): qa Works 17, Merged 6, In PR 0, Shaped 78, Not shaped 0. Also on qa's register since 16 Nov 21:15 IST: C8.2 and C11.6 to Works on the checkpoint (18 Nov, 4e011d3f0, #2121), C7.2 to Works (19 Nov, 50f63c165, #2291), C9.5 Works re-confirmed (17 Nov, 432d81566, #2117).

---

## A. Scope to build (from the map)

**How a row's status is set.** *Not shaped*: no BACKLOG row with a Done when for all of it (a row that is only named counts here). *Shaped*: every part has a BACKLOG row with a Done when. *In PR*: every part has an open pull request. *Merged*: built on `main`, not yet Works. *qa Works*: qa's independent Works verdict on `main`. **A row takes the status of its least advanced part**; the line names the parts that are further on. \* = proven in the reference app for the one Sample firm; the work to make it run for many firms is in map row 3 (walls) and has no row of its own yet.

**Counts (101 Build rows; P-842 adds rows 113-121 on 25 Nov, so 110 in all; the table below counts the first 101):**

| Status | Rows |
|---|---|
| qa Works\* | 17 (was 9 until 20 Nov: 2, 9, 99 added by Lead 59, 15 Nov 16:3x IST on qa #1833 and P-616; 20 Nov refresh adds 6, 28, 37, 41, 67, 77, 80, 109 from qa's Works verdicts recorded 19-20 Nov, each row cites its qa commit and PR) |
| Merged | 6 (20 Nov refresh: 80 to qa Works (qa #2291); 33 moved up from Shaped, qa naming its last part FO-9a phone #2268 merged (qa #2392). Before: 2 and 9 to qa Works, 16:3x; 9, 38, 40 moved up by Lead 59, 15 Nov 15:5x IST: their one part each merged, PF-14 #1757, FO-3 #1760; 74, 76 and 77 moved back to Shaped: each gained a new part, CS-DL1, CS-NT1, CS-C1) |
| In PR (the whole row) | 0 (6 rows have a part in PR: 5, 6, 27, 29, 37, 41, through #1741, #1742, #1744; open pull requests not re-read in the 20 Nov refresh) |
| Shaped | 78 (was 86 until 20 Nov: 6, 28, 37, 41, 67, 77, 109 to qa Works; 33 to Merged) |
| Not shaped | 0 |

Module names follow P-575 and P-584: **Platform** (sign-in, firms, billing, messages, automation, portal login, complaints), **Front office** (leads, booking, retainers, signing, compliance checks), **Client money**, **Case side** (the release Lead's: cases, documents, forms, the configurator), **Audit**.

### A. Foundations
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 1 | Hosting, data, backups and logs in Canada | Platform (running it) | PF-7 merged; PF-8a, PF-8b, PF-8c; PF-23c | Shaped (deploy waits on the founder's AWS account) |
| 2 | Database | Platform | PF-3 (#1728); R1.2 Works (qa #1833, gate A by API, P-616) | qa Works |
| 3 | Walls between firms | Platform + case side | PF-12; case-side tables: CS-W1, CS-W2, CS-W3, CS-W4 | Shaped · qa R1.3 Partial (was Not built), 19 Nov, main 34c5e1e99: CS-W1 part 1 #2125 merged; parts missing CS-W2, CS-W3, CS-W4 (qa commit c0a0e30ef, #2166) |
| 4 | Each query runs inside its firm | Platform | PF-12 | Shaped · qa R1.4 Partial (was Not built), 16 Nov, main d66bcfd2d: held by QA-499 (Gap, Major: a bypass use writes no audit line; the fix PF-12b #2029 not merged on 19 Nov); qa commit 74f909c9d, #1999; carried forward 19 Nov on main 4c47c1bad (36805794c, #2160) |
| 5 | Staff sign-in with two-step, passkeys, lock-out on leaving | Platform | PF-4 (In PR #1744), PF-4b, PF-4s | Shaped |
| 6 | Permissions: deny by default, own versus all, money and licence apart | Platform | PF-4 (In PR #1744), PF-6 | qa Works (was Shaped until 19 Nov: qa R1.6 Works on main c600f2150, 19 Nov 08:0x IST, last part J-6 part 2 #2172; j_6 63/63 twice on GitHub, runs 44444740569 and 44444754316; fresh reader Works; open on it: Minors only; qa commit 050c068dd, on main with #2205) |
| 8 | Audit trail nobody can edit | Audit | AUD-1a, AUD-1b, AUD-1m | Shaped · qa R1.8 Partial (was Not built), 19 Nov, main 00378b402: AUD-1a #2003 and AUD-1b #2124 merged; parts missing AUD-1m parts 1, 2a, 2b and J-8 (qa commit fd97de3e0, #2213) |
| 9 | Background jobs, schedules, reminders | Platform | PF-14 (#1757); R1.9 Works (qa #1833, gate A by API, P-616) | qa Works |
| 10 | Checking every input | All | PF-28 (PF/FO); CS-V1 (case side) | Shaped · qa R1.10 Partial (was Not built), 18 Nov, main 15c75cd52: CS-V1 parts 1-2 (#2007, #2042) and PF-0bp #2087 merged; parts missing PF-28, CS-V1 parts 3a and 3b (qa commit 9af718751, #2136; carried forward 19 Nov, #2160) |
| 11 | Server framework | Platform | PF-7 | Merged |
| 12 | Screen framework, one UI kit | Platform | PF-1 | Merged |
| 13 | Logs, metrics, error reports, alerts | Platform (running it) | PF-23 merged; PF-23r, PF-23m, PF-23c, PF-23w | Shaped · qa R1.13 Partial (unchanged), 18 Nov, main 15c75cd52: PF-23r #1812 and PF-23w #1800 merged; parts missing PF-23m, PF-23c (qa commit 9af718751, #2136) |
| 14 | Backups with a tested restore | Platform (running it) | PF-8r, PF-8rc | Shaped (the cloud drill waits on the founder's AWS account) · qa R1.14 Partial (was Not built), 19 Nov: the restore drill ran green on GitHub (nightly 44412299740, `check_pf8r_restore.ts` 10/10, main 2ad701363); part missing PF-8rc, the cloud drill (qa commit 24b897a64, #2193) |
| 15 | Secrets in a managed store | Platform (running it) | PF-24 merged; PF-24w; the cloud half in PF-8b | Shaped |
| 16 | Automated testing | Platform | PF-7 | Merged |

### B. The firm as our customer (self-serve SaaS)
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 19 | A firm is created once, with plan, trial and owner | Platform | PF-3 merged; PF-5; PF-5s (sign-up screens; qa #1950, Lead 66) | Shaped · qa R1.19 Partial (unchanged), re-run 16 Nov 19:5x IST on main 39d4c831b: QA-484 closed by PF-5v part 1 #1955; QA-481, PF-5s and the trial end still hold it (qa commit 6b81a55e1, #1950) |
| 20 | One entitlement check; seat and plan limits; downgrade check; invite many at once | Platform | PF-5, PF-15, PF-4c, PF-6 | Shaped · qa R1.20 Partial (was Not built), 19 Nov, main 00378b402: PF-4c part 1 and PF-15 part 1a #2130 merged (API only); parts missing the rest of PF-15, PF-4c part 2, the Invite screen's batch (PF-6) (qa commit fd97de3e0, #2213) |
| 21 | Our own invoices with sales tax | Platform | PF-5 (Stripe Tax) | Shaped |
| 22 | Suspend, cancel, failed-payment hold, data download on exit | Platform | PF-5; PF-11, PF-11s, PF-27, PF-11c | Shaped |
| 23 | Firm logo, colour, sender name, favicon, banner | Platform | PF-13 | Shaped |
| 24 | Each firm's own web address | Platform | PF-25 merged; PF-25w; wildcard DNS and certificate in PF-8b | Shaped |
| 89 | Public pricing page | Platform | PF-5s | Shaped |
| 90 | Self-serve sign-up, email check, trial with no card, private links, trial banners | Platform | PF-5, PF-5s, PF-16 | Shaped · qa R1.90 Partial (was Not built), 18 Nov, main 15c75cd52: sign-up API (PF-5 part 1 #1815) and sign-up email (PF-5v part 1 #1955) merged, API only; parts missing PF-5 part 2, PF-5s, PF-16 (qa commit 9af718751, #2136) |
| 91 | Plans, change, cancel, invoices, card update, yearly plans, refunds, billing emails | Platform | PF-5, PF-5s, PF-16 | Shaped |
| 92 | Firm profile, offices and time zones, licence-number check | Platform | PF-5s, PF-18a, PF-18s, PF-4c | Shaped · qa R1.92 Partial (was Not built), 19 Nov, main 628742f00: PF-18a part 1 #2009 merged, API gate A passed; parts missing PF-18a part 2, PF-18s, PF-4c part 2, PF-5s (qa commit 24b897a64, #2193) |
| 93 | Our team's console; health per firm; support button | Platform | PF-4s, PF-17, PF-18b, PF-18s | Shaped · qa R1.93 Partial (was Not built), 19 Nov, main 2c9231ab4: PF-18b #2064 merged, API gate A passed; parts missing PF-4s, PF-17, PF-18s (qa commit 24b897a64, #2193) |
| 100 | Recorded acceptance of our terms, privacy notice and data agreement | Platform | PF-5; PF-5t (a new terms version asks again at the next sign-in; to shape, Lead B; qa #1950, Lead 66) | Shaped · qa R1.100 Partial, 17 Nov, main 499bf07ef: PF-5t part 1 #1957 merged (API only); parts missing PF-5t part 2 (screens) and QA-481 (PF-5v part 2) (qa commit 432d81566, #2117) |

### C. Enquiries, leads and pipeline
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 26 | Public enquiry form, hardened against abuse | Front office | FO-2, FO-4, FO-4b | Shaped · qa R1.26 Partial (was Not built), 18 Nov, main 15c75cd52: FO-2 parts 1-2 and FO-4 part 1 merged; part missing FO-4b (qa commit 9af718751, #2136; carried forward 19 Nov, #2160) |
| 27 | Every lead carries a source (lead import comes when AG-18's import engine lands, AG-2-7, AG18-D2: no row yet; Lead B rev 16.63, Lead 66) | Front office | FO-1a (In PR #1742), FO-2; FO-4sf (source filter on the leads list, after FO-2v #1933) | Shaped · qa R1.27 Partial, 16 Nov 21:3x IST, main d66bcfd2d: QA-493 closed by FO-4sf #1962 (lists filter by source); part missing FO-4b; QA-501 (Minor) new (qa commit 0e18252a4, #2006) |
| 28 | Consent recorded per purpose | Platform + front office | PF-19a, FO-2; PF-19b part 2 (one-click unsubscribe, first caller of `ConsentPort.withdraw`; qa #1950, Lead 66) | qa Works (was Shaped until 19 Nov: qa R1.28 Works on main 95fbf96bf, 19 Nov 22:0x IST, last part J-28 #2281; j_28 47/47, item-proof 44562295519 and re-run 44563301296; QA-511 closed; qa commit 8fd33ca6d, on main with #2328. QA-518, a Major on unsubscribe reach, is placed on row 49, not this row, by the tech lead's ruling) |
| 29 | One person record; duplicate warning; safe merge | Front office | FO-1a (In PR #1742), FO-9a, FO-9b, FO-9s | Shaped · qa R1.29 Partial (was Not built), 18 Nov, main 39c1203cd: FO-9a part 1 #2062 and FO-9b part 0 #2021 merged (API and port only); parts missing FO-9a's later parts, FO-9b's merge, FO-9s (qa commit dd48695cd, #2117) |
| 30 | Lead lists, filters and board | Front office | FO-4 | Shaped · qa R1.30 Partial (was Not built), 20 Nov ~09:3x IST, main 418be9f1a: pack j_30 green on GitHub and gate A by screens passed, held by QA-533 (Gap, Major: no source filter on the prospects List or board) until a fix or the tech lead's ruling; QA-572 (Minor) open (qa commit 7b3d71f28, #2415) |
| 31 | Stage kinds; won by signature; totals per currency | Front office | FO-2, FO-4 | Shaped · qa R1.31 Partial (was Not built), 20 Nov ~06:xx IST, main 54ba0cce3, after FO-2pv #2323: held only for P-339's independent re-run (the fresh reader gives Works on that condition; item-proof 44641146727 passed); QA-530 and QA-531 closed (qa commit 1e96efb0d, #2296) |
| 32 | Assign, take, reassign; Unassigned; assignment rules | Front office | FO-4, FO-10 | Shaped · qa R1.32 Partial (was Not built), 18 Nov, main 15c75cd52: Take and Assign (#1843) and the lists (#1822) merged; parts missing FO-10 and Assign and reassign on a screen (qa commit 9af718751, #2136; carried forward 19 Nov, #2160) |
| 33 | Phone numbers | Front office | FO-2, FO-9a | Merged (was Shaped until 20 Nov: qa says its last part FO-9a phone #2268 merged 20 Nov 03:00 IST) · qa R1.33 Partial on main a70aa2c36, 20 Nov 03:2x IST, held by QA-526 (Major: only the staff edit route stores the number in E.164); qa commit fe5ed7adb, on main with #2392 |
| 34 | One person's data as an export, logged | Front office (privacy) | PF-26, PF-26s; CS-X1 (the case side's section) | Shaped |
| 35 | Contacts import from a spreadsheet | Platform | PF-10a, PF-10b, PF-10t, PF-10s | Shaped |
| 36 | Simple automation, message many with consent | Platform + front office | PF-20, PF-20s, FO-10, FO-12b, FO-12c, FO-12s | Shaped |
| 95 | Custom fields and saved views | Platform | PF-22a, PF-22v, PF-22s | Shaped |
| 98 | Corporate clients, employers, LMIA | Front office + case side | FO-2b, FO-8; LMIA on the case side: CS-98r, CS-98a to CS-98e, CS-98s1, CS-98s2 (P-607 (5): Release 1, last) | Shaped · qa R1.98 Partial (was Not built), 17 Nov, main 499bf07ef: FO-2b #2019 merged (API only); parts missing FO-8 and the case-side LMIA rows (qa commit 432d81566, #2117) |
| 108 | Conflict-of-interest check | Front office | FO-13, FO-13c, FO-13s | Shaped · qa R1.108 Partial (was Not built), 18 Nov, main 15c75cd52: FO-13's tables #1755 merged; parts missing FO-13c, FO-13s (qa commit 9af718751, #2136; carried forward 19 Nov, #2160) |
| 110 | Client identity check | Front office | FO-13, FO-13i, FO-13s | Shaped · qa R1.110 Partial (was Not built), 19 Nov, main 34c5e1e99: FO-13i #2011 merged (API only); part missing FO-13s; QA-510 (Gap, Major: an expired identity document is accepted) (qa commit c0a0e30ef, #2166) |

### D. Booking
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 37 | Public booking page; no double booking | Front office | FO-1b (In PR #1741), FO-3 (API); booking screens: FO-3a, FO-3w, FO-3sc | qa Works (was Shaped until 20 Nov: qa R1.37 Works on main c66a41c96, 20 Nov 01:3x IST, last part J-37 #2284; item-proof 44562311132, re-run 44600062791 21/21; qa commit 5290947d5, on main with #2375) |
| 38 | Time zones from booking page to invite | Front office | FO-3 (#1760) | Merged · qa R1.38 Partial, 16 Nov 22:4x IST, main f7dde02c8, after FO-3w part 2 #1982: the booker's side holds by screens; missing FO-3st1 (no screen shows the staff zone) and J-38; gate A not met (qa commit 2c0e6e260, #1968) |
| 39 | Staff calendar screen | Front office | FO-3st (FO-3st1), FO-3sc | Shaped |
| 40 | Calendar invite files | Front office | FO-3 (#1760) | Merged · qa R1.40 Partial, 20 Nov ~08:5x IST, main 418be9f1a: held only by QA-570 (Major, proof: J-38 33/34, one stale journey assertion; qa says the product is right); gate A by screens passed; Works after QA-570's fix and two green j_38 runs (qa commit 0a4926b1a, #2414) |
| 41 | Staff hours and time off | Front office | FO-1b (In PR #1741), FO-3; screen: FO-3a, FO-3st (FO-3st2) | qa Works (was Shaped until 20 Nov: qa R1.41 Works on main 292847c32, 20 Nov 01:4x IST, last part J-41 #2302; item-proof 44603961304, re-run 44604534795; qa commit 95cefe965, on main with #2379; QA-524 closed by the tech lead's ruling (P-294): overlapping hours are refused within one hour set, commit 17703cc24, #2381) |
| 42 | Reschedule or cancel by link; outcomes; consult record | Front office | FO-3; staff screen: FO-3a, FO-3w, FO-3st (FO-3st1, FO-3st3) | Shaped · qa R1.42 Partial, 18 Nov, main 39c1203cd: FO-3a part 1a #1918 merged; parts missing the staff outcome route and the consult record (FO-3a's later parts, FO-3w-staff) (qa commit dd48695cd, #2117) |
| 43 | Two-way Google or Outlook calendar sync | Front office | FO-3s1, FO-3s2, FO-3s3, FO-3s4, FO-3s5 | Shaped (Google's and Microsoft's reviews are outside clocks) |
| 104 | Consultation agreement signed before the first consult | Front office | FO-3c, FO-5, FO-5s | Shaped |
| 112 | Video meeting links on bookings | Front office | FO-3v (Meet and Teams through the booking rows) | Shaped |

### E. Templates and messages
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 45 | Firm templates, field picker, preview with a real record | Platform | PF-19c, PF-19s, FO-5p | Shaped |
| 46 | Template text editor (a plain text box) | Platform | PF-19s | Shaped |
| 47 | One email layout | Platform | PF-19b | Shaped |
| 48 | Sending, delivery state, bounces, the firm's sender name | Platform | PF-19b, PF-L | Shaped · qa R1.48 Partial (was Not built), 18 Nov, main 39c1203cd: PF-19b part 2 #1956 (SES adapter, bounces) merged; part missing PF-L; no delivery-state screen yet (qa commit dd48695cd, #2117) |
| 49 | Consent gate before every send; unsubscribe | Platform | PF-19a, PF-19b | Shaped · qa R1.49 Partial, 18 Nov, main 39c1203cd: one-click unsubscribe exists; held by QA-495 (the case side's link emails and staff mail still skip the gate) (qa commit dd48695cd, #2117); QA-518 (Gap, Major, unsubscribe reach across a second person record) sits on this row by the tech lead's ruling (R1.28 note, 8fd33ca6d) |
| 50 | In-app notifications; personal notification settings | Platform | PF-18a, PF-18s (settings); PF-18n (the list); PF-18ns | Shaped |
| 52 | Connected mailbox; WhatsApp (no SMS) | Platform + front office | FO-11 (WhatsApp); PF-19m, PF-19mc, PF-19mi, PF-19mx, PF-19ms | Shaped (Google mail review: weeks) |

### F. Retainer and e-signature
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 53 | Retainer with the regulator's 26 items; versioned until sent | Front office | FO-5, FO-5b, FO-5s (FO-5r research) | Shaped |
| 54 | E-signature with evidence; send any document for signature | Front office | FO-6, FO-6v (held for the BoldSign sandbox, P-561), FO-6d, FO-6ds | Shaped · qa R1.54 Partial (was Not built), 17 Nov, main 499bf07ef: FO-6 part 2 #2040 (SigningPort, no vendor call) merged; parts missing FO-6's routes and screens, FO-6v, FO-6d, FO-6ds (qa commit 432d81566, #2117) |
| 55 | Withdraw, re-issue, decline, signed offline | Front office | FO-6, FO-5s | Shaped |

### G. Client money
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 56 | Client invoices, tax by province, government-fee line | Client money | FO-7a, FO-7b; FO-7s0, FO-7g, FO-7q, FO-7s1 | Shaped · qa R1.56 Partial (was Not built), 18 Nov, main 15c75cd52: FO-7a #1758 merged; parts missing FO-7b, FO-7g, FO-7q, FO-7s1 (qa commit 361a0f49f, #2131) |
| 57 | Card payment of invoiced fees into the firm's operating account | Client money | FO-7c; FO-7s2 | Shaped |
| 58 | Trust or operating on every payment; per-client ledger; "to move" list | Client money | FO-7a, FO-7t; FO-7s3a, FO-7s3b, FO-7m | Shaped · qa R1.58 Partial (was Not built), 18 Nov, main 39c1203cd then 15c75cd52: FO-7a2 #1991 merged; Done when rewritten by the tech lead's ruling (P-694); parts missing FO-7ts parts 1-3, FO-7t, FO-7s3a, FO-7s3b, FO-7m (qa commits dd48695cd, #2117; 361a0f49f, #2131) |
| 59 | Money arithmetic | Client money | FO-7a; FO-7b (tax rounded per line; qa #1950, Lead 66) | Shaped · qa R1.59 Partial (unchanged), 18 Nov, main 15c75cd52: FO-7b (tax rounded per line, QA-482) missing (qa commit 361a0f49f, #2131) |
| 60 | Deposit invoice prepared on signature | Client money | FO-7b | Shaped |
| 96 | Reversals, refunds, credit notes, payment plans, write-offs | Client money | FO-7b, FO-7p, FO-7r; FO-7v, FO-7s4 | Shaped |
| 111 | Client statement and period exports for the accountant | Client money | FO-7r; FO-7s5 | Shaped |

### H. Client links and portal
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 61 | Sign and pay by single-use link | Front office + client money | FO-6, FO-7c | Shaped · qa R1.61 Partial (was Not built), 18 Nov, main 15c75cd52: FO-6 part 2 #2040 merged; parts missing FO-6's routes and screens, FO-7c; no row joins signing to paying (review gap G2) (qa commit d0bcdf5ed, #2131) |
| 62 | Client login portal; progress stream with "last update" | Platform | PF-4p, PF-4pw, PF-4ps; FO-14 | Shaped |
| 101 | Client answers and uploads through a secure link | Case side | C6.2, C6.16 Works | qa Works\* |

### I. Documents
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 63 | Per-person checklist with status words; reject with reason | Case side | C6.4 Works | qa Works\* |
| 64 | Upload that resumes after a dropped connection | Not named | PF-F2 (tus rail); CS-D1 (case doors) | Shaped |
| 65 | Private storage in Canada: firm-prefixed keys, versions, encryption | Not named | PF-F1, PF-F1c | Shaped (the cloud part waits on the founder's AWS account) |
| 66 | Virus scan; nothing served while scanning | Not named | PF-F3 | Shaped |
| 67 | File-type check | Not named | PF-F4; CS-D1 (case side's damaged-PDF check) | qa Works (was Shaped until 20 Nov: qa R1.67 Works on main 2547b3db1, 20 Nov; walks 44626692543 and re-run 44626707460; QA-520 closed by #2377; QA-521 (Minor) open; qa commit bbf7c6a12, on main with #2327) |
| 68 | Preview for staff review | Not named | CS-D5 (draft 2's preview) | Shaped |
| 69 | Read log, fingerprint, keep-period reminder | Not named | CS-D6 (draft 2's read log, fingerprint, keep period) | Shaped |
| 70 | Expiry, translation and notarisation flags | Not named | CS-D7c, CS-D7 (S3's flags rows, renamed); L-doc keeps copy kind | Shaped |

### J. Case work
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 72 | Case with applicants, representative, pinned release | Case side | FO-8 (hand-over from a won prospect); C6.1 Works | Shaped · qa R1.72 Partial (was Not built), 18 Nov, main 15c75cd52: C6.1 Works and BK-21 #2041 (open case kept on its pinned release; QA-397 closed 17 Nov); part missing FO-8 with its schema step CS-K1 (qa commit 361a0f49f, #2131) |
| 73 | Stages moved by events | Case side | C6.17 Works | qa Works\* |
| 74 | Government deadlines that remind; working days with holidays | Case side | built (map); no qa capability row; CS-DL1 (reminders, working days; QA-471) | Shaped (a new part, CS-DL1) · qa R1.74 Partial (unchanged), 18 Nov, main 15c75cd52: CS-DL1 not merged; QA-471 open (qa commit 361a0f49f, #2131) |
| 75 | Tasks: My Tasks, Unassigned, handover | Case side | PF-29a to PF-29f; CS-T1 (case hosts, Unassigned cases) | Shaped |
| 76 | Notes; one timeline per record | Case side | built (map); no qa capability row; FO-2 (front-office notes); CS-NT1 (case notes and timeline; QA-472) | Shaped (a new part, CS-NT1) |
| 77 | Submission number and UCI; decision, close, reopen | Case side | C8.2 Partial (Works since 18 Nov 16:3x IST on the checkpoint, main 39c1203cd: re-run 44260362078 green, fresh reader Works, gate A passed; qa commit 4e011d3f0, #2121); BK-17, B5-filings; CS-C1 (decision, close, reopen; QA-474) | qa Works\* (was Shaped (a new part, CS-C1) until 20 Nov: qa R1.77 Works on main c66a41c96, 20 Nov 01:3x IST, the decision and closing panel CS-C1s on main; J-77 76/76 twice, runs 44600094672 and 44600106989; QA-502 closed; qa commit 5290947d5, on main with #2375) |
| 79 | Firm dashboards and reports | Not named | PF-R1, PF-R2fo, PF-R2cm, PF-R3; CS-R1 (case metrics) | Shaped |
| 102 | Find a person or case by name, email or file number | Case side | PF-30a, PF-30s; CS-S1 (the case finder) | Shaped · qa R1.102 Partial (was Not built), 17-18 Nov, main 15c75cd52: CS-S1 part 1 #2035 merged; parts missing CS-S1 part 2, PF-30a, PF-30s (qa commits 432d81566, #2117; 361a0f49f, #2131) |

### K. Government forms, the pathway set-up, AI on top
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 80 | IRCC forms per applicant from one set of answers | Case side | C7.1, C7.8 Partial, ready for Works (QA-383 closed 16 Nov, qa #1858; nightly re-test dispatched 01:0x IST); C7.2 Partial (C7.1, C7.2 and C7.8 all Works since 19 Nov on main 4a4b6bc00, runs 44532804494 and 44532809449: qa commit 50f63c165, #2291); BK-10, BK-16, BK-22 to BK-24 | qa Works\* (was Merged until 19 Nov: qa R1.80 Works on main 4a4b6bc00, 19 Nov 19:3x IST; all parts merged, C7.1, C7.2 and C7.8 Works, runs 44532804494 and 44532809449; fresh reader 3 Works after reader 2's Partial; qa commit 50f63c165, on main with #2291) |
| 82 | Readiness check; staff approval per form | Case side | C7.6, C7.10, C8.3 Works | qa Works\* |
| 83 | Conditional questions and fields | Configurator | C4.4 Works | qa Works\* |
| 84 | Pathway set-up: hierarchy, versioned releases, cited rules | Configurator | M2 60/60 Works | qa Works\* |
| 99 | AI on top of the guardrails: proposed values, document reading | Case side | C3.1, C6.5, C7.5 Works; BK-14; Works on qa #1833 (the model choice is launch condition C26, not a part, P-616) | qa Works\* |
| 106 | Pathway assessment AS-1: Express Entry and FSW scores | Front office + configurator | FO-15a, FO-15b, FO-15s; AS-1m, AS-1g, AS-1s, AS-1c, CS-106c | Shaped · qa R1.106 Partial (was Not built), 18 Nov, main 15c75cd52: AS-1m #2105 merged; parts missing AS-1g, AS-1s, AS-1c, FO-15a, FO-15b, FO-15s, CS-106c (qa commit 361a0f49f, #2131; carried forward 19 Nov, #2160) |
| 107 | Pathway assessment AS-2: five provincial streams, client copy | Front office + configurator | AS-2c, AS-2cs; AS-2e, AS-2d1, AS-2d2 (streams: one founder card, P-607 (9)) | Shaped |

### L. Privacy registers and audit views
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 85 | Data-request register with legal hold | Not named | PF-21b, PF-21d, PF-21rs | Shaped · qa R1.85 Partial (was Not built), 18 Nov, main 15c75cd52: PF-21b part 1 #2025 (LegalHoldPort) merged; parts missing PF-21b's later parts, PF-21d, PF-21rs (qa commit 361a0f49f, #2131) |
| 86 | Breach register with firm notices | Not named | PF-21c, PF-21rs | Shaped |
| 87 | Our access to a firm's data, logged and shown to the firm | Audit | AUD-3, AUD-3b; PF-12's bypass role is audited | Shaped |
| 88 | The firm reads its own audit log | Audit | AUD-4, AUD-4s | Shaped |
| 97 | Tamper-evident audit chain | Audit | AUD-1c, AUD-2, AUD-2c | Shaped |
| 105 | Keep periods; a leaving firm is closed, not deleted | Audit + platform | PF-11c; PF-5 closes at 90 days; AUD-5 (6 years from closing, College s. 7.2; CS-D6 reads it) | Shaped · qa R1.105 Partial (was Not built), 18 Nov, main 15c75cd52: AUD-5 part 1 #2008 merged; parts missing AUD-5 part 2, AUD-2, PF-5's close at 90 days, PF-11c (qa commits dd48695cd, #2117; 361a0f49f, #2131) |
| 109 | Complaints record | Platform | PF-21, PF-21s | qa Works (was Shaped until 20 Nov: qa R1.109 Works on main 6f6efac88, 20 Nov 02:1x IST, after PF-21j #2315; j_109 26/26 twice, runs 44608469689 and 44608482750; QA-517 closed; QA-506, QA-525 (Minors) open; qa commit fc274c2c4, on main with #2382) |


### M. Added 25 Nov from the team-code scope check (P-842: counted in Release 1; the Build total is 110)
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 113 | Platform-wide maintenance mode with a bilingual message | Platform (our console) | Not shaped (SA-12-20, SA-12-22 (SA-12 v2.9; SA12-D5; SA-12-21 bypass token parked); Phase 1 Must; team code: backend only (maintenance.guard.ts, platform-maintenance controller); screen is a mock) | Not shaped |
| 114 | One platform banner, EN/FR, with start and end | Platform (our console) | Not shaped (SA-12-23 (SA12-D5); Phase 1 Must; team code: backend only (platform-banner controllers); screen is a mock, no firm-side display) | Not shaped |
| 115 | Platform settings registry (security settings; offboarding policy) | Platform (our console) | Not shaped (SA-12-17, SA-12-19, SA-12-27, SA-12-28 (SA12-D3 parks the registry beyond the security settings); billing-timeline screen is SA-4 Phase 3, out; Phase 1 (security settings); team code: end to end (platform-setting controllers, FE platform-settings): lift candidate) | Not shaped |
| 116 | Staff session timeout: auto sign-out for our staff (60 min idle / 12 h) | Platform (our console) | Not shaped (SA-12-27 to SA-12-29; SA-07 auto-logout row; Phase 1 Must; team code: end to end (session-timeout-policy controller, FE hooks and tests): lift candidate) | Not shaped |
| 117 | Our staff administration: invite (company domains), deactivate, reactivate, reset two-step, account-manager handover | Platform (our console) | Not shaped (SA-7-4, SA-7-5, SA-7-6, SA-7-10, SA-7-15 (SA-07 v2.17); PF-4s cites only the sign-in ids; Phase 1 Must (My account, activity list: Phase 2); team code: end to end, partly mock (platform-user-directory and lifecycle controllers): lift candidate) | Not shaped |
| 118 | Platform analytics: one Business page with an audited CSV | Platform (our console) | Not shaped (SA-9-1, SA-9-1a onward (SA-09 v2.5); X-31 keeps health graphs and alert rules parked; Phase 1 Must; team code: stub (front-end fixtures only, no backend)) | Not shaped |
| 119 | Read-only integrations status page | Platform (our console) | Not shaped (SA-8-26 (SA-08 v2.13); Phase 1 Must; team code: end to end, read-only (integration-status controller and evaluators): lift candidate) | Not shaped |
| 120 | Our global templates and system emails: catalogue, publish, 7-day notice, send test | Platform (our console) | Not shaped (SA-5-48, SA-5-49, SA-5-50 (SA-05 v3.9); our rows 45-47 are the firm's own templates; X-24 still defers editing billing emails; Phase 1 Must; team code: end to end for system emails; preview and role switch mock: lift candidate) | Not shaped |
| 121 | Firm capability switches: escalation and at-risk marks | Platform (our console) | Not shaped (AG16-8, key agent/firm-capability:manage (AG-16 v1.24); Release 1 (agent 99-Phasing, Advanced); team code: service only, not registered) | Not shaped |

**Optional (8, out of the first build, P-572; kept as BACKLOG X-1 to X-8):** 7 custom roles · 17 feature switches · 18 French and Quebec tax · 25 demo firm · 51 outgoing webhooks and API keys · 71 reading text from scans · 78 full-text search · 81 ordinary PDF form filling.
**Held (3, BACKLOG X-22):** 44 pay when booking · 94 card payment into trust (P-567) · 103 our own signer (only if BoldSign fails a P-561 condition).

### Flags
**Map rows with no BACKLOG row at all (19):** 10, 13, 15, 24, 34, 39, 50 (the list), 64, 65, 66, 67, 68, 69, 70, 75, 79, 85, 86, 102. Most sit where no module owner is named yet (documents, dashboards, privacy registers, running the service).
**Map rows with a part that has no row (5):** 3 (walls on case-side tables, before the first real firm, P-575), 37, 41, 42 (booking screens: FO-3 is API only and FO-4 has no booking screen), 98 (LMIA on the case side; after the first five firms, P-568).
**Map rows only named, not shaped (15):** 1 and 14 (PF-8), 8, 87, 88, 97, 105 (AUD-1, AUD-2), 22 (PF-11), 35 (PF-10), 43 (FO-3s), 52 (PF-19m), 62 (PF-4p), 95 (PF-22), 106 (FO-15, AS-1), 107 (AS-2); plus the money screens FO-7s (rows 56, 57, 58, 96, 111).
**BACKLOG MVP rows with no map row:** PF-9 (firm set-up checklist; nearest map row 92) and FO-3b (paid consults, which touches Held row 44 except where the fee is earned at booking). PF-2 (technology gate) and PF-L (libraries) are enablers, not capabilities. The case-side BK- rows serve map rows 77, 80 and 99.
**Built in the map but with no qa capability row:** 74 and 76. The case-side "touch-up" for many firms (rows 63, 73, 74, 76, 77, 80, 82 to 84) has no row of its own.

---

## B. Done for one row

A row is done only when all of these hold, in this order:
1. **Shaped first.** A duplicate check line (P-526); a Done when with a pass and a fail test per business rule; one row, one PR, under about 800 lines, split schema → API → screen (P-436 (4)). A new screen has an approved concept with a best-in-class section (P-223 (4), P-392) and a walk by screens before the first review (P-352).
2. **Done-when tests pass**, each business rule with a passing and a failing test (BACKLOG standard; QUALITY D16). US$0 unless the founder approves a stated cost (P-175).
3. **Reviewer Approve on the exact head sha**: a fresh Opus reviewer posts `Reviewer: Approve <sha>` (P-303, P-277, P-385); at most two rounds, then the Lead decides (P-293 (3)).
4. **Breaker** for money, schema, permissions or a new screen (P-278); the Lead reads the diff itself before labelling anything touching money, permissions, schema, a migration or the pipeline (P-423).
5. **Green CI on GitHub's runners** on that sha, then the label `review: approved` (P-385).
6. **Merged through the queue**, never by hand (P-189, P-384).
7. **qa's independent Works verdict**: the pack is green on `main`'s head on GitHub's runners, re-run independently, judged by a fresh Opus reader that ran nothing (P-290, P-303, P-339, P-432). No pack, no server or a fixture-only run is Not tested, never green (P-405).
8. **Gate A**: qa walks it by screens to the next capability's first step (P-348 (3)); journey score 8 or more out of 10 with no criterion at 0 (QUALITY).
9. **Gate B**: no open Major or Critical on the capability; a Major keeps it Partial (P-305 (3), P-317).

---

## C. Ready to launch to the first real firm (production readiness)

Drawn from Google's production readiness review, the AWS Well-Architected pillars (security, reliability, operational excellence, cost, performance), OWASP ASVS level 2 and Canada's PIPEDA fair information principles; only items that apply to about 100 Canadian firms (P-562). Status: **Done** · **In progress** (work open or partly merged) · **Decided, not built** · **Not started**. Legal points are **Unconfirmed: no counsel**.

### Security
| # | Item | Status | Decision |
|---|---|---|---|
| C1 | Walls between firms in the database, with a cross-firm test as a release gate (PF/FO tables, money tables) | Decided, not built (PF-12 shaped) | P-575, P-584 |
| C2 | The same walls on the case-side tables | Not started (no row) | P-575 |
| C3 | Two-step sign-in for every staff member; passkeys proven on a real pool | In progress (PF-4 #1744; PF-4b needs the AWS account) | P-566, P-567 |
| C4 | Our own staff on a separate sign-in pool; their access to a firm's data logged and shown | Decided, not built (PF-4s, PF-12, AUD-1) | P-581, P-571 |
| C5 | Outside security test (penetration test) before the first firm | Not started (founder to book) | P-551 |
| C6 | OWASP ASVS level 2 self-check: sign-in, sessions, access control, input, files, errors | Not started | no decision yet |
| C7 | GitHub safety settings (secret scanning, push protection, Dependabot alerts, no bypass) | In progress (steps 1-7 on; 8-11 by PRs) | P-583 |
| C8 | Known vulnerable libraries fixed (28 Dependabot alerts, 8 high in the app) and gold-class code only | Not started (SEC-1 to shape) | P-587; SEC-1 no decision yet |
| C9 | Secrets in a managed store; no secret in the repository | Not started (no row; PF-7's key check merged) | no decision yet |
| C10 | Uploads scanned for viruses and checked by type before anyone opens them | Not started (rows 66, 67 have no row) | no decision yet |
| C11 | Private repository before the first real firm's data; private backup copy | In progress (backup copy Done 12:03 IST; notice and SECURITY.md Done, #1737; switch to private at the gate) | P-589, P-590 |

### Reliability and performance
| # | Item | Status | Decision |
|---|---|---|---|
| C12 | Hosting, database, files and logs in Canada on managed services (AWS ca-central-1) | Not started (PF-8 named; AWS account not opened) | P-559, P-586 |
| C13 | Backups with point-in-time restore, a copy in ca-west-1, targets 15 minutes of data loss and 4 hours to recover, one restore drill passed | Not started (PF-8 named) | P-586 (map row 14) |
| C14 | Background jobs that retry and never run twice | Decided, not built (PF-14) | P-586 |
| C15 | Speed for about 100 firms within the STANDARDS §9 budgets, checked under load | Not started | P-562 |

### Operational excellence
| # | Item | Status | Decision |
|---|---|---|---|
| C16 | Logs, metrics and alerts that wake a person | Not started (row 13 has no row) | no decision yet |
| C17 | Named people for on call | Not started | P-551 |
| C18 | Incident and breach response with named roles; a breach register; notices to firms and, where required, to the Privacy Commissioner (Unconfirmed: no counsel) | Not started (row 86 has no row) | P-551 |
| C19 | Support route: help button and tickets, a support inbox, a named support person | Decided, not built (PF-18b, PF-17); named person not started | P-551, P-581 |
| C20 | Deploy to the cloud with a way back to the last good version | Not started (PF-8 named) | no decision yet |
| C21 | Outside accounts with review clocks opened (AWS, SES production access, Google, Stripe, BoldSign sandbox; Meta and Zoom pages read) | Not started (founder; start 16 Nov) | P-580, P-586 |

### Cost
| # | Item | Status | Decision |
|---|---|---|---|
| C22 | Running cost sized for about 100 firms, with a budget alarm on the cloud account | Not started | P-562 |

### Privacy and legal (PIPEDA principles)
| # | Item | Status | Decision |
|---|---|---|---|
| C23 | Counsel reads the retainer, trust handling, terms, data location and licences (Unconfirmed: no counsel) | Not started (founder engages) | P-551 |
| C24 | Privacy policy, terms of service and data-processing agreement written, and each firm's acceptance recorded (Unconfirmed: no counsel) | Recording decided, not built (PF-5); documents not started | P-566; documents no decision yet |
| C25 | A named privacy officer (accountability) | Not started | no decision yet |
| C26 | Data in Canada, and a written statement of what leaves (Stripe, BoldSign's details, AI unless the Canada model is chosen) (Unconfirmed: no counsel) | Not started (statement not written; AI choice open) | P-559, P-561 |
| C27 | Consent per purpose and a consent gate before every message | Decided, not built (PF-19a, PF-19b, FO-2) | P-574, P-584 |
| C28 | A person's access request answered: export of their data and a data-request register | Not started (rows 34, 85 have no row) | no decision yet |
| C29 | Keep periods; a leaving firm closed at 90 days, exported to the archive before data leaves; data download (PF-11) before any real firm | Decided, not built (AUD-2, PF-11 named) | P-571, P-586 |
| C30 | Audit chain exported daily to S3 Object Lock (compliance mode, ca-central-1) | Decided, not built (AUD-1, AUD-2 named) | P-571 |
| C31 | Trust ledger's outside review and the accountant's read (Unconfirmed: no counsel) | Not started (founder books) | no decision yet (map open item 4) |
| C32 | The College's rules read for the conflict, complaints and identity checks (Unconfirmed: no counsel) | Not started | P-579 |
| C33 | A narrow launch scope written for the first firm | Not started | P-551 |

## Sub-parts named before building (P-644 rule 1; Lead 69, 21:1x IST 16 Nov, from Build Lead A rev 16.74; form confirmed by the board session on cockpit-data.py at d66bcfd2d)
The board counts each listed part; a PR title must name it the same way ("runtime: PF-13 part 1 — …"); a title without "part" counts as the whole id.
- PF-13 parts 1-2
- PF-18a parts 1-2
- PF-11 parts 1-3
- PF-15 parts 1-2
- PF-4c parts 1-2
- FO-3st1 parts 1-2
- FO-9b parts 0-2
- PF-26 parts 1, 1b and 2
- FO-3a parts 1a, 1b, 2a and 2b
- PF-21s parts 3 and 4 (stage 2; stage 1 merged as #1821)
- From Build Lead C (commit cdcccb52d, 21:1x IST 16 Nov):
- R1.74: CS-DL1 parts 1-2
- R1.10: CS-V1 part 1, CS-V1 part 2, CS-V1 part 3a, CS-V1 part 3b
- R1.76: CS-NT1 parts 1-4
- R1.8: AUD-1a, AUD-1b, AUD-1m part 1, AUD-1m part 2a, AUD-1m part 2b
- R1.105: AUD-5 parts 1-2
- R1.97: AUD-1c parts 1-2, AUD-2 parts 1-2, AUD-2c parts 1-2
- R1.87: AUD-3 parts 1-3, AUD-3b parts 1-3
- R1.88: AUD-4, AUD-4s parts 1-2 (1 = concept)
- R1.102: CS-S1 parts 1-2
- R1.79: CS-R1 parts 1-2
- R1.34: CS-X1 parts 1-3
- R1.68: CS-D5 parts 1-2
- R1.69: CS-D6 parts 1-3
- R1.70: CS-D7c, CS-D7 parts 1-2
- R1.64/R1.67: CS-D1 parts 1-3
- R1.106: CS-106c parts 1-2
- R1.56/R1.57/R1.58 (R1.96/R1.111): FO-7ts parts 1-3; FO-7t parts 1-5; FO-7c parts 1-3; FO-7g parts 1-2; FO-7r parts 1-3
