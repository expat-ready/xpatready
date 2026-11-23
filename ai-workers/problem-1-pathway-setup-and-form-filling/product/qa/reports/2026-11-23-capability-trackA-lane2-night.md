# qa capability — Track A lane 2, night: R1.21, R1.92, R1.5 (23 Nov, Lead 8's ask)

Cloud copy, Opus 5.5 medium (P-788); isolated copies :4470-:4475 only (never :4400); live AI off; no Stripe key (fake BillingPort); US$0. Main 9787e68ae (#2927 merged). Branch `claude/upbeat-ptolemy-i8mytx-night` (the lane's first branch holds #3029, approved and queued).

Duplicate check (01:4x IST): main's R1.5, R1.21 and R1.92 rows were last scored on 21-22 Nov; no open PR names R1.5, R1.21 or R1.92 except #2332 (PF-18s concept records). Command: `gh api "repos/expat-ready/xpatready/pulls?state=open&per_page=100"` filtered on `R1\.(5|92|21)|j_(5|92|21)|J-(5|92|21)`.

## Verdicts
| Row | Last part merged | Journey on main 9787e68ae (twice, fresh copies) | GitHub | Verdict |
|---|---|---|---|---|
| R1.21 | #3124 GST/HST number, 00:17 IST | `j_21` 17/17, exit 0 ×2 | walks.yml 45067403113, job 137346703982, j_21 success on 9787e68ae | **Works** (on P-796's wording) |
| R1.92 | #3104 PF-5fp-2, 00:52 IST | `j_92` 18/20, exit 1 ×2 (W1, W6) | — | **Partial, parts missing** (no verdict, P-606) |
| R1.5 | #2927 PF-4s part 1, 01:56 IST | `j_5` 27/28 ×2 (DW2, journey out of date) → 28/28 ×2 after the fix | — | **Partial, parts missing** (no verdict, P-606) |

### R1.21 — Works
Held, by screens as a new firm's Owner signed up by the public door: Plan and billing says prices are plus applicable taxes and the address is needed before the first invoice; Add a card asks for the address first; an empty address and a wrong postal code are refused on their fields; Ontario is stored as typed with one audit line naming ON; the billing stand-in issues the period's invoice with Ontario's tax, shown on the invoice, its read and the list, with our GST/HST registration number line (Sample until registered, #3124); it opens and downloads; no session is refused; 400/1024/1440 px axe clean. Stripe test mode itself is not run (no key); the Done when as re-worded by P-796 accepts the stand-in. The Done when column on the qa board still shows the older words: one line for the tech lead to update.

### R1.92 — parts missing
Held: the profile API (GET; PUT a valid IANA zone read back; a zone not on the list 422 on its field; nothing written; the version leaks no billing email, #3104); offices by screens with the zone pre-filled from the province (Alberta → America/Edmonton, BC → America/Vancouver); each office's hours shown in its own zone.
Missing, no open PR:
1. **Firm profile page** in My account (PF-5s S5): W1. My account today: Home, Profile, Licence, Availability, Notifications, Team, Licences, Security, Terms, Offices, Branding, Plan and billing, Activity log, Help & support.
2. **Official licence-number formats** for the licensing bodies: #3031 (PF-4c part 2) merged the warning with no `numberPattern` because no body's official page could be reached (AGENTS rule 4); its question for the tech lead asks who reads college-ic.ca and cnq.org: W6 (a).
3. **The licence form showing a save's warning on the field** (`licence-form.tsx` drops the answer; no row): W6 (b).

### R1.5 — parts missing
`j_5` DW2 expected the text "true" as the second step to answer 401 TWO_STEP_REQUIRED. On main it answers **422 "One field needs a change: secondStep: This must be a boolean. Nothing was saved."**, `fields.secondStep`, no token (probed on an isolated copy). That is PF-28's one input rule, as ruled on #2619 (wrong type → 422 naming the field), so the product is right and the journey was out of date. **Journey fix (this PR):** DW2 accepts 422 naming `secondStep` with no token for the text case; missing and `false` still 401 TWO_STEP_REQUIRED. Then 28/28, exit 0, twice.
Missing: PF-4s part 2 (DW6, DW7, per #2927); the real-pool lines (wrong code, expired code, repeated wrong tries, passkey; AWS, P-780 (1)); QA-643 (no passkey setting). PF-4s part 1 is API only, proved by `check_pf4s_system_signin.ts` 78/78 in its CI; J-5 does not walk it.

## R1.10 — red steps with no open PR (Lead 8's question 1; `j_10` once on main 9787e68ae, exit 1)
#2933 (PF-28 part 5, retainers) is dequeued and unapproved. With it, j_10 would still be red on:
1. **W2 platform**, 3 probes on 2 routes: `POST /api/platform/complaints/:id/steps` missing and wrong-type(kind); `PUT /api/platform/keep-periods/closed-client-files` wrong-type(reason).
2. **W2 front-office sales**, 14 probes on 2 routes: `POST /api/front-office/people/:personId/identity-checks` (3: wrong-type on prospectId, result, disclosureText) and `POST /api/public/forms/:token/submissions` (11).
3. **W2 booking** (after #2908, PF-28 part 4), 25 probes on 8 routes: `POST /api/front-office/booking-types` (10: missing, wrong-type on description, hostStaffIds, slug, …), `POST|PATCH /api/front-office/me/availability-sets[/:id]` (4), `POST|PATCH /api/front-office/staff/:staffId/availability-sets[/:id]` (4), `POST /api/public/bookings/:token/reschedule` (3), `…/cancel` (2), `GET /api/public/bookings/:token/slots` (1: an unknown query field, expected to be refused in words).
4. **W3 run-time schemas**: 21 inputs reach a schema the walk cannot take apart (the reviewed cap is 19; two new since 22 Nov).
5. **W3 over-long**: e.g. `POST /api/front-office/booking-types` hostStaffIds / active answer zod's raw words ("Invalid input: expected array, received string"), not plain words naming the field.
6. **W3 schema**: 16 public booking inputs reach no zod schema (`/api/public/firms/:firmKey/book/:slug/slots` query, `…/bookings`, `/api/public/bookings/:token/{slots,reschedule,cancel}`, …).
7. **W5 case side**: a malformed id answers 403, not 404, on `POST /api/runtime/cases/:id/{changes/undo, documents, sections/:s/fill-from-documents[/plan]}` and others listed in the run.
8. **W6 QA-507**: an unknown charset and an unknown Content-Encoding each answer 500.
9. **W8**: the allow-list holds 31 fix lines, all PF-28 part 5's (the part 2 line is gone).
Full lines are in the journey's output (not committed); re-run with `zsh studio/tools/isolated.sh j10 4410 start --ttl 30 PLATFORM_IDENTITY=local` then `tsx … j_10.ts j10 4410`.

## R1.23 and R1.104 (Lead 8's question 2)
Recorded Partial with the missing parts named in their rows (records only, no re-walk): R1.23 — the brand on client pages (`j_23` W4, QA-746). R1.104 — the booking-event poller (W2, W5 running copy), the agreement on screen (W3, W7 screen), the start gate (QA-750).

## Questions for the tech lead
1. R1.21's Done when column still shows the pre-P-796 words; update it to the stand-in wording?
2. R1.92: who reads the licensing bodies' official pages for `numberPattern` (#3031's question), and which row holds the licence form's field warning?

## Suggestions
* *Later · Scaffolding:* the case page's placeholders could carry `[data-loading]` like other pages, so journeys' `settle` waits for them (found on R1.102, #3029).

Screenshots: `2026-11-23-capability-trackA-lane2-night/J-5`, `J-21`, `J-92`, `J-10`.
