# PF-5fp (R1.92): the firm profile API, independent review

**Commit reviewed: `180c6706b46594db53e59e6e24f641d091c76f15`** (branch `claude/sharp-johnson-ztwuoq`, PR #3003). I did not build it. Diff: `git diff origin/main...180c6706b` (5 new files, 341 lines). Judged against AG-01 §3.1 "Who edits what" (AG01-29(7)), AG-16 §3.1 "Who edits which firm detail", `STANDARDS.md`, and the invariants on the api-platform card (`firmScope`, audit through AuditPort, personal data).

**Scope:** API only, no screen (the Firm profile screen belongs to PF-5s). The screen-review UI checks, the BIC scorecard (case-side screens only) and D8-D14 are N/A. Journey test: `journey-test-reviewer-2026-11-22.md` (**7 of 8 applicable, 8.75/10 scaled, Pass**).

**What I re-ran:** isolated copy `rv192` on :4793 (`AI_LIVE=off PLATFORM_IDENTITY=local`, never :4400), stopped afterwards (database removed). Live AI off, US$0.
* `check_r192_firm_profile`: **30/30**, then **30/30** again on the same copy after my probes (it can be re-run).
* Break probes (scratch script): four parallel saves from one version gave **200, 409, 409, 409**. All results are below.
* `graph.mjs --check`: G1 0, G2 0, G4 0, G5 0.

## Correctness (what was asked)
| Point | Result | Evidence |
|---|---|---|
| Permission split | Holds | The route requires `agent/settings:list` to read and `agent/settings:edit` to save (`routes.ts:13,15`). The billing email needs `agent/firm-profile:manage` (`service.ts:134`), which only OWNER holds (`pf3` migration :765). An Admin is 403 OWNER_ONLY on the billing email and can change the website; a Case Officer can read but not save (403). This matches the AG-16 table. |
| All-or-nothing | Holds | Every field is checked before any write (`:115-135`), and the writes happen in one `$transaction` (`:137`). The Admin's mixed save (website plus billing email) wrote nothing: no audit line, website unchanged. |
| Version / 409 | Holds | The firm row is locked with `for update` (`:139`), the version is read again under the lock, and a stale save gets 409 with `latest` (`:141`). Race probe: 1×200, 3×409. Because the version is a content hash, an A→B→A change accepts the old version. That is harmless: the view the person saw equals what is stored. |
| Audit lines | Holds | One `platform.setting.change` per changed key, through `writeSetting`→`auditEvent`. Phone and email are `personal`, so their values go in before/after only. The billing email gets one `platform.firm.billing_email_changed` line with before/after through the AuditPort (`:150`). A save that changes nothing writes no line (`:144`). The action words are registered (`:51`). |
| Firm isolation | Holds | The firm comes only from the guard (there is none in the path). Reads go through `firmScope` (`:93,96,97`). Firm B's save leaves firm A's settings byte-identical (F1). |
| Input validation | Holds, with Minors | The body must be a strict object. Time zone, currency and language use the existing setting schemas; phone, email and website are bounded. `[]` gives 422 and bad JSON 400. See m2, m3, m4. |
| Personal data | Holds | No logging. Personal values appear only in audit before/after (R1.8, P-687). |

## D scores (/5; N/A: no screen)
| D | Score | Evidence |
|---|---|---|
| D1 | 4 | Every AG01-29(7) profile row maps to a behaviour; minor wording and order gaps (m3, m4) |
| D2 | 5 | The server enforces the stale save (409) and two saves at once (lock; 1×200 + 3×409) |
| D3 | 5 | Reuses the TIME_ZONE, LANGUAGE and CURRENCY schemas and `writeSetting`; no migration (P-600) |
| D4 | N/A | No rules or engine |
| D5 | 4 | Double save is safe; nothing tests the lock or the rollback (m1) |
| D6 | 5 | Every change has who, when, before and after |
| D7 | N/A | No AI |
| D8-D14 | N/A | No screen (PF-5s) |
| D15 | 5 | Each call took tens of ms on the copy; no request per row |
| D16 | 4 | Every Done-when line has a pass and a fail; gaps listed in m1 and m6 |
| D17, D20 | simulated only | No intended user; these stay with the founder |
| D18 | 4 | Sources cited in code comments (AG01-29(7), AG-16-1); the refusals name who does change the field |
| D19 | N/A | API part of R1.92; the screen is PF-5s and the licence warning is PF-4c part 2 |

## Findings
**Blocker:** none. **Major:** none.

**Minor (Should; none blocks Approve)**
* **m1. Two rules have no test that fails when they are removed (STANDARDS §7 [M]).** Removing the `for update` at `service.ts:139`, or the `$transaction` at `:137`, makes no check line fail. The PR states "two saves at once give one 409", but only my probe shows it. Fix: add a check line that sends N parallel PUTs from one version and expects exactly one 200, one set of audit lines and the rest 409.
* **m2. Inherited names count as read-only fields.** `service.ts:115` uses `k in READ_ONLY` on a plain object. `{"version":…,"toString":"x"}` gives 422 with `fields: {}` and the issue text `toString: function toString() { [native code] }`; `constructor`, `hasOwnProperty` and `__proto__` behave the same way. The save is still refused, but no field is named and the words are code. Fix: `Object.hasOwn(READ_ONLY, k)`.
* **m3. The website rule and its words disagree.** `service.ts:33` accepts `http://`, but its message says "a web address starting https://". `{"website":"http://plain.example.ca"}` gives 200. The check line "a website without https" (`check_r192_firm_profile.ts:85-86`) sends only `ftp://`. The phone rule (`:30`) accepts `--------1234567`. Fix: refuse http, or change the words and the check's name.
* **m4. Not every bad field is named at once, although the PR says so.** The read-only check (`:115-116`) and the strict parse (`:117-118`) stop before the field rules (`:122-133`). `{version, legalName, timeZone:"Mars/X", website:"ftp://x.ca"}` names only `legalName`; the same without `version` names only `version`. Fix: collect all three groups into one `fields` map.
* **m5. An Admin's whole-form save is refused if it carries the billing email, even unchanged.** `:134` checks whether the field is present, not whether it changed, so an Admin who sends the current billing email gets a 403 for the whole save. An Admin's invalid billing email gets 422 before the 403. `canChange.ownerOnly` lets PF-5s leave the field out. Fix: refuse only when the value differs from the stored one (inside the lock), or state the rule on the card for PF-5s.
* **m6. Check gaps.** `language` is never saved, only read. The refusals of `key` and `businessAddress` are not exercised. The "before and after" line checks only the after value (`check:76-77`), and the billing line checks only the new email (`:105`). Fix: add language to P2 and before-value assertions.
* **m7. Question for the tech lead (read scope, not a defect).** `ownerOnly` (the billing email, often the Owner's own, and the full business address with its phone) is returned to every role with `agent/settings:list`, Case Officer included. Billing's own `GET billing` needs `agent/subscription:pay` (Owner and Admin). The requirements restrict editing only, and the row says "business address read here", so this is not a gap. It does widen who reads it (STANDARDS §5 minimisation). Recommendation: confirm or narrow it before PF-5s shows it.

**The builder's questions:** Q1 (R1.92 "refused" against AG-1-34 "never a hard block"): I agree the requirement ranks first (AGENTS rule 2) and that nothing more belongs here. Q3 (the address key on Billing) is outside this row; it is a fair follow-up.

## What I could not check
* No browser, axe or widths: there is no screen.
* `tsc`: the first run's tail showed only errors in older test files; the second run was killed for lack of memory, so I have not confirmed that the new files are clean.
* CI on this SHA: most jobs show "skipped"; only pr-rules is green.
* The graph tool lists neither `/platform/firm/profile` nor `/platform/offices` at the root (it does not index a `@Get()` with an empty path) and gives this test no capability. That is a limit of the tool, not of this PR.

**Verdict: Approve** (no open Blocker or Major). The Minors m1-m6 are Shoulds for this PR or a follow-up; m7 is for the tech lead.

Reviewer: Approve 180c6706b46594db53e59e6e24f641d091c76f15
