# PF-6r review: GET /api/platform/roles (API only, no screen)

Reviewer (Opus 5.5, fresh context, did not build it), 16 Nov IST. PR #1951, branch `claude/runtime-roles-read`.
Reviewed first at 77e419b33, then cc643ba28 (MODULE.md line only), and finally **f4cfd153130b1647f4370762bda572cb3a0127e9**
(the breaker's four Minors fixed). The verdict is for f4cfd1531. Spec: Lead B's brief `design/lead-b-briefs/PF-6r.md` rev 16.54
(branch `lead-b-front-office`). Journey report: `journey-test-reviewer-2026-11-16.md` (score **8.75/10, pass**).

## What I ran (at f4cfd1531)
* `tests/check_pf6r_roles_read.ts`: **17 passed, 0 failed**, twice (scratch database, dropped afterwards).
* `tests/check_pf6b_permission_rules.ts`: **24 passed, 0 failed** (unchanged).
* `tests/check_pf4b_session_reads.ts` on an isolated copy at :4436 (runtime ports, never :4400): **55 passed, 0 failed** (unchanged).
* `product/tools/typecheck.mjs`: PASS, no new type errors (15 known, unchanged). `graph.mjs --check`: G1 0 · G2 0 · G4 0 · G5 0.
* 13 mutations on a scratch copy of the studio (product code was not touched). See "Tests can fail".
* Live HTTP journeys on an isolated copy at :4437 (journey report).

## Done when
| Line | Pass | Fail | Met |
|---|---|---|---|
| DW1 | Billing and finance's 12 MONEY keys equal `moneyKeysOfRoles(["BILLING_FINANCE"])`, with `moneyKeys` = 12. All 779 rows equal the role-permission rows joined to the catalogue. Fixed role order | Read-only has 0 money keys and 0 licence keys. No label fields. An uncatalogued key, a wrong class or a seventh role each answer 500 | Yes |
| DW2 | OWNER (user-R) and ADMIN 200, with the same body | CASE_OFFICER, READ_ONLY (and CASE_MANAGER, BILLING_FINANCE) 403 `MISSING_PERMISSION`. No token or a broken token 401. Nothing of firm B appears | Yes |
| DW3 | `assertEveryRouteDeclared` accepts; the route declares `["agent/staff:manage"]` | The route list with this route stripped is refused, naming `StaffReadController.roles (GET /api/platform/roles)`. PF-4b and PF-6b suites unchanged (above) | Yes |

## Judged points
* **Permission:** `@PermissionKeys("agent/staff:manage")` (`staff-read/routes.ts:13`). Only OWNER and ADMIN hold it
  (PF-3 migration lines 1122-1123). The live walk gave 403 for a Case Officer and 401 with no token, both RFC 9457. The
  handler takes no request input, so there is nothing to tamper with. Query strings are ignored (`?firmId=x&role=OWNER` returns the same body).
* **No firm data leak:** the answer is `{roles:[{role,keys:[{key,class,scope}],moneyKeys,licenceKeys}]}` only. A mutation that adds
  `firmId` to the answer fails DW2.
* **Class and scope come from the catalogue:** `service.ts:69-72` left-joins `platform_permission_key`. A missing row is a 500
  (`:75`). Since f4cfd1531, a row that disagrees with PF-6b's `classOf`/`scopeOf` is also a 500 (`:77`). So the answer is never
  invented and never contradicts the rule the guard enforces. On 77e419b33 I found the suite could not tell "read from the
  catalogue" from "worked out in code" (mutation M1 survived). With the `:77` check the two give the same answer or a 500, so the gap is closed.
* **Fixed role order:** `STARTER_ROLES` (`:16`, `satisfies readonly PlatformRole[]`), mapped in that order. A seventh enum value with rows is a 500 (`:79`).
* **No labels:** checked by a regex on the body, and by reading the code.
* **Style:** one method, one raw query and no request per row, the same shape as `twoStepSetting()`. The key filter now uses the guard's `FIRM_KEY`
  (`:73`, as `identity/service.ts:112` does).

## "The firm's rows": I agree with the PR body
`platform_role_permission` is `(role, permission_key)` with that pair as primary key and no firm column (PF-3 migration lines 180-185). The guard
reads it without a firm (`identity/service.ts:112`). Custom per-firm roles are X-1 (BACKLOG X-1, "custom roles and a capability
editor"). So the brief's "the firm's rows" cannot be per-firm on `main`, and the six starter roles are the same for every firm.
DW2 is proven in the strongest form available: firm B's Owner gets a byte-identical body, and no firm id, key, staff id or email of
either firm appears in it. When X-1 brings firm-owned roles, this read must take the actor's firm through `firmScope`. That is X-1's work, not a gap here.

## Tests can fail (mutations, scratch copy)
Caught, each by at least one named case: roles sorted alphabetically · the route opened with `@AnyStaff` (DW2 and DW3) · `licenceKeys`
counting MONEY · the left join made an inner join (no 500) · `firmId` added to the answer · the mismatch check removed · the `FIRM_KEY`
filter removed · the seventh-role check removed.
Survived: removing `collate "C"` (Minor 2 below). M1 survived on 77e419b33 and is closed by design at f4cfd1531 (see above).

## Findings (none Blocker, none Major)
**Minor 1. The cause of a 500 is not in the server log.** On the live copy, the 500 for an uncatalogued key was logged as
`status 500` with a correlation id only. The thrown message (`service.ts:75/77/79`, naming the key or role) appears nowhere in
`api.log`. The PR body's "a 500 naming the key in the server error" is true only of the Error object. The guard's start-up check and
PF-6b DW1 still catch the condition. This is app-wide logging behaviour, outside this touch list. No change needed in this row.
**Minor 2. The byte-order test cannot fail on this server.** `check_pf6r_roles_read.ts:98` compares with a JS sort, but the
cluster's default collation is already `C` (`pg_database.datcollate = C`), so removing `collate "C"` still passes. It is labelled a
pass, and DW1's fail cases come from other checks, so the Done-when bar is met. Fix (optional): run the same query with
`collate "en_US.utf8"` and assert that the order differs, as the break report did.
**Minor 3. MODULE.md wording.** `api/src/platform/MODULE.md:10` puts "PF-6r: `GET roles` …" inside PF-4b's list, so `GET staff/:id`,
`GET licences` and the rest now read as PF-6r's. Fix: move the PF-6r entry to after PF-4b's list.
**Minor 4. Graph G3 lists `GET /platform/roles` as untested.** The same applies to all seven staff-read routes: the graph does not see the suite's
`fetch` calls. This is a tooling limit, not this PR's fault. No fix in this row.
**Minor 5. Style:** two import lines from `../identity/keys.ts` (`service.ts:8` and `:10`). Fix: merge them.

## Screen-review sections not applicable (API-only row)
No concept, screen, menu, words, keyboard, 1024 px or 200 % zoom pass, and no BIC scorecard: there is no UI (P-26). D1 fit 5 (DW1-DW3 met) ·
D2 integrity 5 (read only, fails closed) · D5 recovery 5 (10 parallel calls gave identical bodies, reload safe) · D10 words 4 (no labels by design;
the guard's 403 detail names the raw key, which is guard-wide wording) · D11 state 4 (RFC 9457 for 401/403/500) · D15 speed 5 (13-46 ms, 51.5 KB) ·
D16 testability 5 (mutations above) · D18 provenance 5 (catalogue checked against PF-6b's rules). D7-D9, D12-D14 N/A. D17 and D20 are
simulated only (no intended user), and D19 is for PF-6 part 2.
Not checked: CI on f4cfd1531 (not read), the release holder's permissions read (P-423).

Verdict: Approve f4cfd153130b1647f4370762bda572cb3a0127e9
