# qa capability re-score, Release 1 sections A to F (wave 0, P-697, P-698) — 18 Nov 2026, ~19:3x IST

**Run.** `/qa capability (re-score)`, qa session on worktree `unruffled-cannon-acab4a`, started by Lead 80. Main **15c75cd52** (tree f7630bac8, after #2014). Opus 5.5. Isolated copies on **:4476** (suites) and **:4477** (walks) only; :4400 never touched. Live AI off, US$0.
**Scope.** The R1 rows in the end-to-end review's sections A to F (`design/release1-end-to-end-review-2026-11-18.md` on `origin/lead/2026-11-07-lead31`) last scored on 14 Nov (28 rows), plus the two the review names for a re-score (R1.13 after PF-23w, R1.37 after FO-3w). Not touched: C8.2 and C11.6 (qa after-merge), sections G to L (qa-3).
**Duplicate check.** Read each row on `origin/claude/qa-after-merge-1118b` (fb2e6d5f8, PR #2121, queued): none of these 30 rows is scored there after 14 Nov (R1.13 15 Nov, R1.37 15 Nov). This branch is stacked on #2121 because several of these rows sit next to rows #2121 changes (R1.26 beside R1.100, R1.43 beside R1.42, R1.50 beside R1.49, R1.108 beside R1.98).

## Verdict
**No row reaches Works; none could (P-606):** every one of the 30 still has parts not merged. 10 rows move from Not built to **Partial**, 2 Partial rows (R1.13, R1.37) are refreshed, and 18 are **Not built (re-confirmed)**. No Works claim, so no reader or gate A was owed; the walks below are evidence for the parts that did merge.

| Row | Was | Now | Parts merged (checked) | Parts missing |
|---|---|---|---|---|
| R1.1 | Not built | Not built | PF-7 (#1713, see R1.11) | PF-8a, PF-8b, PF-8c, PF-23c |
| R1.3 | Not built | Partial | PF-12 #1910 | CS-W1 to CS-W4 |
| R1.8 | Not built | Partial | AUD-1a #2003 | AUD-1b, AUD-1m 1/2a/2b, PF-0a |
| R1.10 | Not built | Partial | CS-V1 1-2 #2007 #2042, PF-0bp #2087 | PF-28, CS-V1 3a, 3b |
| R1.14 | Not built | Partial | PF-8r #2014 | PF-8rc |
| R1.22 | Not built | Not built | — | PF-5 part 2, PF-11 1-3, PF-11s, PF-27, PF-11c |
| R1.23 | Not built | Not built | — | PF-13 |
| R1.89 | Not built | Not built | — | PF-5s |
| R1.90 | Not built | Partial | PF-5 part 1 #1815, PF-5v part 1 #1955 | PF-5 part 2, PF-5s, PF-16 |
| R1.91 | Not built | Not built | — | PF-5 part 2, PF-5s, PF-16 |
| R1.92 | Not built | Not built | — (PF-4c part 1 is the batch invite only) | PF-18a, PF-18s, PF-4c part 2, PF-5s |
| R1.93 | Not built | Not built | — | PF-4s, PF-17, PF-18b, PF-18s |
| R1.26 | Not built | Partial | FO-2 1-2 #1813 #1843, FO-4 1 #1822 | FO-4b |
| R1.32 | Not built | Partial | FO-2 2 #1843, FO-4 1 #1822 | FO-10; Assign/Reassign on a screen |
| R1.33 | Not built | Partial | FO-9a 1 #2062 | refusal on the field, country kept |
| R1.34 | Not built | Not built | — | PF-26 ×3, PF-26s, CS-X1 ×3 |
| R1.35 | Not built | Not built | — | PF-10a, b, t, s |
| R1.36 | Not built | Not built | — | PF-20, PF-20s, FO-10, FO-12b, c, s |
| R1.95 | Not built | Not built | — | PF-22a, v, s |
| R1.108 | Not built | Partial | FO-13 tables #1755 | FO-13c, FO-13s |
| R1.110 | Not built | Partial | FO-13 tables #1755 | FO-13i (#2011 open), FO-13s |
| R1.39 | Not built | Not built | — (FO-3sc is a concept) | FO-3st1 |
| R1.43 | Not built | Not built | — | FO-3s1, s2, s4, s5 |
| R1.112 | Not built | Not built | — | FO-3v |
| R1.45 | Not built | Not built | — | PF-19c, PF-19s, FO-5p |
| R1.46 | Not built | Not built | — (PF-Le libraries only) | PF-19s |
| R1.50 | Not built | Not built | — (PF-18np port only) | PF-18a, s, n, ns |
| R1.52 | Not built | Not built | — | FO-11, PF-19m ×5 |
| R1.13 | Partial | Partial | PF-23, PF-23r, PF-23w | PF-23m, PF-23c |
| R1.37 | Partial | Partial | FO-1b, FO-3, FO-3w 1-2, FO-3a 1a | J-37; booking-type screen |

## On GitHub's runners
Merge batch **ci 44290020058** (branch `mergify/merge-queue/2808f4e772`, tree f7630bac8 = main 15c75cd52's): conclusion success, 8 shards, **555 suites, 0 failed**. The suites for these rows and their jobs: pf12_walls 100 (134760451157) · aud1a_insert_only 41 (134760451218) · csv1_inputs 71 (134760451157) · pf0bp_body_errors 13 (134760451147) · pf8r_nightly_job 6 (134760451147) · fo2_leads_prospects 113 (134760451265) · fo4_sales_browser 45 (134760451263) · fo9a_duplicates 53 (134760451175) · fo13_compliance_schema 76 (134760451047) · pf5_signup_billing 53 (134760451218) · pf5v_signup_mail 7 (134760451147) · pfle_libraries 20 (134760451265) · pf18np_port 11 (134760451047) · pf23_observability 100 (134760451175) · pf23w_jobs_wired 31 (134760451265) · fo3_booking 133 (134760451147) · fo1b_booking_schema 80 (134760451147) · fo3w_booking_browser 67 (134760451265) · fo3w_manage_browser 50 (134760451175).

## Independent re-run (here, twice each)
All green twice, same counts as CI: pf12_walls, aud1a_insert_only, csv1_inputs, pf0bp_body_errors, pf8r_nightly_job, fo2_leads_prospects, fo9a_duplicates, fo13_compliance_schema, pf5_signup_billing, pf5v_signup_mail, pfle_libraries, pf18np_port, pf23_observability, pf23w_jobs_wired, fo3_booking.
**Not re-run here:** the three browser suites (fo4_sales_browser, fo3w_booking_browser, fo3w_manage_browser): Chromium cannot start inside this session's sandbox (macOS bootstrap and its profile socket are refused). They are green on GitHub only; their screens were walked headed in the browser pane instead (below). No headless 400/1024/1440 replay for the same reason.
**Sandbox adaptations (local only, nothing committed):** tsx's CLI needs a Unix socket the sandbox refuses, so `node_modules/.bin/tsx` was a wrapper running the same loader through `node --import`; `isolated.sh`'s "is Postgres up" probe (`pg_ctl status`) cannot signal the server from the sandbox, so a local copy asked `pg_isready` on :54329 instead, and `nohup` was a shim that ignores hang-up. Code under test unchanged.

## Walks (browser pane, 1024 px, copy :4477, Sample firm seeded)
* **R1.26 enquiry form (visitor).** Empty send: "Enter your first name." and "Enter your email." on each field and in a summary. `zoe@`: "Enter an email like name@example.com.". Zoë Ångström kept as typed. A good send: the firm's thank-you text; one OPEN lead, unassigned, `lead.created` by `system:web-form`. API on the same copy: the same submission twice → one lead; a send under 2 s and a filled honeypot → 201, nothing stored.
* **R1.33 phones.** `416-555-0101` and `+1 (416) 555 0101` both stored as +14165550101; the second lead flagged "Possible match" with the first. `12` accepted with no field message, stored as typed, `phone_readable = false`, shown to staff as "Fix number". No country stored. This is the part the review lists as not merged, so no new bug.
* **R1.32 Take and Assign (Case Officer, Case Manager).** Unassigned leads shows the three leads with the "Fix number" and "Possible match" tags. Double click on Take it → "You have lead L-00002.", one owner, one `lead.taken`. API: the Case Officer's assign → 403 naming `agent/prospect:assign`; the Case Manager assigns (200) and reassigns with the owner read (200); a stale owner → 409 "Case officer (Sample) already has this lead."; each change audited. No screen offers Assign or Reassign.
* **R1.37 booking (client).** The type had to be made through FO-3a's API (no staff screen). The firm's page lists it; times in the client's zone (Asia/Calcutta); a double click on Book this time → "You are booked …", one `fo_booking`; the booked time is no longer offered.
* **R1.8 probe.** As `xr_app`: UPDATE on `audit_event` → permission denied; DELETE → refused by the trigger.

## Bugs
None new (0 Blocker · 0 Critical · 0 Major · 0 Minor). What the walks found missing is each row's listed missing part.

## Questions for the tech lead
1. R1.14 and R1.8 had parts merged today (#2014, #2003), after the after-merge session's last records commit. I scored them here as part of the A-F stale rows; please tell qa after-merge so they are not re-scored in its round.
2. R1.33: is keeping an unreadable phone (flagged "Fix number") instead of refusing it on the field the intended behaviour? If so, this row's Done when ("an impossible number refused on the field") should change; if not, which row adds the refusal?
3. R1.10: front-office routes answer a missing field with 422; the row's Done when says 400. Which one is PF-28's target?

## Suggestions
* *Needed for the proof · Capability:* a staff screen for booking types (FO-3a's screens) and an Assign/Reassign control on Leads, so R1.37 and R1.32 can pass gate A by screens.
* *Later · Scaffolding:* let qa sessions in the Mac sandbox start Chromium (or run the browser suites on a GitHub dispatch), so headless replays are not GitHub-only.

## Not tested
The browser suites locally (above); keyboard-only, 200% zoom and axe on the walked screens (the suites cover axe on GitHub); coverage (c8) and the graph were not run in this re-score.
