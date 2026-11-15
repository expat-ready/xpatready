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

## Batch 4 (15 Nov 09:2x IST): S1 at 64ea121fb (S1 finished; all three lanes are now reviewed)

| Row | Verdict | Amendment or note |
|---|---|---|
| PF-18ns | approved | — |
| PF-19m | approved | It adds to PF-19a's `platform-messages.prisma` only after PF-19a merges, the same area and in sequence (as accepted for PF-22v). Its migration test follows rev 16.7. |
| PF-19mc | approved with amendment A | — |
| PF-19mi | approved | The case side's matcher (subject references, case addresses) is the release holder's registration line. |
| PF-19mx | approved | **S1's question 9, IMAP part: ruled "in Release 1"**, because the team's requirement asks for it (AG-10-4) and following it needs no question. It is ordered last in the mailbox chain. |
| PF-19ms | approved | — |
| PF-4p | approved with amendment B | — |
| PF-4pw | approved | — |
| PF-4ps | approved | — |
| PF-23w | approved with amendment C | — |

**Amendments:**
* **A. One OAuth helper for Google and Microsoft (P-526).** PF-19mc (mailbox) and FO-3s2/FO-3s3 (calendar) each build OAuth 2.0 with PKCE, a signed `state` and token refresh for the same two providers. Whichever row lands first builds it once in `api/src/platform/oauth/` (PKCE, signed state, exchange, refresh, revoke, tokens through `SecretBoxPort`), and the other reuses it. Each row then adds only its own scopes and API calls. Done when, in the second row: "no second PKCE or state implementation (a grep test)".
  * **One app registration per provider covering both features,** so the founder files one Google verification (calendar plus the restricted Gmail scopes, with the yearly security assessment that Gmail needs) and one Microsoft publisher verification, not two each. This merges S1 question 9's review part and S2 question 7 into one outside clock for the founder.
* **B. PF-4p's table goes in its own area file** `platform-client-identity.prisma` (P-600 condition 1), not PF-3's `platform.prisma`; only the back-relation lines go under `platform.prisma`'s slot comments (rev 16.6). Its migration test follows rev 16.7.
* **C. PF-23w waits on FO-3f (#1785)**, which has the booking files open; it changes FO-3's `runtime-ports.ts` only after FO-3f merges (the P-526 touch rule). Lead B (FO-3's owner) OKs that one swap.

**S1's questions:**
1. **Domain and DNS (founder).** Agreed: Route 53 in the founder's account with a `staging.` sub-zone. Already on the founder list.
2. **Who builds the AUD rows (release holder).** Lead B's view: agree with the split. A PF/FO lane can build AUD-1b, AUD-1c, AUD-2, AUD-3, AUD-4 and AUD-5 behind the unchanged `AuditPort`; the release holder keeps AUD-1a and AUD-1m (case-side and shared files).
3. **Fail-closed audit (founder: a departure from SA-11-7, BR-5 and NFR5-08).** Lead B recommends fail-closed for Release 1: an action that cannot be audited does not happen, there is no second queue that could lose lines, and PF-0p's port already works that way.
4. **Object Lock compliance mode for 7 years (founder, already P-571 (3)).** Keep it, with the 1-day test bucket first, as the row says. This is separate from Lead B's governance-mode ruling for PF-8rc's **backup** vault: backups need an early delete path for a bad backup, while the audit archive must not have one.
5. **Support sessions in Release 1 (founder: scope).** Lead B agrees with the lane's recommendation: read-only sessions, plus the Owner's "Allow support to make changes" switch.
6. **The College's file-keeping period at source.** Lead B is on the Mac and can read it, together with open item 16 (the licence-number format). Lead 52 says which Lead does it.
7. **`.xlsx` reading (Lead B at the gate): ruled as recommended.** PF-10b's gate entry tests candidates against P-587's six checks. If none passes, Release 1 accepts CSV only, with a plain "Save as CSV" step, and `.xlsx` becomes an X row.
8. **Custom-field types and limits: ruled as recommended** (P-566 (3)). Ten types, 50 fields per record type, archive and never delete, and no formula or lookup fields.
9. **Mailbox reviews:** see amendment A. **IMAP:** in Release 1, as ruled above.
10. **Portal account key (with the release holder).** Lead B agrees that every case client gets an `fo_person`, so a person has one login. The release holder confirms in CS-K1.

**Review complete.** Batches 1-4 cover every row of the three lanes. Lead B approved (or approved with amendments) all of its own rows. The release holder's rows are left to the release holder, with their joins checked.

## Held after review (15 Nov 09:3x IST): duplicates of the release holder's case-side draft 2

Lead B's duplicate check missed `design/case-side-rows-draft2-2026-11-14.md` (on `lead/2026-11-07-lead31`, not yet in BACKLOG). It already shapes several things the lanes re-shaped. **These approvals are held** until Lead 52 and Lead B settle one owner for each:

| Lane rows | Draft 2 rows |
|---|---|
| PF-29a-f (tasks) | CS-T1, CS-T2 |
| PF-30a, PF-30s, CS-30c (find) | CS-S1, CS-S2 |
| PF-R1-R3, PF-R2cs (reports) | CS-R1, CS-R2 |
| CS-26e (person export) | CS-X1 |
| CS-P1 (erasure and legal hold) | CS-X2, CS-X3 |
| PF-F2, PF-F3, PF-F4 (file rail) | CS-D2 (tus), CS-D3, CS-D4 |
| S3's CS-D2, CS-D3, CS-D4 (same ids, different rows) | CS-D5, CS-D6 |

QA-474 (decision, close, reopen) is draft 2's CS-C1.

**Lead B's proposal** (sent to Lead 52):
* **Platform owns the shared rails, and the case side registers on them.** That is one task store, one find door, one metrics registry and one file rail. Draft 2's CS-T1, CS-S1 and CS-R1 shrink to the case side's registrations and queues; CS-T2, CS-S2 and CS-R2 fold into PF-29f, PF-30s and PF-R3; CS-30c and PF-R2cs are dropped.
* **Draft 2's older ids are kept where the rows are the same:** CS-X1, CS-X2 and CS-X3 stay; CS-26e and CS-P1 are dropped.
* **PF-F2 adopts CS-D2's tus protocol** (open standard, P-502) with `@tus/s3-store` as the platform rail; PF-F3 and PF-F4 replace CS-D3 and CS-D4.
* **Draft 2's CS-D1, CS-D1b, CS-D5 and CS-D6 stay the release holder's.** S3's CS-D2, CS-D3 and CS-D4 are dropped.

## Batch 5: consolidated (15 Nov 09:4x IST; Lead 52's ruling on the draft-2 duplicates)

**Ruling (Lead 52, P-486, P-584's pattern, reversible):** platform owns the shared rails (one task store, one find door, one metrics registry, one file rail), and the case side registers on them. The texts below are the platform rows to copy.

**How to read them:**
* "Base" means the lane row's text at the named commit, kept word for word except where a line below replaces it.
* Every earlier amendment (batches 1-4: the rename, `/api/platform/files`, rev 16.7, and the rest) still applies.
* Where the lane row and draft 2 differed, the line says which design wins and why.

### Tasks: PF-29a to PF-29f (base: S2's TK-1 to TK-6, `shaping/s2-front-office-case` at 93db01193)

| Row | Base | Changes |
|---|---|---|
| PF-29a | TK-1 | none. `plat_task` in `platform-tasks.prisma`. |
| PF-29b | TK-2 | none. `TaskPort` with `registerHost`. |
| PF-29c | TK-3 | none. |
| PF-29d | TK-4 | **Front-office half only:** the front office registers `fo_person` (context LEAD or PROSPECT). The case side's `case` and `case_client` hosts, today's `CaseTask` handling and the **Unassigned-cases queue route** are **CS-T1 (trimmed, the release holder's)**. Touch drops `api/src/case-delivery/tasks-host.ts` and the `submission-record.ts` line. |
| PF-29e | TK-5 | none (waits on PF-4b). |
| PF-29f | TK-6 | **Folds in CS-T2 (the work screen).** The page has three tabs: **My Tasks · Unassigned tasks** (for `agent/task:assign` or `view.all`) **· Unassigned cases**. The last tab reads CS-T1's queue route and shows only for `agent/case:edit` or `agent/case:assign`. Each row shows what, case number and client (or the lead's name), the due date with "Overdue" in words, the stage, and the type label. Actions: one-click **Take it** on a case, **Done** and **Reassign** on a task. Counts on the tabs; empty and error states in words; no hand-over dialog (X-18). Done when adds: "a Take it race shows the other person's name"; "a person without the keys sees no Unassigned tabs"; "buttons have screen-reader names"; "phone width (375)". The touch list adds one link in the staff navigation; `web/src/runtime/work.tsx` (CS-T2's) is not created. |

### Find: PF-30a and PF-30s (base: S2's FD-1 and FD-3)

| Row | Base | Changes |
|---|---|---|
| PF-30a | FD-1 | none. `FindPort`, `GET /api/platform/find`, the front office's finder. **The case finder is CS-S1 (trimmed, the release holder's):** it keeps `case_party_index` and its triggers and registers with `FindPort`. CS-30c is dropped. |
| PF-30s | FD-3 | **Folds in CS-S2.** It adds:<br>• results the viewer cannot open are counted only ("3 more you cannot see") and never linked;<br>• recent searches are never stored;<br>• the matched part is highlighted;<br>• a person's result shows their role, case number and stage.<br>Done when adds: "results within STANDARDS §9's budget on 100 Sample firms"; "no result shows 'No matches. Try an email, phone or file number'"; "keyboard only". `web/src/runtime/search.tsx` (CS-S2's) is not created. |

### Reports: PF-R1, PF-R2fo, PF-R2cm, PF-R3 (base: S3's rows, `shaping/s3-money-unassigned` at 651fa4ce2)

| Row | Base | Changes |
|---|---|---|
| PF-R1 | PF-R1 | **`MetricRegistry.register` takes CS-R1's `MetricDefinition` shape as its zod type** (source, aggregation, money treatment, drill target; AG-14-4), so the case side registers without a second shape. Q8 is ruled (live reads under a read budget; four seeded roles). |
| PF-R2fo, PF-R2cm | as written | none. |
| PF-R2cs | — | **Dropped.** The case metrics are **CS-R1 (trimmed, the release holder's)**, registered through `MetricRegistry`. |
| PF-R3 | PF-R3 | **Folds in CS-R2.** The Owner's landing dashboard has:<br>• 4-6 number cards, each with "what this counts";<br>• the stage bar (from CS-R1's case metrics);<br>• the **overdue-by-person** list, linking to PF-29f's work screen;<br>• a month picker;<br>• the Individual/Corporate switch;<br>• CSV export of each table for `agent/report:export`, with one audit line (AG-13-43).<br>Done when adds: "the screen equals the API for the seeded firm"; "a `view.own` holder sees their own view and a `view.all` holder sees the firm"; "phone width". `web/src/runtime/dashboard.tsx` (CS-R2's) is not created. |

### The file rail: PF-F2, PF-F3, PF-F4 (base: S3's rows; replaces draft 2's CS-D2, CS-D3, CS-D4)

**PF-F2: uploads that resume, on tus (replaces the base's own session tables).**
* **Item:** the platform's one upload rail on the **tus protocol** (an open standard for resumable uploads, P-502):
  * server `@tus/server` with `@tus/file-store` locally and **`@tus/s3-store`** on PF-F1's bucket; client `tus-js-client` in `web/src/lib/resumable-upload.ts`;
  * all three libraries through the STANDARDS §1 gate and P-587's checks in the PR (licence, upkeep, maintainers, Scorecard, recorded and not assumed), added by PF-L's one-PR rule.
* **Mounting and doors:** mounted at `/api/platform/files/uploads` (batch 2, amendment 4). **Doors register** with `UploadDoorPort.register(door, { authorize(ctx, meta), allowedKinds, onComplete(tx, file), onClean(tx, file) })`; the doors are `STAFF`, `CLIENT_LINK`, `CLIENT_PORTAL` and `SUPPORT`.
* **Every request checks access:**
  * The upload id is made by the server and carries the firm, the door and the door's target. For a case door that is the case and the checklist line or document type, taken from tus metadata.
  * Every tus request checks the session's firm and the door's `authorize`. Another firm's or another person's id answers 404.
* **At creation:** PF-F4's checks run on the declared `Upload-Length` and type, and nothing is staged on a refusal.
* **On finish:**
  * PF-F4 checks the actual bytes;
  * `FilesPort.put` stores the file under the door's key;
  * `plat_file` is written as `SCANNING`, and PF-F3's scan job is queued;
  * the door's `onComplete` runs;
  * the staging copy is removed.
* **Expiry:** an unfinished upload expires after 24 hours (Sample; tus's expiration extension). A PF-14 job cleans it up, and **asks `LegalHoldPort` first**: if the person is held, the upload is kept and listed.
* **Storage:** `plat_file` is the only new table (`platform-files.prisma`: firm, key, sha256, size, media type, scan state, scanned at, signature name). tus keeps its own upload records, and the base's `plat_upload_session` and `plat_upload_part` are **dropped**.
* **Screen words** (from CS-D2): "Upload paused: reconnecting", "Resumed, 62%".
* **Done when (a pass and a fail each):**
  * a transfer cut mid-file resumes from the server's offset, and the finished file's sha256 matches;
  * a repeated chunk is stored once;
  * finished bytes that contradict the allowed kinds are refused, and nothing is stored;
  * another firm's or person's upload id → 404;
  * an expired upload cannot be finished;
  * a held person's expired upload is kept;
  * the declared size over the limit is refused at creation;
  * a browser test cuts the network mid-upload and the file completes;
  * the migration test follows rev 16.7.
* **Waits on:** PF-F4, PF-F1 (for S3) or the local store, PF-14, PF-12, PF-21b (`LegalHoldPort`; its fake until then).
* **Breaker:** yes (schema, public door). **Size:** 2 PRs (the rail; the client library and the words).

**PF-F3: nothing served while scanning (base PF-F3, with CS-D3's gate).**
* **Replaced: the gate moves inside `FilesPort` itself**, CS-D3's design, so no door can skip it. The base had a `servable()` wrapper.
  * `FilesPort` gains `scanState(key)` and `markScanned(key, state)`, plus `getForScan(key)` for the scan job only.
  * `get` and every signed link refuse anything not `CLEAN`, answering **409 "Still being checked"** while scanning and **410 "Removed: unsafe file"** when quarantined.
  * The base's "a test walks every route that returns file bytes" stays, as a second guard.
* **Added:**
  * `ERROR` retries three times, then the file stays `SCAN_PENDING` for staff (never `CLEAN`), with the base's alert.
  * `INFECTED` is quarantined: kept for the audit and never served. Staff are told in words; the uploader is told "This file could not be accepted".
  * The door's **`onClean`** runs in the scan job's transaction, which is where the case side writes `document.accepted`, only for a `CLEAN` file.
  * The EICAR string is built at test time and never committed.
* **Scanner (Q6, ruled):** AWS's managed malware scanning for S3 if its own docs confirm `ca-central-1`, else ClamAV in its own container (clamd `INSTREAM`, behind a setting, off in CI, with one opt-in smoke test).
* **Done when adds:** "while scanning → 409; infected → 410; `onClean` runs once for a clean file and never for an infected one".

**PF-F4: one file check (base PF-F4, with CS-D4's checks).**
* **Changed, one rule: the bytes decide the type.**
  * A file whose name or declared type disagrees with its bytes is **stored under the bytes' type with its name corrected** (CS-D4's rule), and a double extension is cleaned.
  * It is refused only when the bytes' type is not allowed at that door.
  * This replaces the base's "a declared type the bytes contradict is refused": the result is just as safe, and friendlier to staff and clients.
* **Added from CS-D4:**
  * an image whose header declares more than **89.5 megapixels** (Sample; read from the PNG `IHDR` and JPEG `SOF` headers, no library) is refused, and nothing is stored;
  * a PDF with active content (`/JavaScript`, `/OpenAction`, `/AA`, `/Launch`, XFA, embedded files) is **flagged, not refused**, because IRCC's own forms carry scripts. It is shown as "Contains scripts: opened only in the safe viewer", detected by a byte scan with no library.
  * The "damaged PDF" check needs a parser, so it stays in the case side's adoption (CS-D1, through the form engine's existing Python door). Platform code never imports `engine/`.
* **Allowed kinds:** the platform knows the union (PDF, JPEG, PNG, HEIC, TIFF, Word, Excel). **Each door narrows it** through `allowedKinds`. The case side's per-document-type list (`DocumentType.allowed_media`, default PDF, JPEG and PNG) is the case side's, in its adoption rows. Plain ZIP is refused in R1 (Q7, founder confirmation pending).
* **Done when adds:**
  * a bomb PNG header is refused and stores nothing;
  * a renamed JPEG is stored as `image/jpeg` with a `.jpg` name;
  * an IRCC form PDF with scripts is stored and flagged;
  * a door that allows images only refuses a PDF, with the allowed list in words;
  * every refusal ends "Nothing was stored."

**PF-F1 and PF-F1c:** unchanged (batch 2). **The release holder's adoption rows:** CS-D1 and CS-D1b move the case side onto the rail (register the case doors with `UploadDoorPort`, `mediaOf` → PF-F4's `detect`, the damaged-PDF check). CS-D5 and CS-D6 stay the case side's. S3's CS-D2, CS-D3 and CS-D4 are dropped.

### Dropped from the lanes (do not copy)
CS-26e (→ CS-X1), CS-P1 (→ CS-X2, CS-X3), CS-30c (→ CS-S1), PF-R2cs (→ CS-R1), S3's CS-D2, CS-D3, CS-D4. Also dropped: the base PF-F2's `plat_upload_session` and `plat_upload_part`.
