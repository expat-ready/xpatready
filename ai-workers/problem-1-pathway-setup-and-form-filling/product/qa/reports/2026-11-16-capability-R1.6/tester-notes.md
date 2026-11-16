# Tester's notes (facts only) · qa capability R1.6 · main ddc6e919c (tree 64b53a515) · 16 Nov 2026, 10:0x IST

Asked by Lead 64 (cross-session message, ~09:4x IST): "J-6 part 1 (#1914, R1.6) merged … PF-6b owns the API half (on main), PF-6's two Done when lines the screen half, J-6 walks both; part 2 (role editor) waits on PF-6 part 2. Please score R1.6 now on part 1 if its capability text is met without the role editor (your call)." The amendment named (A6 in `design/lead-b-briefs/P-626-order.md`) is on branch `lead-b-front-office`, not on main; this copy did not read it. MVP-CHECKLIST row 6 lists parts "PF-4 (In PR #1744), PF-6" and status "Shaped".

R1.6 Done when (CAPABILITIES): a route with no permission key is refused (403); "own" keys return only the person's own records, "all" the firm's; money and licence keys never come with another key; wrong role by URL refused on screen and API.

## On GitHub's runners
* ci **43796001718** (merge batch "merged #1831"), head tree 64b53a515 = main ddc6e919c's tree (`git rev-parse`). Jobs: 18 success, 2 skipped. Suite lines (`ci-43796001718-suite-lines.txt`): 499 PASS, 0 FAIL, 19 quarantined.
* `check_pf6b_permission_rules.ts` 24 passed, 0 failed (job 133065965071); `check_pf4_identity.ts` 119/119 (job 133065965074).
* `tests/journeys/j_6.ts` runs in no workflow (no workflow or suite tool names `journeys/`), the same as R1.9's walk.

## qa's own runs on main ddc6e919c (isolated copies, never :4400; PLATFORM_IDENTITY=local; US$0)
* `check_pf6b_permission_rules.ts`: 24/24 (`check_pf6b_permission_rules-mine.txt`).
* `check_pf4_identity.ts` with its isolated copy: 119/119 (`check_pf4_identity-mine.txt`).
* `tests/journeys/j_6.ts`: **50/50 headed** (HEADED=1 under xvfb, the sandbox's only "visible" browser) and **50/50 headless** (`j_6-headed-xvfb-mine.txt`, `j_6-headless-mine.txt`). A first pair of runs had 45/50: the 5 P1-A4 lines failed because `j_6.ts` spawns `tsx` by name and this sandbox has no `tsx` on PATH (spawn error, empty output); with `studio/node_modules/.bin` on PATH, 50/50. Environment, not the app; the spawn by bare name is a check-portability point only.
* **New qa check `tests/qa/check_r16_permission_sweep.ts`, 13/13 twice** (`r16-permission-sweep-{1,2}-mine.txt`). It reads every handler under `api/src/platform` and `api/src/front-office` from the source (68 handlers, 60 on guarded paths) with its declared access:
  * every guarded handler declares access (none falls to the default-deny refusal);
  * with no token every keys or any-staff route answers 401;
  * for each active Sample staff member (user-O Case Officer 99 keys, user-T Case Manager 146, user-R Owner+Case Manager 233; the seed has no Admin, Billing or Read-only person), every keys route whose keys the person lacks answers 403 `MISSING_PERMISSION` (23, 18, 0 routes). Every GET whose keys they hold is never 401/403 (10, 11, 17 routes). Writes are sent only where they must be refused;
  * MONEY: 16 MONEY keys in the catalogue. The Case Officer starter role holds exactly `expense:create`, `invoice:create`, `invoice:list`, `invoice:show`, and no read-only role holds any. No route asks for a MONEY key together with a general one;
  * LICENCE: 3 LICENCE keys; **no route on main names one**, so the licence rule is proven only by PF-6b DW5's test route.
  * Three faults in qa's own first draft were fixed before these runs: a decorator window that read the neighbouring handler's keys; keys named through a constant (`COMPLAINT_KEYS.record`); and a wrong staff-status column. Also a wrong expectation that a Case Officer holds no money key. SA-06 v3.15 MS-D21(10) (the product owner, 25 Oct) gives the Case Officer `invoice:create` and `expense:create` for drafts ("issuing stays with the billing keys"), and v3.15 (1) gives `invoice:list`/`:show` on visible records. BACKLOG PF-6b's text "No starter-role bundle hands out a money key" reads against that; PF-6b's DW3 tests duty bundles in `keys.ts` only.

## On screen (J-6's walk, read from its lines)
An Owner sees every lead. A Case Officer with "own" sees only their own, walked both ways the product has: the role without `view.all`, stood in by SQL on the copy's starter rows because the role editor is part 2; and the firm setting "everyone sees all" off. A wrong person or wrong role by URL gets "Lead not found" or lands on Mine on screen, and 404/403 from the API. Every own-versus-all judge fails on the same copy with no own rule. The walk ends at row 5's first step (Invite staff). It is walked on the Leads screen only: no other screen marks own versus all yet.

## Not on main / not tested
* PF-6 screens (staff, roles, licences): not built; J-6 part 2 (the role editor walk) waits on PF-6 part 2.
* No LICENCE route in the running app; the licence check is seen only on PF-6b's test route.
* J-6's builder records: `screens/J-6/review.md` ends "Verdict: Changes requested" (an earlier round; the PR merged after a later approve); `break-report.md` mentions major/critical 3 times. qa did not re-judge them.
* No open `qa/BUGS.md` row names R1.6.
