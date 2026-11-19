# FO-4 part 2a: paused (P-716, Lead 85, 19 Nov) — resume note

**State:** stopped before any code. Read so far, on `main` 9d440b2f4 (after FO-2 part 3, #2140): the wave 1 Sales sheet row 2 (`design/lead-b-briefs/wave1-sales.md`, branch `lead-b-front-office`), `FO-4.md`, the concept r2 (`screens/fo-4-sales/concept.md` on `lead-b-front-office`), `api/src/front-office/sales/{routes,prospects,board-totals}.ts`, `sales/corporate/service.ts` `board()`, `sales/README.md`, and the web module `web/src/modules/front-office/{routes.tsx,sales/*}`.

**Scope (wave 1 sheet wins over FO-4.md):** Engage (Individual); the prospects board (via `GET pipelines/:type/board`) and list (`GET prospects?type=&stage=&owner=&from=&to=`) with "Move to…" (no drag library, BR-8; Won not offered); Mark lost and the Lost filter (`stage=LOST`); Convert (yes/no with AG-2-47 rule 16's warning) and Undo convert (`{ reason }`); the leads owner and date filters (`GET leads&owner=&from=&to=`). Tests DW9-DW11, DW13 (200 cards per column page, no sideways scroll), keyboard only, axe, 375/1024/1440 px. Opus reviewer + breaker at high (new screen). P-683: Approve on the branch head before opening the PR non-draft. Do not hand-edit shared MODULE.md lines (P-712).

**Resume item: two reads the API lacks** (agreed with the founder's tech lead on 19 Nov: add them in the 2a PR, about 40 lines, listed under "Shared-file lines" for Lead B):
1. **Stage ids on the board:** `GET pipelines/:type/board` (`sales/corporate/service.ts` `board()`) returns each stage's `key`, `label`, `kind` but no `id`, while `POST prospects/:id/move` needs `stageId`. Add `id` to each stage (one field), with an API check.
2. **The prospect lost reasons:** `POST prospects/:id/lost` needs `reasonId` (an active `PROSPECT_LOST` reason, merge-only `COMBINED_PROSPECT` excluded, `prospects.ts` `lost()`), but no route lists them (the reasons routes are FO-2 part 5). Add a read-only `GET prospects/lost-reasons` (key `agent/prospect:show`, declared before `prospects/:id`) returning `{ id, key, label }`, with an API check.

`sales/corporate/*` is FO-2b's: the wave sheet says to stop and ask Lead B on the PR before touching it, so ask (or confirm the founder's go) when resuming.

**Existing pieces to reuse:** `sales-frame.tsx` (Frame, menu: add Pipeline), `contract.ts` (zod shapes, `KEY`, `can`, `problemOf`), `session.ts` (`staffApi`, `useMe`), `take-it.ts` (mutation pattern), `loading.tsx`, `time.ts`. Keys: show/edit/assign as `KEY`; Mark lost `agent/prospect:lose`, Convert and Undo `agent/prospect:convert`.
