# PF-30a review: FindPort, the find door and the front office's finder (PR #2884)

Independent reviewer, fresh context. Reviewed commit `62fe3273d8a5c81e81e4f550d8a0cabbe7592dfb` on `claude/runtime-pf30a`, 21 Nov 2026. This row is API only (no screen), so the UI parts of the screen-review skill (D1-D20, the BIC table, widths, keyboard) are N/A. I reviewed the code and tests against BACKLOG row PF-30a and ran the isolated copy on :4487. Journey score: `journey-test-reviewer-2026-11-21.md` (8.75/10 scaled, API only).

## What I ran (US$0, no live AI)
* `tests/check_fd1_find.ts`: **49 passed, 0 failed**. `tools/check-port-contracts.mjs`: 26 ports, 0 problems, FindPort ×2.
* Existing suites, all green at this sha: `check_features_registry` 27/27, `check_pf0p_ports` 126/126, `check_pf1_module_routes` 28/28, `check_pf23m_log_calls` 15/15, `check_pf6b_permission_rules` 33/33, `check_pf21w_routes` 83/83.
* Live on :4487, behind the real guard and the walled `xr_app` pool. Signed in as R, T and S:
  * as R: email, phone (`416-555-0144`, `(416) 555-0144`), prefix, trigram (`Anabel Walk`), Lost label, `p00003` → P-00003, company `North`;
  * 1 character, 101 characters, `q=a&q=b` and `view=` are refused (400/422), with no echo;
  * firm B (S) gets nothing from firm A;
  * no typed query appears in `var/isolated-runtime_pf28/api.log` (it holds the route pattern only);
  * 40 requests in parallel: p50 261 ms, none partial.
* Nest DI is fine: the feature file registers both providers, the finder registers on start-up, and the live copy answers.

## Findings

### Blocker
None.

### Major
**M1. A cap applied before visibility hides records the caller may open, including their own.** `api/src/front-office/find.ts:62-64`: the name-prefix read takes the firm's 50 oldest matches (`take: 50`, `createdAt asc`) with no visibility in the query. `find.ts:77-81` applies `sees` / own-or-all only afterwards. The same pattern appears in three more places:
* prospect numbers: `find.ts:96-100` (`take: 50` by number, then `seeProspect`);
* companies: `find.ts:109-117` (`fo_sales_company_matches` limit 50 and a `take: 50` with no `orderBy`, then `seesCompany`);
* the person function's `seen` covers leads only, so a person visible only through a prospect can also be cut at 50.

*Reproduced on :4487:* the firm has 58 people whose name key starts with "ann", and 57 of them are older than T's own lead "Anneliese Mine" (L-00062). T's lead list (`GET /api/front-office/leads?view=all`) shows Anneliese. `GET /api/platform/find?q=Ann` as T returns `{"groups":[]}`, while `q=Anneliese` finds her.

In a real firm with many people named Mo…, Ann… or Li…, a view.own case officer cannot find their own lead by a short name. Typing "P-0" finds none of their prospects when the 50 lowest numbers belong to others. The house already fixed this pattern once: `leads.ts:55` is "in the query, before the page cap (review m5)". The row's "a view.own person … and a view.all person does" passes only because the scratch database is small (`check_fd1_find.ts:122-127`).

*Fix:*
* Put visibility inside each capped query:
  * leads: `leadsSeenWhere(ctx, vis, inactive)` (`sales/source-filter.ts:21`);
  * prospects: `vis.seesAll ? {} : { ownerStaffId: ctx.staffId }`, as `prospects.ts:202` does;
  * companies: the `seesCompany` condition as `prospects: { some: … }`, plus no-prospect with `createdBy`.
* Use `where: { OR: [{ leads: { some: seen } }, { subjectOf: { some: own } }, { primaryContactOf: { some: own } }] }` on the prefix read. Give the company prefix read an `orderBy`.
* Add a test where a view.own caller with more than 50 older matching records of other owners still finds their own person, prospect and company. Make it fail on the current code.

### Minor
* **m1. A deactivated owner's lead is not treated as Unassigned.** At `find.ts:51,78`, `sees(vis, ctx, l.ownerStaffId)` does not apply the active-owner mapping that every lead read uses (`leads.ts:115-116`, `148-158`, `source-filter.ts:21-22`; "a deactivated owner's lead is Unassigned (review m1)"). A caller who sees Unassigned leads but not all of them (firm setting off, holding view.all or assign) sees the lead in the Unassigned list but cannot find it. This only hides records; it never shows extra ones. *Fix:* use `leadsSeenWhere` with the inactive ids (this is covered by M1's fix), or map through `activeOf`.
* **m2. The prospects' own-or-all rule is copied rather than reused.** `find.ts:52` re-types the private `seer` predicate from `prospects.ts:126-128`, so it is a second copy of the rule text. *Fix:* export one predicate (for example `seesProspect(vis, ctx, owner)` in `common.ts`) and call it from both places.
* **m3. No `agent/prospect:show` gate.** Every lead and prospect read route requires `agent/prospect:show` (`sales/routes.ts:42,54,72,78`). The door is `@AnyStaff` (`platform/find/routes.ts:39`), and the finder never checks `show`. A member without `show` would still find their own leads but get 403 on opening them. This is latent today: every role holds `show` (pf3 migration lines 970-975), and a staff member needs at least one role (`identity/service.ts:69`). *Fix:* `if (!ctx.keys.includes("agent/prospect:show")) return [];` at the top of `FrontOfficeFinder.find`, with a pass and a fail test.
* **m4. A dropped finder leaves no trace.** `ports/find.ts:100-101` swallows every error and timeout with no log line. A broken finder would show "Some results could not be loaded" forever, and operators could not see why. *Fix:* log a `find_finder_dropped` event in the registry, with the module name and the reason class only (`timeout` / `error` / `shape`), never the message (PF-23). A timed-out finder also keeps its queries running (no abort). That is acceptable for now, but note it for CS-S1.
* **m5. The non-Canadian phone branch is weaker than FO-9a's reader.** `find.ts:36-40` skips `phoneE164Exact`'s "possible from anywhere" re-check and its `00` prefix handling (`duplicates/phone.ts:22-30`). This is latent: every Sample firm is in Canada. *Fix:* give `phone.ts` a region parameter and use the one reader.
* **m6. The firm-isolation test runs as the superuser owner.** `check_fd1_find.ts:37-38,69` runs on the owner's login, so the walls (RLS, `fo_sales_match_firm`) are not exercised. The firm line rests on `firmScope` alone. FO-9a's own check covers the definer functions, and the live copy (`xr_app`) behaved correctly. *Fix (optional):* run one find through `walledPool` / `withFirm` as FO-9a's check does (`check_fo9a_duplicates.ts:233-250`).

## Each "Tested with" line
| Row line | Test (check_fd1_find.ts) | Proves it? |
|---|---|---|
| "ANNA@EXAMPLE.COM" finds anna@ | :104-106 pass + other address fail | Yes |
| "+1 416 555 0100" = "4165550100" | :107-109 pass + other number fail | Yes; also live with dashes and brackets |
| "Ann" finds Anna, Annabel; 1 char → 400 | :110-119 (prefix, trigram, 400, 422, 2 chars) | Yes for a small firm; not with more than 50 matches (M1) |
| view.own does not find another's lead; view.all does | :122-127 | Yes on a small database; the own case fails at scale (M1) |
| lost found and labelled; deleted not found | :130-136, :148-149 | Lost and Closed yes; "deleted" replaced (deviation 2, accepted) |
| 2 s finder dropped with the line | :153-158 + contract | Yes (took < 1500 ms; whole answer without it) |
| no hit from firm B for firm A | :161-165 | Yes through `firmScope`; walls not exercised (m6) |
| query absent from logs (PF-23 scanner) | :168-186, planted control | Yes; also confirmed on the live log |

## Deviations the builder declared (PR body)
1. **`ports/find.ts` with the fake inside.** Accepted. Every port on main is flat (only `eligibility.port.ts` + `fakes/eligibility.fake.ts` differ), and the contract guard finds it.
2. **"Deleted lead" replaced by a company-contact-only person.** Accepted. No lead or prospect has a deleted state on main (no `deletedAt`, no delete route; FO-1a never removes rows). When a delete or merge state lands, this line needs its real test.
3. **E.164 in the front-office finder.** Accepted: `ports/matching.ts:3-4` itself puts phone parsing in the adapter. See m5 for the non-Canadian branch.
4. **`@AnyStaff`, not `@OwnOrAll`.** Accepted as a door that spans areas, provided each finder applies its own area's keys. For the front office this is incomplete (m3) and its cap breaks own/all (M1).

## Could not check
* A screen, a real user's walk, D17/D20 (no screen in this row; PF-30s).
* The 400 ms budget on a production-sized firm (the live copy has about 60 people).

Verdict: Changes
Fix M1 (with its test); m1-m6 at the builder's choice.
Reviewed sha: 62fe3273d8a5c81e81e4f550d8a0cabbe7592dfb

Reviewer: Changes 62fe3273d8a5c81e81e4f550d8a0cabbe7592dfb

## Round 4 (diff-only, 4eff9b296)
Scope (P-277): the last Approve was on a9a81090a. Since then the branch has a merge of origin/main (not reviewed), 4eff9b296 and 57b022e39. The coordinator changed the scope mid-review: 57b022e39 reverts 4eff9b296's edit to `product/tools/check-module-cards.sh`, which is the tech lead's file. So the reviewed change is `git diff 4eff9b296^1 57b022e39`, which touches `api/src/platform/find/routes.ts` and `api/src/platform/MODULE.rows/PF-30a.md` only. The diff for `product/tools/` is empty, so the tool is back to main.

**What changed**
1. `find/routes.ts:19`: the `@AnyStaff` purpose changed from "the find box: …" to "the one find door: …". This is the QA-182 fix (P-63). The purpose names the route; it is not a form field. "Door" is the word the review already used for this route (round 1, deviation 4). Only the string changed: same route, same guard, same behaviour.
2. `MODULE.rows/PF-30a.md`: the path `ports/find.ts` is no longer in backticks and now reads as plain words ("studio ports/find.ts"). module-cards only checks backticked paths against its fixture tree, and that tree copies api/src, web/src and tests, not studio/ports. FO-9s part 1 fixed the same problem the same way (round 3 B1, b7888d35b, `ports/matching.ts`), so this follows that precedent.

**What I ran at 57b022e39 (US$0)**
* `bash product/tools/check-module-cards.sh`: exit 0, 45 PASS lines, "module cards: 44 fixtures". The `exists` mutant is still caught: a fragment naming a test that does not exist still fails.
* `python3 product/tools/module-cards.py tree` on the real repo (CI's own step): "15 cards, tree checked", PASS.
* `tsx tests/check_qa182_no_box_words.ts`: 8/8. No "find box" is left in api/src or web/src.
* Earlier, at 4eff9b296, I had checked that the tool edit was also correct: with studio/ports added to the fixture copy, 44 fixtures and every mutant were still caught. That edit is now withdrawn and has gone to the lead as a proposal. No check is weakened by either version.

**Findings**
* No Blocker, no Major.
* m1 (no action on this PR). Without backticks, module-cards no longer checks that `ports/find.ts` exists. The file does exist (`studio/ports/find.ts`), and the contract guard and `tests/check_fd1_find.ts` both use it, so nothing is lost today. The real fix is the lead's: add `$S/ports` to the self-test's fixture copy, as 4eff9b296 did. After that, both this row and FO-9s's `ports/matching.ts` can go back to backticks.

Verdict: Approve
Reviewed sha: 57b022e392f83ade27824ec82972421e677ac03c

Reviewer: Approve 57b022e392f83ade27824ec82972421e677ac03c

## Round 5 (diff-only, 5ea3119ec)
Scope (P-277): the last Approve was recorded on 77960502 (round 4, which approved 57b022e39). The reviewed change is `git show 5ea3119ec` only. It touches `api/src/front-office/duplicates/phone.ts` (+8, plus one import) and `api/src/front-office/find.ts` (-10, +3). Why: the merge batch failed `tests/check_fo9b_phone_doors.ts` rule G, because find.ts held an E.164 regex and only `duplicates/phone.ts` may hold one.

**1. Is the move exact?** Yes. The function's signature and its four body lines are identical, character for character: the CA branch calls `phoneE164Exact`, the other branch calls `parsePhoneNumberFromString(text, country as CountryCode)`, and the same guard follows (`isPossible`, no `ext`, `/^\+[1-9][0-9]{6,14}$/`, then possible again with its country code alone). The comment above the guard did not change. `DEFAULT_REGION` and `phoneE164Exact` are now the module's own names, not imports, and they are the same bindings. phone.ts gains `type CountryCode` on its existing libphonenumber import, which is type-only and changes nothing at run time. Only the doc comment's wording changed ("FO-9a's exact reader" became "phoneE164Exact", with a "PF-30a:" prefix). Behaviour is unchanged. fd1's two direct `phoneForFirm` cases still pass (CA 4165550100, GB 020 7946 0958, "555", a 17-digit number). So do the finder's phone search cases.

**2. Is the re-export fine?** Yes. `import { phoneForFirm } from "./duplicates/phone.ts"; export { phoneForFirm };` keeps `tests/check_fd1_find.ts:20` (`import { FrontOfficeFinder, phoneForFirm } from ".../find.ts"`) working without edits. find.ts:62 still calls the same function. phoneForFirm has no other callers. The import and export sit between other imports, which is legal ESM (imports are hoisted). `tsc -p api/tsconfig.json --noEmit` reports nothing for either file. The libphonenumber import that find.ts no longer uses is gone.

**3. Is anything weakened?** No.
* Rule G's intent is "one normaliser": every phone read lives in duplicates/phone.ts and no door uses the looser `phoneE164`. The move carries out that intent rather than getting around it. The non-CA branch reads with libphonenumber directly, not with `phoneE164Exact`. That was the approved behaviour in earlier rounds, and it now sits beside FO-9a's readers, where a later change to the normaliser will see it. `phoneForFirm` is not `phoneE164`, so G's second check ("no front-office file imports the looser phoneE164") still holds, and it still passes. The G test file did not change: its exclusion is still `duplicates/phone.ts` alone, and no new path is excluded.
* Module card: no row is needed. Both files are in the one front-office module (`api/src/front-office/MODULE.md`). The card's Purpose line already says `phone.ts` normalises with libphonenumber-js, and that is still true. The row's fragment `MODULE.rows/PF-30a.md` describes the finder ("phone in E.164 with the firm's country") without naming the file the reader lives in, so it is still accurate. The PR already carries that fragment. `module-cards.py tree` from the repository root: "15 cards, tree checked", PASS.

**What I ran at 5ea3119ec (US$0)**
* `tsx tests/check_fo9b_phone_doors.ts`: 26 passed, 0 failed. All three G lines pass, including "no phone regex in api/src/front-office outside duplicates/phone.ts".
* `tsx tests/check_fd1_find.ts` (its own scratch database): 61 passed, 0 failed.
* `python3 product/tools/module-cards.py tree` (from the repository root; run from studio/ it cannot find `.claude/rules/modules`): PASS, 15 cards.
* Journey test: not applicable to this round. The change moves one server function, and this row has no screen (PF-30s carries it). No journey score this round; the earlier rounds' position stands.

**Findings**
* No Blocker, no Major, no minor.
* Nit (builder's choice): moving the function left two blank lines in a row in find.ts, after `prospectWord`.

Verdict: Approve
Reviewed sha: 5ea3119eccbbf35ae6a075f703e2f71e5f1e48a6

Reviewer: Approve 5ea3119eccbbf35ae6a075f703e2f71e5f1e48a6
