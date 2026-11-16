# Build Lead A (Lead B, 6): platform and front-office rows left, and the first starts (P-644, 16 Nov, 21:1x IST)

Lead 69 sent P-644 (the four-seat model, `design/release1-operating-model-2026-11-16.md` on `lead/2026-11-07-lead31`). Lead B is **Build Lead A**: the PF and FO rows, up to 8 cloud builders, and 5 rows fully built a day. The order is fewest parts left first, and each lane keeps two ready briefs.

**Method, measured at 21:0x IST:**
* The checklist rows (`MVP-CHECKLIST.md` on the Lead branch) whose module is Platform or Front office were matched against every PR title since 4 Nov (1,200 PRs from the GitHub API).
* "Built" means a runtime, migration or screens PR that names the row and has merged. Shaping batches (records) do not count as built.
* This file holds no estimates. A count of parts left counts BACKLOG rows and their named parts.
* **The lesson from #1985 applies:** every start line below was checked against open and merged PRs by the row's name.

## 1. Rows left (PF/FO parts only; case-side parts are Build Lead C's)

| Map row | Capability | PF/FO parts left (in flight → not started) | Left |
|---|---|---|---|
| 27 | Every lead carries a source | none (FO-1a, FO-2, FO-2v, FO-4sf merged) | **0, so it is for the Prove Lead** |
| 30 | Lead lists, filters, board | none (FO-4 merged) | **0, so it is for the Prove Lead** |
| 31 | Stage kinds, won by signature, totals | none (FO-2, FO-4 merged) | **0, so it is for the Prove Lead** |
| 38, 40 | Time zones; invite files | none (FO-3 merged; qa is walking them, #1968) | **0, with qa** |
| 3, 4 | Walls between firms; each query in its firm | none on PF (PF-12 #1910 merged); CS-W1 to CS-W4 belong to Build Lead C | 0 PF |
| 28, 47, 48, 49 | Consent per purpose; layout; sending; consent gate | PF-19b part 2 (#1956, queued) | 1 |
| 100 | Recorded acceptance of terms | PF-5t part 1 (#1957), then PF-5t part 2 | 2 |
| 19 | A firm created once | PF-5 part 2 (#1959), then PF-5s part 1 (waits on PF-5v part 2 ← PF-19e) | 2+ |
| 109 | Complaints record | PF-21i, PF-21s stage 2 parts 1 and 2 | 3 |
| 23 | Firm branding | PF-13 parts 1 and 2 (and its FO-3w line) | 2 |
| 14 | Backups, tested restore | PF-8r, PF-8rc | 2 |
| 15 | Secrets in a managed store | PF-24w, PF-8b (cloud) | 2 |
| 24 | Each firm's own address | PF-25w, PF-8b | 2 |
| 110 | Client identity check | FO-13i, FO-13s | 2 |
| 108 | Conflict-of-interest check | FO-13c (waits on FO-9a and CS-S1b), FO-13s | 2 |
| 33 | Phone numbers | FO-9a | 1 (sales lane order: FO-2b → FO-9a) |
| 98 | Corporate clients (FO part) | FO-2b, FO-8 | 2 |
| 29 | One person record, duplicates, merge | FO-9a, FO-9b (3 parts), FO-9s | 5 |
| 6 | Permissions | PF-6m (#1945, labelled), PF-6 part 2a, PF-6 part 2b, PF-6m2 | 4 |
| 5 | Staff sign-in, two-step, lock-out | PF-24w → PF-4pc → PF-4s (and PF-4bc) | 3 to 4 |
| 13 | Logs, metrics, alerts | PF-23c, PF-23m | 2 |
| 37, 41, 42 | Booking page; hours; reschedule; consult record | FO-3a 1a (#1918), FO-3w part 2 (#1982), then FO-3vr, FO-3a 1b, 2a, 2b, FO-3st1 (2 parts), FO-3st2, FO-3st3, FO-3sc | 10 |
| 104 | Consultation agreement | FO-3c part 1 (after FO-3a 1b), part 2 (after FO-6), FO-5s | 3 |
| 45, 46 | Templates, field picker, editor | PF-19c (after #1956/#1961), PF-19s, FO-5p parts 1 and 2 (part 2 after PF-Fp) | 4 to 5 |
| 22 | Suspend, cancel, hold, data download | PF-5 part 2 (#1959), PF-11 (3 parts), PF-11s, PF-27, PF-11c (#1994 briefs) | 7 |
| 34 | One person's data export | PF-26 (2 parts), PF-26s | 3 |
| 20 | Entitlements, seats, downgrade, invite many | PF-4c parts 1 and 2, PF-15 parts 1 and 2 | 4 |
| 50 | Notifications | PF-18a parts 1 and 2, PF-18n, PF-18ns, PF-18s | 5 |
| 92 | Firm profile, offices, licence check | PF-5s, PF-18a, PF-18s, PF-4c part 2 | 4 |
| 93 | Our team's console | PF-4s, PF-17, PF-18b, PF-18s | 4 |
| 89, 90, 91 | Pricing, sign-up, plans | PF-5s (part 1 and the rest), PF-16 | 3+ |
| 21 | Our own invoices with tax | PF-5 part 2 (#1959) | 1 |
| 1 | Hosting in Canada | PF-8a, PF-8b, PF-8c, PF-23c | 4 (AWS account done) |
| 26 | Public enquiry form, hardened | FO-4b; PF-0bp → PF-28 | 3 |
| 32 | Assign, take; assignment rules | FO-10 | 1 |
| 53, 55 | Retainer items; withdraw, re-issue | FO-5b, FO-5s, FO-6 | 3 |
| 54, 61 | E-signature; sign and pay | FO-6, FO-6v, FO-6d, FO-6ds; FO-7c | 5 |
| 39 | Staff calendar | FO-3st1, FO-3sc | 2 (after FO-3a) |
| 43 | Calendar sync | FO-3s1 to FO-3s5 | 5 (Google review: weeks) |
| 112 | Video links | FO-3v parts 1 and 2 (part 1 after #1918) | 2 |
| 35 | Contacts import | PF-10a, PF-10b, PF-10t, PF-10s | 4 |
| 36 | Automation, messaging many | PF-20, PF-20s, FO-10, FO-12b, FO-12c, FO-12s | 6 |
| 95 | Custom fields, saved views | PF-22a, PF-22v, PF-22s | 3 |
| 52 | Connected mailbox, WhatsApp | FO-11, PF-19m, PF-19mc, PF-19mi, PF-19mx, PF-19ms | 6 (Google mail review) |
| 62 | Client portal | PF-4p, PF-4pw, PF-4ps, FO-14 | 4 |
| 106, 107 | Pathway assessments (FO part) | FO-15a, FO-15b, FO-15s | 3 |
| — | Enablers with no checklist row of their own | PF-Fd (file delete), PF-Fp (Word to PDF), PF-19e (after #1956/#1961), PF-6m2 | — |

**The client-money rows (FO-7*):** the model gives money to Build Lead C. Lead B keeps FO-7a2 (#1991, in flight) to its merge, because it is Lead B's brief, and hands the rest of FO-7 to Build Lead C unless Lead 69 rules otherwise.

## 2. The first eight starts (fewest parts left; no two share a touch list; each checked against open and merged PRs)

| # | Row | Map row | Brief (paste in this order; amendment blocks win) | Why now |
|---|---|---|---|---|
| 1 | **PF-21s stage 2 part 1** (complaints list and record screens) | 109 | `lead-b-briefs/PF-21s.md` (branch) + `P-626-order.md` A5 | PF-6 part 1, PF-21w and PF-21v are on `main`, and the concept is approved |
| 2 | **PF-21i** (recording a complaint is idempotent) | 109 | `lead-b-briefs/PF-21i.md` (main) | #1848 is on `main`; API only, so no overlap with 1 |
| 3 | **PF-13 part 1** (branding API with banner and tagline) | 23 | `lead-b-briefs/PF-13.md` (main) + `P-627-amendments.md` PF-13 block + `P-630-amendments.md` PF-13 block | PF-Le is on `main` (#1919) |
| 4 | **PF-8r** (a nightly tested restore) | 14 | `lead-b-briefs/PF-8r.md` (main) | waits on nothing; no open PR on `nightly.yml` or `deploy/` |
| 5 | **PF-24w** (identity settings in the secrets store) | 15, then 5 | `lead-b-briefs/PF-24w.md` (main) | now; it must come before PF-4bc and PF-4pc |
| 6 | **FO-13i** (client identity check) | 110 | `lead-b-briefs/FO-13i.md` (main) | now; never beside FO-5b, FO-5p or FO-3c |
| 7 | **FO-2b** (Corporate prospects) | 98 | `lead-b-briefs/FO-2b.md` (branch) | FO-2 is on `main`; no schema change |
| 8 | **PF-18a part 1** (notification and personal settings) | 50, 92 | `lead-b-briefs/PF-18a.md` (main) | part 1 is ready now; it has its own area schema file (P-600) |

## 3. The second ready brief for each lane (the next row on the same lane's files)

| Lane | Next row | Brief | Starts when |
|---|---|---|---|
| 1 | PF-21s stage 2 part 2 | same as 1 | part 1 is on `main` |
| 2 | PF-Fd (file delete) | `lead-b-briefs/PF-Fd.md` (main) | now (no open PR on `ports/files.ts`) |
| 3 | PF-13 part 2 (panel) | same as 3 | part 1 is on `main` |
| 4 | PF-18b (support tables) | `lead-b-briefs/PF-18b.md` (main) | now |
| 5 | PF-4pc, then PF-4s | `lead-b-briefs/PF-4pc.md`, `PF-4s.md` (main) | PF-24w is on `main` (CS-C1a #1818 is merged) |
| 6 | FO-5p part 1 | `lead-b-briefs/FO-5p.md` (main) + `P-630-amendments.md` FO-5p block | FO-13i is on `main` (never beside it) |
| 7 | FO-9a | `lead-b-briefs/FO-9a.md` (branch) | FO-2b is on `main` (sales lane order, P-576) |
| 8 | PF-18a part 2 | same as 8 | part 1 is on `main` (PF-18np #1898 is merged) |

**Waiting on in-flight PRs (Lead B tells Lead 69 when each is on `main`):**
* PF-6 part 2a starts when #1945 merges. PF-4c part 1 waits on #1945 too, because both touch `identity/service.ts`.
* PF-19e waits on #1956 and #1961. PF-19c and PF-19ad wait on the same two, because they share the messages files.
* PF-11 part 1 waits on #1959.
* FO-3vr, FO-3a 1b and FO-3v part 1 wait on #1918.

**Also ready, if a ninth slot opens:**
* FO-6 (signing; the BoldSign sandbox is done). Check its touch list against FO-13i and FO-5p at start.
* PF-0bp.

## 4. Sub-parts named before building (model rule 1)
Each row above already names its parts in its brief:
* PF-21s stage 2 has parts 1 and 2;
* PF-13 has parts 1 and 2;
* PF-18a has parts 1 and 2;
* FO-3a has 1a, 1b, 2a and 2b;
* PF-11 has parts 1, 2 and 3;
* PF-26 has parts 1, 1b and 2;
* PF-15 has parts 1 and 2;
* PF-4c has parts 1 and 2;
* FO-3st1 has parts 1 and 2;
* FO-9b has parts 0, 1 and 2.

The Lead copies these sub-parts into the checklist rows so the board counts them. Lead B can't push to `main`.
