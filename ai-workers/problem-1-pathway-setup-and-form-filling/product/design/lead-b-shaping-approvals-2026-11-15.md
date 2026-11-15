# Lead B approvals of the P-604 shaping lanes (15 Nov 2026)

Lead B (4) reviews the shaping lanes' rows in batches (P-604; Lead 52's ask, 15 Nov 09:3x IST). Each batch lists every row as **approved**, **approved with amendments** (Lead 52 applies them when copying into BACKLOG; the text below is the exact change), or **held** (with what it needs). Case-side rows (CS-) are the release holder's to approve. Lead B checks only where they join platform or front office.

**Checks run on every batch:**
* every id is new (none is already in BACKLOG on `lead/2026-11-07-lead31`);
* every team requirement id cited exists in `domain/requirements-2026-11-02/`, checked by script;
* every row has `Source:` and a duplicate check (S3 has one per capability block, which is accepted);
* touch lists stay inside the row's own area, or name the shared-file OK they need;
* schema rows meet P-600, and their tests follow rev 16.7;
* each row is one PR under about 800 lines.

## Batch 1 (15 Nov 09:1x IST): S1 at 5b88c9646, S2 at cb89133bd, S3 at 3f67186c8

### S1: Platform and Audit (map rows 1, 14, 10)

| Row | Verdict | Amendment or note |
|---|---|---|
| PF-8a | approved with amendments | (1) The new job in `.github/workflows/skeleton.yml` needs the release holder's diff read (P-423); the row already says so. (2) Add to Done when: "the CDK app's `package.json` pins exact versions and its lockfile is committed; `npm audit --omit=dev` shows no high finding in the CDK tree" (a separate tree must not escape the dependency checks). |
| PF-8b | approved | Question 1 (the domain and where its DNS lives) goes to the founder through Lead 52. |
| PF-8c | approved | The production approver (founder or the named on-call person, P-551) is the founder's to name. |
| PF-8r | approved | — |
| PF-8rc | approved with amendments | **Vault lock in governance mode for Release 1, not compliance mode** (Lead B decision, P-566 (3)). Compliance mode cannot be undone after its grace period (AWS Backup Vault Lock), and Release 1's account and retention are still young. Governance mode still stops early deletion by anyone without the explicit bypass permission, and the bypass is granted to no role. Compliance mode becomes its own later row once the first cloud drill has passed. Done when: "vault lock is on in governance mode; no role in the stack holds the bypass permission (assertion test)". |
| PF-28 | approved with amendments | (1) **Webhook doors keep the raw body.** `/api/hooks/*` (Stripe now, a signing vendor later) verify a signature over the exact bytes, so their size limit sits on the raw-body parser and their zod schema runs **after** the signature check. Done when adds: "a signed Stripe test event still verifies after PF-28; one with a single byte changed is refused 400". (2) `z.strictObject` on existing routes must not break the screens. Run every PF/FO browser suite on `main` merged in, and paste the results in the PR (rev 16's pre-label rule). |

### S2: Front office (map rows 34, 37, 39, 41, 42, 43)

| Row | Verdict | Amendment or note |
|---|---|---|
| PF-26s | approved | — |
| FO-3sc | approved | The concept also states field and type names that avoid program words (B164). |
| FO-3st1, FO-3st2, FO-3st3 | approved | They split FO-3st into three ids with no new scope. On copy, FO-3st becomes a pointer to them. |
| FO-3s1 | approved with amendments | The back-relation on FO-1b's booking model goes **directly under that model's own slot comment** (rev 16.6). If FO-1b's model has no slot comment, the PR adds one there, and the release holder reads that line (P-600 (b)). The migration test follows rev 16.7: it measures right after its own migration and never assumes it is the newest. |
| FO-3s2, FO-3s3 | approved | The library goes through the STANDARDS §1 gate and is added by a PF-L-style single PR before either adapter merges. The Google and Microsoft app reviews are outside clocks, so start the founder's app registrations now (P-576 (5)). |
| FO-3s4 | approved | Ordered after FO-3f (#1785) merges, as the row says. FO-3a's lane must not hold `slots.ts` or `service.ts` at the same time. |
| FO-3s5 | approved | — |
| CS-26e, CS-98r … CS-98s2 | release holder's | They join front office only through FO-2b and FO-8, which already exist, and through `PersonExportPort` (PF-26). No front-office change is needed. S2's question 1 (LMIA timing: 99-Phasing line 102 and AG17-D60 against P-568) is a conflict between the team's requirement and a founder decision, so it goes to the founder (AGENTS rule 2). |

### S3: Client money (map rows 56, 57, 58, 96, 111) and the "Not named" module proposals

| Row | Verdict | Amendment or note |
|---|---|---|
| FO-7s0 | approved | — |
| FO-7g | approved | The CRA rates page is read at source by the builder, with URL, quote and read date. A value that cannot be cited stops the row (AGENTS rule 4 applied to tax values). |
| FO-7q | approved | — |
| FO-7s1 | approved | — |
| FO-7s2 | approved | — |
| FO-7s3a | approved | — |
| FO-7s3b | approved with amendments | Q5 is ruled below: a draft shows the amount it **could** take from trust, and nothing is applied unless a person ticks "Pay CAD X from trust now" in the issue dialog. |
| FO-7m | **approved: build it** (Q1 ruled below) | Drop the words "only on the Lead's yes (Q1)". |
| FO-7v | approved; **Q2 goes to the founder** | Everything except the shortfall rule is approved. Lead B's recommendation for Q2 is below. |
| FO-7s4 | approved | — |
| FO-7s5 | approved | — |
| §0 module proposals | approved for platform (64, 65, 66, 67, 79); case-side ones (68, 69, 70) are the release holder's | Rows 85 and 86 are already shaped (PF-21b, PF-21c, PF-21d, PF-21rs). Lead 52 marks them Shaped in MVP-CHECKLIST. |

**Lead B rulings on S3's questions (P-566 (3), best practice with evidence; reversible):**
* **Q1, the monthly trust check: build FO-7m.**
  * It is the team's own requirement (AG-6-74), and a monthly comparison of the bank's trust balance with the ledger is the standard control for client money in regulated professions.
  * It never blocks anything (AG-6 Rule 7), and it costs one small schema row.
  * Whether the Code s. 32 requires it stays "Unconfirmed: no counsel"; we build it either way, because the requirement asks for it.
* **Q3, provincial sales taxes: as proposed.** GST/HST come from the cited CRA table. A firm that must charge PST or RST adds the rate from its own FO-7a rate list. Quebec stays out (P-568).
* **Q4, the one-click government-fee line from a case fee: later.** It waits on the case side's fee record. In Release 1 the line is typed.
* **Q5, Pay from trust on a draft: shown, never applied by itself.**
  * Money leaves trust only to an issued invoice, by a person's act (P-603).
  * The issue dialog may offer one tick box, "Pay CAD X from trust now", off by default. When ticked, the withdrawal runs in the same transaction, right after the number is taken.
* **Q2, the founder's call (it departs from the team's requirement AG-6-75 r4).**
  * **The question:** when a reversed trust deposit had already funded money that was moved to operating, AG-6-75 r4 shows the trust ledger going red (negative). FO-7v instead keeps trust at zero or above and raises one "operating → trust" line plus one Owner item.
  * **Lead B's recommendation: keep trust at or above zero (FO-7v as drafted).** A client's trust ledger must never be overdrawn, because that would mean spending other clients' money. FO-7a's database check already refuses a negative balance (P-603). The shortfall is made good from operating, through the "to move" list.

## Next batches

Lead B reviews each lane's next commits as they land (watch: `lead-b-tools/watch-shaping.sh`).

## Batch 2 (15 Nov 09:2x IST): S1 at b8d266f65, S2 at b30ad2279, S3 at cb4b35ef0

**Whose:** the audit rows (AUD-1a, AUD-1b, AUD-1m, AUD-1c, AUD-2, AUD-2c, AUD-3, AUD-3b, AUD-4, AUD-4s, AUD-5: AUD-1 and AUD-2 are the release holder's) are the release holder's to approve. So are the configurator and engine rows (AS-1m, AS-1g, AS-1s, AS-1c, AS-2e, AS-2d1, AS-2d2) and the case-side rows (CS-106c, CS-D1, CS-D2, CS-D3, CS-D4, CS-D5c, CS-D5). Lead B checks only their joins (below). The rest are Lead B's.

**Cross-lane findings (apply on copy):**
1. **One owner for `ports/keep-period.ts`.** AUD-5 (S1) and CS-D4 (S3) both create it. AUD-5 creates the port and its fake; CS-D4 only calls it, and its touch list drops `ports/keep-period.ts` and `ports/fakes/keep-period.fake.ts`. CS-D4 waits on AUD-5.
2. **One area file per schema row (P-600 condition 1).** PF-11, PF-11c and AUD-3b each add a table to PF-21's `platform-register.prisma`. Each gets its own area file instead: PF-11 uses `platform-firm-export.prisma`, PF-11c uses `platform-firm-closure.prisma`, and AUD-3b uses the file the release holder names. The back-relation lines go under PF-0p's `platform.prisma` slot comments (rev 16.6). PF-22v adds to PF-22a's own file only after PF-22a merges (it already waits on PF-22a), which is accepted.
3. **The scan port is PF-F3's.** PF-10b says "through `ScanPort` when the case side's CS-D3 lands". It should read "through `ScanPort` (PF-F3, platform); until PF-F3 merges, imports run on the scan fake in tests and are refused in production".
4. **Upload routes sit under the swept prefix.** PF-F2's `/api/files/...` becomes `/api/platform/files/...`. PF-28's input sweep and PF-4t's `PLATFORM_PATH` guard then cover them; `/api/files` is in neither.
5. **PF-27's `firmAllows(firmId, action)`** must be called at every client door it names. On copy, add one Done-when line to FO-6 (signing), FO-7c (pay link) and PF-4p (portal): "a locked firm's door answers PF-27's neutral refusal (test)". PF-27 adds the one-line call itself to any of those doors already on `main` when it lands, listed in its PR.
6. **Every schema row's migration test follows rev 16.7.** It measures right after its own migration and never assumes it is the newest: PF-10a, PF-11, PF-11c, PF-22a, PF-22v, FO-15a, PF-F2 and the release holder's schema rows.

### S1: firm exit, import, custom fields and views (map rows 22, 35, 95)

| Row | Verdict | Amendment or note |
|---|---|---|
| PF-11 | approved with amendment 2 | — |
| PF-11c | approved with amendment 2 | Its question 6 (floors that depend on the College) is labelled "Unconfirmed: no counsel" and goes to the founder only if a floor changes the build. |
| PF-11s | approved | — |
| PF-27 | approved with amendment 5 | — |
| PF-10a | approved with amendment 6 | — |
| PF-10b | approved with amendment 3 | — |
| PF-10t | approved | — |
| PF-10s | approved | — |
| PF-22a | approved with amendment 6 | — |
| PF-22v | approved with amendment 6 | — |
| PF-22s | approved | — |
| AUD-* | release holder's | Joins checked. AUD-1b and AUD-3 add one line each to PF-4's and PF-4s's guards, named in their touch lists, so Lead B (row owner) agrees. AUD-3b's support session is a new branch in PF-4's guard, so the release holder reads that line (P-423: permissions). |

### S2: assessment in the front office (map rows 106, 107)

| Row | Verdict | Amendment or note |
|---|---|---|
| FO-15a | approved with amendment 6 | — |
| FO-15b | approved | Its Question 4 (the badge roll-up rule) waits for the lane's question text; Lead B rules on it then. |
| FO-15s | approved | — |
| AS-2c | approved | **Question 5 ruled: "Review before sharing" defaults to on** (Lead B, P-566 (3)). An assessment sent to a client is advice, so a licensed person reviews it first; the firm may turn the setting off. |
| AS-2cs | approved | — |
| AS-1*, AS-2e, AS-2d*, CS-106c | release holder's | Joins checked: FO-15b reads `EligibilityPort` (AS-1m), and CS-106c adds one line to FO-8's listener, which FO-8's lane must not hold at the same time. Score data is cited data on a release, never typed (AGENTS rule 4). |

### S3: the file rail (map rows 64, 65, 66, 67)

| Row | Verdict | Amendment or note |
|---|---|---|
| PF-F4 | approved | **Q7 ruled: a plain ZIP is refused in Release 1** with "Upload the files inside one by one" (Lead B, P-566 (3)). Unpacking a ZIP means scanning nested files and guarding against archive bombs at every door; the refusal is safe and clear. Unpacking becomes a later row. |
| PF-F1 | approved | Lead B approves its STANDARDS §1 entry in the PR (step 0), as the row says. |
| PF-F1c | approved | — |
| PF-F2 | approved with amendments 4 and 6 | — |
| PF-F3 | approved | **Q6 ruled: the managed scanner first** (Lead B, P-566 (3)). Step 0 checks AWS's managed malware scanning for S3 in `ca-central-1` at source (page and date). If it is available there, it is the real adapter: no daemon to run, and no GPL licence question. If it is not, the ClamAV container is used as the row says. Either way the state stays `SCAN_PENDING` (never `CLEAN`) on any error. |
| CS-D1 … CS-D5 | release holder's | Joins checked: CS-D1 moves `mediaOf` onto PF-F4's `detect`, and the documents go onto PF-F2 and PF-F3's rail, so CS-D1 waits on PF-F2 and PF-F3; CS-D4 per finding 1. |

## Batch 3 (15 Nov 09:2x IST): S2 at 93db01193 and S3 at 651fa4ce2 (both lanes finished; their question lists are written)

### Corrections to batches 1 and 2 (founder confirmations)

Three of Lead B's rulings above depart from the team's requirements, so under P-566 they are **Lead B's recommendations, confirmed by the founder** rather than rulings. The lanes' question lists mark them "founder":
* **S3 Q4 (AG-6-40):** the government-fee line is typed in R1; the one-click line goes to an X row.
* **S3 Q7 (SA-8-37, SA-8-49):** plain ZIP refused in R1.
* **S2 Q5 (BR-16's default "open"):** "Review before sharing" defaults to on.

The rows stay approved as drafted. If the founder says no to one of them, Lead B amends that row.

### Lead B's rows

| Row | Verdict | Amendment or note |
|---|---|---|
| TK-1 to TK-6 (tasks) | approved, **renamed PF-29a to PF-29f** | S2's Q6 is ruled: **tasks are a platform service**, owned by Lead B's platform lane. The case side registers its hosts (TK-4's case half is the release holder's line) and keeps `CaseTask`. The lane proposed PF-27a…f, but S1 already uses PF-27 (firm lock), so the ids are **PF-29a (TK-1), PF-29b (TK-2), PF-29c (TK-3), PF-29d (TK-4), PF-29e (TK-5), PF-29f (TK-6)**. PF-29e waits on PF-4b (deactivation). TK-1's migration test follows rev 16.7. |
| FD-1, FD-3 (find) | approved, **renamed PF-30a (FD-1) and PF-30s (FD-3)** | A platform door: FD-2 (the case side's finder, the release holder's) becomes **CS-30c**. The front office's finder in FD-1 reads front-office tables only. |
| PF-R1 | approved | **S3's Q8 is ruled yes** (Lead B, P-566 (3)): live reads under a CI read budget at about 100 firms (P-562), with rollups added only when a metric passes its budget, and four seeded roles in R1. |
| PF-R2fo, PF-R2cm | approved | — |
| PF-R3 | approved | — |
| PF-21rs (amendment) | approved | The sharper Done when replaces "the concept's journeys" (P-592). |

### Release holder's rows (joins checked)
* FD-2 (now CS-30c), PF-R2cs, CS-P1 and TK-4's case-side registration all register through platform ports (`FindPort`, `MetricRegistry`, `ErasurePort`/`LegalHoldPort`, `TaskPort`). The joins are right. CS-P1 closes the gap Lead B rev 15 left (the case side's eraser), so Lead B agrees it is needed.
* S3 Q9 (PDF.js for CS-D2) and Q10 (keep-period reminders only, no automatic deletion) are case-side calls. Lead B agrees with both recommendations.

### S2's other questions
* **Q4, the badge rule: ruled "best outcome wins, naming its program"** (Lead B, P-566 (3)): Likely > Possibly (facts named) > Not eligible, with "Not assessed" when there is none. The badge says which program gave it ("Likely: FSW"), so it never overstates. Each program's full result is one click away.
* **Q7, calendar outside clocks: agreed.** Register both apps in test mode now, and file Google's verification the day FO-3s2's PR is up. The founder's browser is needed (P-580).
* **Q8, calendar libraries: agreed in principle.** Node's `fetch` plus one certified OAuth client for both providers, decided at the STANDARDS §1 gate in FO-3s2's PR.
* **Q1 (LMIA timing), Q2 (which five provincial streams), Q3 (assessment-only releases):** configurator and case-side matters, so they are the release holder's. Q1 and Q2 go to the founder as the lane says.

### Q11 and the X additions
Agreed: the proposed X rows are added in the same change that copies these rows (P-582). That covers S2's X-20 widening, "Task extras" and "Assessment extras", and S3's §7.

**All three lanes are reviewed.** S1's last batch (PF-18ns, PF-19m*, PF-4p*, PF-23w) is still to come.
