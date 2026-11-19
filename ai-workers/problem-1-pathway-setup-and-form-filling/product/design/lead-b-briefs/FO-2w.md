# Brief: FO-2w — every win raises `prospect.won` (R1.72's chain, Build Lead C's call, 19 Nov) (row owner Lead B / Build Lead A)

Written 19 Nov 21:01 IST by Lead B (7). **Model: Opus 5.5, effort: medium.**
**Duplicate check:** no open PR or BACKLOG row makes Signed offline emit `prospect.won`. Checked 21:01 IST against the open PRs and BACKLOG on main; the row was shaped in `lane-order-P733-2026-11-19.md` ("Front-office rows for R1.72"). Build Lead C (3) puts it **in R1.72's chain before proof**: a paper-signed win that never opens a case breaks "a won prospect hands over into a case". J-72 walks both wins, and CS-K1 part 2 opens after this merges.

## Main today
* Only Convert emits `EVENT.PROSPECT_WON` (`front-office/sales/prospects.ts:252`).
* Signed offline (`front-office/retainers/service.ts:610-628`) moves the prospect to WON with `wonVia SIGNED_OFFLINE` and an audit line, but emits only `retainer.signed_offline`.

R1.31's stage rule already holds and is not touched.

## The part
* **One helper**, for example `winProspect(tx, …)` in `front-office/sales/`. It moves the prospect to WON and emits `prospect.won` with its subject part (contracts §7 §2.6, `wonSubjectOf`), **once per prospect**, in the win's transaction.
* **Convert** and **Signed offline** both call it. The e-signature win (FO-6) calls it when FO-6 lands; leave a one-line note for FO-6's owner.
* Signed offline still emits `retainer.signed_offline` as today, and now emits `prospect.won` too.
* A second win on a WON prospect, for example a second offline sign or a Convert after it, emits nothing more. This is checked under the prospect's lock.

## Done when
`tests/check_fo2w_won_event.ts`, with a pass and a fail each:
* a paper-signed retainer emits exactly one `prospect.won` with the subject part;
* a second offline sign, or a Convert afterwards, emits none;
* a forced failure after the stage move leaves neither the move nor the event (one transaction);
* Convert still emits once;
* removing the helper call from Signed offline makes the suite fail.

Also: FO-2 part 3's suites and `check_fo5*` retainer suites are green, and J-31 is green.

## Touch list
`front-office/sales/prospects.ts` (the helper and Convert's call; keep FO-2pv's edit route out of this file: FO-2pv uses a new `sales/prospect-edit.ts`), `front-office/retainers/service.ts` (Signed offline's call), `tests/check_fo2w_won_event.ts` and `MODULE.rows/FO-2w.md`. No migration. About 200 lines.

## Then
Build Lead C's CS-K1 part 2, with J-72 walking both wins. qa proves R1.72 (Build Lead C's item).
Source: AG-2-28a@c0625d66, AG-2-47@ee880c53, P-733.
