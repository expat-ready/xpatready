# Brief: PF-18np, the shared notification port, interface and fake only (map row 50; cloud builder lane; row owner Lead B)

Written 16 Nov by Lead B (6). Rows rev 16.31, amended by rev 16.41 (one per person per item, AG-7-39 rule 2; the group of each kind). **Starts now:** it needs only `ports/` and zod. It is a shared contract, so the release Lead reads it before the label (P-423). **Model:** Opus 5.5, effort **medium** (a port with no table and no route). Waiting on it: PF-18n (the table, preferences and routes) and the case side's CS-DL1, CS-NT1b, CS-N1, CS-D6, CS-98c and CS-98d.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-18np` and take **one row, PF-18np**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** requirement text, in full:
* **AG-7-39** rules 2 and 10 and its "Duplicate beats a miss" edge case, in `agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md`;
* **AG-16 §3.3** (the eight groups' table), in `agent/AG-16-firm-settings-and-integrations_v1.24_2026-10-25.md`.

On `main`, read: `ports/consent.ts` (the in-transaction port pattern and its fake), `ports/audit.ts` (`FirmId`), `ports/contracts/` with `tools/check-port-contracts.mjs` (PF-0c), and `ports/README` if present.

**What to build:** new `prototype/studio/ports/notifications.ts`, zod only, with the fake in the same file.
* **`NotificationGroup`:** the eight groups of AG-16 §3.3, as a zod enum: `WORK_HANDED_TO_ME | NEEDS_YOU | MY_DEADLINES | CLIENT_MESSAGED_ME | MENTIONS | TEAM_WATCH | PAYMENTS | FIRM_AND_CONNECTIONS`. Security emails are not a group, since they are always on and have no switch.
* **`NOTIFICATION_KIND`:** a `const` object of kind names to kebab-case strings, so a consumer writes `NOTIFICATION_KIND.KEEP_PERIOD_PASSED`. It ships **empty of product kinds** except one test kind, `PORT_SELF_TEST: "port-self-test"`; each consumer row adds its own lines.
* **`NOTIFICATION_GROUP`:** `Record<NotificationKind, NotificationGroup>`, typed so that a kind without a group fails the type check. Each consumer adds two lines: the kind and its group, from §3.3's "What is in it".
* **`NOTIFICATION_ITEM_KIND`:** a typed list of item kinds, which ships with `case`, `firm`, `staff` and `review-round`. Consumers add their own.
* **The call:** `NotificationPort.notify(tx, recipient: { staffId }, kind, item: { kind, id })`, returning `Promise<void>`. It is the exact shape the case-side briefs already use (rev 16.31).
  - Inside the caller's transaction.
  - Ids only: no free text, no names and no numbers in the call (AG-7-39 rule 10).
  - An unknown kind or item kind, or an id that is not a uuid, is refused with a zod error before anything is written.
  - The call promises no delivery. The real adapter is PF-18n's: it checks preferences, builds the link and stores the row.
* **The fake** (`fakeNotifications()`) keeps records in memory and lists them with `sent()`.
  - **One record per person per item** (AG-7-39 rule 2 and its edge case): a second notify for the same `staffId` and item replaces the kind and time and adds no record.
  - `markRead(staffId, item)` lets a test check that a later notify after reading makes a new record.
* **The shared contract** `ports/contracts/notification-port.contract.ts` runs the cases below on any adapter. PF-18n runs it on the real one.

**Named test cases (P-606):** list `PF-18np DW1` to `DW4` in the PR body before writing code. They live in the contract file plus `tests/check_pf18np_port.ts`, each with a pass and a fail.
* **DW1:** two notifies for one person and item give one record, with the newer kind. After `markRead`, a new notify gives a second record.
* **DW2:** an unknown kind, an unknown item kind, and a non-uuid id are each refused, with nothing recorded.
* **DW3:** the type check fails on a kind with no group (a `// @ts-expect-error` line in the test), and every kind has a group.
* **DW4:** `tools/check-port-contracts.mjs` passes on the fake, and `ports/` imports nothing but zod and its own files.

**Touch list (nothing else):** new `ports/notifications.ts`, new `ports/contracts/notification-port.contract.ts`, new `tests/check_pf18np_port.ts`, and the ports list in `ports/README` if one exists.

**Must still be true:** every existing suite passes. No table, no route, no preference check: those are PF-18n's, which may add to this file but never changes `notify`'s shape.

**Duplicate check (P-526):** BACKLOG (PF-18np, PF-18n), open PRs (`notifications.ts`, `NotificationPort`), `main` (no `ports/notifications.ts`), BUGS; one `Duplicate check:` line.

**Parallel safety:** a new file. Once it merges, consumer rows only add `NOTIFICATION_KIND`, `NOTIFICATION_GROUP` and `NOTIFICATION_ITEM_KIND` lines, never reorder or rename them, and merge `main` on a conflict.

**Reviewer only** (no breaker: no data, no door). **P-610:** under 150 lines.
**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5, with no model switch mid-session. Finish whole. If an item needs more than its touch list, stop and ask in a PR comment. Never widen the row silently.
**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
