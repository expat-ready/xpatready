# FO-7q part 3: review (R1.56, runtime, API reads only)

Commit reviewed: `e51fcc3e5bc93f5d0f3489f272729c4a0897c8ed` (branch `claude/runtime-fo7q3-parties`, PR #3306), diff `origin/main...e51fcc3e5`. Reviewer: a session that did not build it. Paths are relative to `prototype/studio/`.

**Verdict: Ship after fixes (Changes).** One Major is open: a client whose case was opened on the case side is never found by the Bill-to search. No Blocker. Walls, C5 scope, SQL safety and the list's labels hold.

## What I ran
* `check_fo7q_parties.ts` 33/0 (twice: once as is, once with timing probes in a scratch copy), `check_fo7q_reads.ts` 52/0, `check_pf6b_permission_rules.ts` 33/0, `check_csmv1_money_visibility.ts` 33/0, `check_pf12_walls.ts` 110/0, `check_fo7b_invoices.ts` 108/0. Postgres :54329. No app server, no :4400.
* Mutations (in a scratch copy, never in the repo) against `check_fo7q_parties.ts`. Dropping `won_at is not null` fails 4 checks. Dropping the merged filter fails 3. Replacing the C5 scope with `true` fails 4. Dropping the case-client branch fails 1. Removing the LIKE escaping fails 1. A guessed name for a person with no stored name fails 3. Hard-coding province "ON" fails 1. Three mutations survive because PF-12's wall (xr_app plus RLS) hides other firms' rows anyway: dropping `p.firm_id`, dropping both `p.firm_id` and `w.firm_id`, and dropping `firmScope` in `labelsOf`.
* A probe (scratch copy) for J7 below: a person made the way case opening makes one (case_client linked, no prospect), with an invoice on their case. The ALL-scope search finds 0 hits and the case-scope search finds 0 hits, yet the invoice row shows `billTo {"kind":"PERSON","name":"Client Wonbee Direct"}`.
* Timing (sample fixtures): HTTP search 15–20 ms; a list page with `labelsOf` 8–12 ms (STANDARDS §9: under 200 ms). `labelsOf` makes 3 batched reads per page, never one per row. `graph.mjs --check` exits 0 and reports no gap on the new route.

## The builder's seven choices
1. **Won = subject of an `fo_prospect` with `won_at` set: not enough (Major M1).** It is right for front-office arrivals, but it misses every client born on the case side. When a case opens without a `clientId`, `runtime.ts:357` calls `clients.ts newClient`, then `partyFor` (`clients.ts:36-46`), then `fo-person-port.ts:23-30` `ensureForClient` with `prospectId` null. That makes a new `fo_person`/`fo_company` with no prospect at all. The CS-K1 linking job does the same for existing clients (`clients.ts linkClient`). These parties are the firm's clients, not prospects, and most invoices are on a case (AG-6-1 rule 1: "On a case it is addressed to the case's Bill to"). Even the case-scope branch cannot reach them, because `won(...)` is ANDed (`reads/parties.ts:79`, `:85`, `:90`). The concept's hint reads "Only clients appear here; a prospect can't be invoiced." **Fix:** treat a party as won when it is the subject of a won prospect **or** the linked party (`case_client.fo_person_id` / `fo_company_id`, same firm) of a case. A party whose only record is an open, lost or nurtured prospect stays unfound. Add a pass test for a case-side client with no prospect, and keep P2's fail tests. If the tech lead rules that the narrow meaning is intended, record the ruling in the PR and this becomes a note.
2. **Merged-away party excluded: correct.** FO-9b's merge moves `fo_prospect.subject_*` to the survivor (`front-office/duplicates/merge/columns.ts:20-22`, `service.ts:161-176`), so the survivor stays won. An invoice on a merged-away id keeps that party's own stored name in `labelsOf` (stored, never guessed).
3. **Names only, never email: correct**, and P3 catches a change (mutation fails 3). The SQL name expression (`:84`) matches `personName` exactly (trim, drop blank parts, one space).
4. **Scope = MoneyVisibility parties plus the clients of cases in scope: correct C5.** It matches `visibility.ts scopeSql`: a party with no case is visible by party, and a case's client is visible through the case. An empty scope returns early, and `seen()` would give false anyway. Firm: `firmScope(ctx.firmId)` is on every subquery (`k.firm_id`, `cc.firm_id = k.firm_id`, `w.firm_id`). PF-12 RLS sits underneath. The request carries no firm (`strictObject` gives 422 on `firmId`).
5. **Cap 20: acceptable** (Sample size, labelled). See m2 on the cut order.
6. **Province = `provinceCode(billToProvince(firm, party))`: correct.** It is the same expression `drafts.ts:69-70` stores on a new draft, so the hit's province equals the new draft's Bill-to province. Null when the firm has none (P6 fail test).
7. **caseLabel = `runtime_case.case_number`: correct.** It is the A24-1 number, never changed (trigger). Null with no case, or a case outside the firm.

## Other checks
* SQL safety: every value goes through `Prisma.sql` tagged templates (no `$queryRawUnsafe`). `\`, `%` and `_` are escaped for ILIKE (P7 catches a change). q is 2–100 characters after trimming, and an array q gives 422.
* No name leaks across firms or outside scope. A hit carries only kind, id, name and province, with no email or phone. `labelsOf` names only the parties of invoice rows the caller can already see (rows filtered by `scopeSql` first). A foreign id gets name null (P1).
* `InvoiceView` (FO-7b's strict GET `/invoices/:id`) is unchanged. `billTo` and `caseLabel` are added only to list rows and `/detail`.
* Reads only. No migration, no write, no audit line (none is required for a read).

## Issues, ranked
| # | Sev | Must/Should | Where | Issue and fix |
|---|---|---|---|---|
| M1 | Major | Must | `reads/parties.ts:79,85,90`; `clients.ts:36-56`; `fo-person-port.ts:23-30` | Clients born on the case side (no prospect) are never found, not even through their own case in scope. Fix as in choice 1, plus a pass test. |
| m1 | Minor | Should | `tests/check_fo7q_parties.ts:162` | "an empty page reads no labels" only checks `items.length === 0`, so it cannot fail if labels are read. Rename it, or assert that no label read ran. |
| m2 | Minor | Should | `reads/parties.ts:86,91,99` | Each kind is cut at 20 by `lower(concat_ws(' ', btrim(given), btrim(family)))`. That expression is not the displayed name: a blank (not null) given name sorts with a leading space, and Postgres collation differs from JS `localeCompare`. The merged list is then re-sorted in JS, so with more than 20 matches of one kind the top 20 shown can differ from the true top 20. Order by the filter's own expression (the `nullif` form), and sort the two kinds in one SQL `union all ... order by ... limit 20`. |
| m3 | Minor | Should | `tests/check_fo7q_parties.ts:127,133` | The P1 fail cases pass with the SQL firm predicates removed. RLS (PF-12) enforces the rule, so the outcome is proven but the SQL predicate is not. Name it ("PF-12 wall and the SQL filter"), or add one check through the owner client that does catch it. |

Notes, not findings: `labelsOf` on the list runs after the RepeatableRead transaction (`invoices.ts:97`), which is harmless for names. The draft write (`drafts.ts:63-66`) accepts any party of the firm, so the won-only rule lives in this read alone. That is outside this row.

## D1–D20 (API-only row: no screen, so D8, D12–D14, D17 and D20 are N/A; D17 and D20 stay with the founder)
D1 Requirement fit 3/5: (1) and (2) are built, but M1 misses case-side clients · D2 Data integrity 5: reads only, firm on every query · D3 Reuse 5: `billToProvince` and `scopeSql`'s rule are reused, not copied · D4 Rule integrity 4: won and merged hold; m2 · D5 Stability 5: idempotent reads, RepeatableRead · D6 Governance 5: MODULE row and header cite R1.56, G2, P-797, A24-1 · D7 AI trust N/A: no AI · D9 Flow 4: kind, id and province feed `POST /invoices` directly · D10 Language 5: "Type at least 2 letters of the name." · D11 Feedback 5: 401, 403 and 422 are distinct, and empty means [] · D15 Speed 5: 15–20 ms, 3 reads per page · D16 Testability 4: 7 of 10 mutations killed, the 3 survivors covered by RLS; m1 and m3 · D18 Provenance 5: names stored, province from the firm record, null never guessed · D19 Closure 3: Bill to cannot reach case-side clients (M1).

## BIC-01–BIC-20 (EXPERIENCE §6)
N/A for every check: no case-side screen in this row. The builder screen is FO-7s1's.

## Journey score (reviewer, the one score for this check)
**8.5/10 over the 8 criteria that apply** (7/8, scaled). Visual quality and accessibility are N/A with no UI. Report: `screens/FO-7q-3/journey-test-reviewer-2026-11-23.md`. Lost marks: task completed ½ and correct data ½, both from M1.

## Could not check
No UI walk, keyboard, 1024 px or zoom (no screen in this row). No real `:44xx` app run: the suites start their own Nest app on a random port. Search speed at production scale (an unindexed `%q%` ILIKE over the firm's parties) is untested; STANDARDS §9 sets budgets only with the sample data.

Reviewer: Changes e51fcc3e5bc93f5d0f3489f272729c4a0897c8ed

Verdict: Changes

## Round 2 (diff only: `git diff e51fcc3e5..d7a7a89a2`, code in `reads/parties.ts` and `tests/check_fo7q_parties.ts`)
Head reviewed: `d7a7a89a28e50bc7746e9d99aae918f1ec4eb023`. The commit also carries the screens/FO-7q-3 records, which I ignored (the round 1 records are unchanged).

**Runs:** `check_fo7q_parties` 38/0, twice. `check_fo7q_reads` 52/0. Mutations in a scratch copy, not the repo:
* Dropping the case-client branch for people fails 3 checks. That is the M1 fix: P2 PD and P4 via case D.
* Turning off C5 scope for people fails 6. Turning it off for companies fails 3.
* Dropping `won_at` fails 4. Dropping the merged filter fails 3. Dropping the NUL refine fails 1 (it gave a 500).
* Scale probe: 5,000 case-side clients plus the fixtures, user-R through PgMoneyVisibility, so the app scope passes 5,000 case ids. HTTP search takes 59–127 ms end to end, under STANDARDS §9's 200 ms. Order is by the shown name ("Bulk 1 Client | Bulk 10 Client | ...").

**Round 1 items**
* **M1 closed.** A client is the subject of a won prospect, or the linked party of any case of the firm (`parties.ts:88-89`, `:95`, `:100`). C5 still narrows the result (`in_scope`, `:90`). A party whose only record is an open or lost prospect stays unfound (P2 fail and P4 fail still kill the `won_at` mutation). `case_client.firm_id = runtime_case.firm_id` fails closed on an unfilled firm id. Merges re-point `case_client` through CS-K2, so survivors stay clients. New tests: PD is found (P2), found through its own case D in scope (P4), and not found outside scope (P4 fail).
* **m1 closed.** `labelsOf` on a row with no ids must give `billTo` null and `caseLabel` null (test :168-169). A wrong kind or a guessed name would fail it.
* **m2 closed.** One `union all` is ordered and cut by `lower(x.name), x.id` (`:102`), where `x.name` is the very name shown (the `nullif` form for people, `btrim` for companies). The JS re-sort is gone, so the top 20 is the true top 20.
* **m3 closed** by the rename, which names both guards (SQL firm checks and PF-12 walls).
* **Breaker M1 (speed):** each set is read once as a materialized CTE. Every CTE filters `firm_id = firmId` (session firm), and RLS sits underneath. Values are bound through `Prisma.sql`, and `${all}` is a bound boolean. Correct, and fast enough at 5,000 (above).
* **Breaker m1:** a NUL in q gives 422 naming q (test :196; the mutation proves it was a 500).

**New, Minor (Should, non-blocking)**
* r2-m1: the company case-side branch (`:100`, `c.id in (select cid from on_case ...)`) has no test that can fail. Removing it still passes 38/0, because CW also has a won prospect. Add a company with no prospect as the client of a case (it mirrors PD).
* r2-m2: "A name has no NUL character." names a control character. Only a crafted request ever sees it, so it is acceptable. "Remove the hidden character from the name." would be plainer (D10).

**Journey score, round 2:** J7 now holds, so "task completed" and "correct data" each go from ½ to 1. The score is 8/8 on the applicable criteria, 10/10 scaled (visual quality and accessibility are N/A: no UI). D1 and D19 rise to 5. D16 is 4 (r2-m1).

No Blocker or Major is open.

Reviewer: Approve d7a7a89a28e50bc7746e9d99aae918f1ec4eb023

Verdict: Approve
