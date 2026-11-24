# qa capability R1.87: our access to a firm's data, logged and shown to the firm (24 Nov)

**Run:** `/qa capability R1.87`, qa 6 (cloud qa copy, Opus 5.5 medium), under Lead 24. Live AI off, US$0. Tested on main 3af5fc4b0, after #3209 (AUD-3 part 1) merged as 1c701aa08 at 12:16 IST. Isolated copy :4478 only, started with `PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`; :4400 not touched.

**Verdict: Partial (it was Not built). Parts are missing, so there is no verdict (P-606).**
The parts missing are AUD-3 part 2, AUD-3 part 3 and AUD-3b parts 1-3; the checklist names "AUD-3 parts 1-3, AUD-3b parts 1-3". There is also one open question, QA-776.

## Evidence
| What | Where | Result |
|---|---|---|
| `check_aud3_access.ts` (#3209's own check) | `run-suites.sh --only`, main 3af5fc4b0 | 30 passed, 0 failed |
| `tests/qa/probe_r187_firm_sees_our_read.ts` (new, qa) | isolated copy :4478, twice | 5/9 both times, the same steps |
| j_86 W10 (R1.86's walk ends at R1.87's first step) | isolated copy, twice | FAIL by design of #3209: see "Across firms" below |
| GitHub run | none dispatched | there is no Works claim to prove; a cloud lane cannot dispatch Actions (P-439) |

## Done when, clause by clause
* **"Every read of a firm's data by our staff writes who, when..."** On main.
  * Our Platform Owner opened firm A's health in our console (`GET /api/system/firms/:id`, `@ReadsFirm("id")`) and got 200.
  * Two lines landed on firm A's own trail under one correlation id:
    * PF-12's `platform.bypass` (use `platform.console.firm-read`): the row's "PF-12's bypass role is audited";
    * AUD-3's `platform.system.firm_read`.
  * Both lines name `ourstaff:<id>` and the time. Firm B's trail got nothing.
* **"...and why."** Not on main for reads. The read's detail is `{route, firmId, method}`. A reason is asked only on `@SystemReason` routes, which are changes. The "why" of a read may be meant to come from AUD-3b's support session (reason or ticket); that is not built. This is **QA-776** (Ambiguity: a question for the Lead).
* **"The firm sees those lines."** On main, through AUD-4s (R1.88).
  * Firm A's Owner reads `GET /api/platform/audit?ours=1`. The line is there as "ExpatReady staff", with the words "ExpatReady staff read the firm's records".
  * Firm B's Owner, with the same filter, does not see it.
  * This was checked through the Activity log's API, not on its screen. The screen is proven only for a different line (the breach notice, j_86 W7), so a screen check of this read line is still owed (j_87).
* **"Nobody can remove one."** On main (AUD-1a). The probe connects as the database user `xr_studio`, not the API's `xr_app`, and is refused both `delete` and `update` on the line; the count is unchanged. The refusal is the `aud_event_no_change` trigger, which applies to any user.
* **Across firms.** Our firms list writes one `cross_tenant.access` line on the platform's own trail and none on any firm's.
  * One breach read (`GET /api/system/register/breaches/:id`) names firms A and B. It is declared `@ReadsAcrossFirms`, so it writes the platform line, not a line on firm A's trail.
  * j_86 W10 expected a line on firm A's trail. As built, this follows AUD-3's own row ("a read that spans more than one firm writes one `cross_tenant.access` line on the platform chain").
  * Firm A therefore sees no line for that read today. AUD-3 part 2's access report is where our side would report it per firm.
  * Today the two reads across firms behave differently. The support-ticket read (support-routes.ts) is also `@ReadsAcrossFirms`, but it calls `touchFirm`, so the firm gets a `platform.bypass` line there.
  * See question 2.

## Parts missing (each 404 on main)
* **AUD-3 part 2:** our side's access report, `GET /api/system/firms/:id/access-report`, with CSV and `audit.exported`, and the keys `system/audit-log:list` and `system/audit:export`.
* **AUD-3 part 3:** our audit search, `GET /api/system/audit`, which writes `cross_tenant.access` itself.
* **AUD-3b parts 1-3:** support sessions into a firm. A session is read-only unless the Owner allows changes, carries its reason, stops at 60 minutes, and its lines carry `support_session_id`.
* **#3209's own follow-ups**, not a part but needed for part 2's per-firm report: the firms list's `?q=` can narrow to one firm, and the line then records neither the search nor the firms shown.

## Gate A
There is no screen in our console that reads a firm's trail for our staff (AUD-3 parts 2-3), so there is no walk by screens. The firm's side is a screen (Activity log, R1.88). The next capability's first step is R1.88's filter "ExpatReady staff access", and it shows the line (P2).

## Bugs
* QA-776 (Ambiguity, Minor): new, above.
* No Bug or Major.

## Questions for the Lead
1. **QA-776:** should a one-firm read by our staff outside a support session ask for a reason? AUD-3's own test clause expects one: "our Support person opening firm A's billing page writes one line … with `OUR_STAFF` and the reason". The alternative is to reword the Done when to "why, where the route or the support session asks one".
2. **A read across firms that names firm A** (one breach naming A and B; the firms list filtered to one firm): should firm A see a line for it? The alternative is the platform `cross_tenant.access` line, with part 2's access report naming it. If firm A should see it, AUD-3 part 2 needs a row clause for it, and j_86 W10 changes with that ruling.

## Suggestions
* *Needed for the proof, Capability:* AUD-3 part 2 and AUD-3b part 1 on lanes. Without them R1.87 cannot be scored.
* *Later, Scaffolding:* write j_87 when AUD-3 part 2 merges. Until then, the probe stands in.
