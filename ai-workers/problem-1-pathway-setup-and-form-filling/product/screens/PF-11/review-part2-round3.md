# Review: PR #3686, PF-11 part 2, the front office's sections in the firm's full data download (R1.22), round 3

Head reviewed: 938387bd130e3328ea8109cebbab0f38e7f2985c. Diff only, from the last approved head c359c400409baa5b97da72c7ba2a535b229dee3e.
Base: claude/runtime-pf11-hygiene at bd083f8. Run from a `git archive 938387b` copy in the scratchpad, with its own generated Prisma client and node_modules linked. The shared Postgres was on 127.0.0.1:54329, and the isolated copy was on runtime port 4436. Nothing ran on :4400.
While I worked, the shared checkout was switched to another branch for about 3 minutes and then switched back (the coordinator's notice). I read nothing from it in that window: every result below comes from the archive copy.

**Verdict: Approve (Ship).** No Blocker or Major is open. Two new Minors may be carried.

## (a) The merges are pure
- `git diff b9a14b4 c359c40`, the PR's own diff before the merges, matches `git diff bd083f8 bba277e` line for line. The interdiff, ignoring index and hunk headers, is 0 lines.
- `git range-diff` shows 41f52b9 = and c359c40 =.
- So the PR's diff against its base, `git diff origin/claude/runtime-pf11-hygiene...938387b` (9 files, +163/−22), is round 2's diff plus 938387b only.

## What I ran (on 938387b)
| Check | Result |
|---|---|
| `check_pf11_firm_export.ts` (tsx, api/tsconfig.json) | 70 passed, 0 failed, run twice (no flake). The scratch DB was dropped each time. |
| `product/tools/typecheck.mjs` | PASS: no new type errors (15 known, 0 fixed). The first try failed only because my archive lacked `prototype/p2`, `packages/` and the root `AGENTS.md`; with them added, it passed. |
| `graph.mjs --check` | exit 0 (G1 0, G2 0, G4 0, G5 0). Run read-only on the shared checkout once it was back at 938387b. |
| `tools/count-any.mjs` | 416 (baseline 433), the same as the base |

## Mutations (each applied alone, run, then reverted)
| # | Mutation | Caught by |
|---|---|---|
| M1 | `currencyOf` without the `<x>_currency` lookup (the old rule) | the new DW9 line only (`quoted_fee_minor` falls back to a plain number) |
| M2 | `_cents` dropped from the suffix pattern | the new DW9 line only |
| M3 | the "stored file" README line written before the read (round 2's double listing) | the tightened Major 4 line only |

## Probe 1: does the order change alter DW5's cap or the README-last rule?
- **The cap result does not change.** `add` checks before every entry, and every entry's size is positive. The package is therefore refused exactly when the sum of its entries passes the cap, in any order. The finished zip is still checked again.
- **README last holds.** README.txt is the final `add` (`package.ts:67`), and its own size counts. A direct probe with a cap of 400 on a one-section package returns ExportTooLarge with no file read. The live zip's last entry is README.txt.
- **What did change: the timing of reads between modules.** Before, every module's sections went in first. Now each module adds its sections and then its files. A direct probe used module a (one file) followed by module b (sections over the cap). It returned ExportTooLarge after reading a's file once; the old order read nothing. See Minor 1.
- **No effect in production today.** `platform` is registered first and has `files: []`, and `front-office` is the last module. A probe in that order with the cap crossed on the front office's sections read no file. DW5's line still passes and still fails when the per-add check is removed.

## Probe 2: can the currency rule misfire? Every `_minor` / `_cents` column in the Prisma schema (dmmf)
| Model (table) | Column | Exported? | Currency chosen | Port check |
|---|---|---|---|---|
| FoConsultRecord (fo_consult_record) | quoted_fee_minor Int | yes | quoted_fee_currency (enum FoConsultCurrency → text) | accepted |
| FoProspect (fo_prospect) | value_cents Int | yes | currency (String → text) | accepted |
| FoRetainerFeeRow (fo_retainer_fee_row) | amount_minor BigInt | yes | currency (String → text) | accepted |
| PlatformPlan (platform_plan) | monthly_price_cents, yearly_price_cents | no (not a firm table) | through tableSection: currency (String) | accepted |
| Money* (11 models, 16 columns: invoice line, credit note, payment, refund, trust, credit, write-off, move line, plan, instalment) | `*_minor` Int | no (the money lane's own exporter, FO-7*) | through tableSection: currency (enum MoneyCurrency → text) | accepted: 16 minor columns |

- The 15 platform tables have no `_minor` or `_cents` column, and their module passes `checkModuleExport` unchanged.
- No other numeric column in an exported table ends in `_minor` or `_cents`. The pattern is anchored, so `*_minutes`, `start_minute`, `version`, `seq` and similar columns stay `number`.
- **The port refuses the bad cases (probed directly):**
  - A minor column naming a `number` column: "names no currency column".
  - A minor column naming an absent column: the same refusal.
  - A fractional minor value: "is not whole minor units".
  - A refusal fails the build in words. It is never silent.
- **The one silent case: a `_minor` or `_cents` number with neither `<x>_currency` nor `currency` stays `number`.** No exported table has one today. See Minor 2.
- **Held and secret-named columns are not chosen.** `names` is built after those columns are removed, so the rule falls back to `currency`, else `number`.

## Probe 3: is the README right, and is anything listed twice?
- **One line per file, in its own module's block.** A direct probe used a missing file and a stored file in module a, plus a stored file in module b:
  - the missing file is named once, as missing;
  - the stored files are named once each, with their sha256;
  - `missing` = [{a, gone.pdf}];
  - the module's words follow its file lines.
- **The live zip from the isolated copy's Owner:** 51 entries, 35 under `front-office/`, the README last, and one line per section with its row count. The headers for `quoted_fee_minor,quoted_fee_currency`, `value_cents,currency` and `amount_minor,currency` are as the rule says.

## Issues, ranked
**Minor 1 (Should, may be carried): DW5's "past the cap on the sections, the stored file is never read" now holds only within a module.**
- Where: `package.ts:53-66`. Once a module registers after the front office (the money lane, named in `front-office/export/sections.ts:11`), the front office's stored files are fetched before that module's sections can refuse the package. The fetches are bounded by the cap plus one file, and the result is the same: refused, nothing stored.
- Fix, either:
  - add every module's sections first, then every module's files, while keeping the README lines per module in their own arrays; or
  - rename the DW5 line and the package comment to say "within a module".

**Minor 2 (Should, may be carried): a `_minor` or `_cents` number with no currency column falls back to `number` without a word.**
- Where: `platform-sections.ts:47`. This would make the README's "beside their own currency column" untrue for that column.
- None exists today (see the table above).
- Fix: have `tableSection` throw on such a column, or extend DW9's schema-wide check, so a future table fails loudly.

Round 2's Minor 2 (the README's size is counted last) is left on purpose. I agree: the cap result is the same.

Seen, not in this diff (part 1): the README says "(1 rows)", and the create answer has `requestedByName: null` while the list fills it in.

## Scope, dimensions, journey
- **D1–D20 and BIC §6:** not re-scored. This round is diff-only and runtime-only: no screen, and §6 covers case-side screens. Round 1's live run stands.
- **Journey score (reviewer): 8/10, pass, no criterion at 0.** Report: `screens/PF-11/journey-test-reviewer-part2-round3-2026-11-26.md`.
- **Could not check:**
  - Live front-office money and file rows: the sample firm has none, so values and the missing-file path rest on the suite's real `build`.
  - A real object store.
  - D17 and D20 (the founder's walk).

Reviewer: Approve 938387bd130e3328ea8109cebbab0f38e7f2985c
