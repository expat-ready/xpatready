# FO-4al Add a lead — break report (PR #2612 at 376411977)

Breaker: fresh agent, 20 Nov 2026. Scope: the "Add a lead" panel on Leads (`web/…/add-lead-panel.tsx`, `leads-page.tsx`, `contract.ts`) and the `POST /api/front-office/leads` it calls, against AG-2-4 rules 1, 4-6, 8, 10 as the panel's header claims. Not findings (header's "Not here"): phone region, ⌘K "Add lead", optional fields (Interested in, referrer, marketing tick); rule 7 (Combine) and rule 8's File-owner exception are not claimed.
Copy: http://localhost:4531, db `xr_studio_screens_al`, `PLATFORM_IDENTITY=local`, `platform.everyone_sees_all` = false (the copy was down; restarted with `isolated.sh screens_al 4531 restart`). Web build carried the panel. Roles: user-T Case Manager, user-O Case Officer (both `view.all`, so with sharing off each sees own + Unassigned), a READ_ONLY user, sample-solo's Owner (other firm). Live AI off, US$0.
Paths: `web/…` = `prototype/studio/web/src/modules/front-office/sales/`; `api/…` = `prototype/studio/api/src/front-office/sales/`.

**Verdict: 1 Blocker, 2 Major, 7 Minor.**

## Findings

**B1 Blocker: a double click on "Save lead" for a known person skips the check and saves a duplicate person.**
Steps: as O, add a lead for `dbl2@x.example` (API or panel). Open Add a lead, type a name, the same email, a source. Click "Save lead", then click the same spot again 250 ms later (an ordinary double click; Playwright `mouse.click` ×2, 250 ms apart).
Expected: one request, the match shown, nothing saved until the adder chooses (rule 4 "nothing is saved until the staff member chooses"; rule 10 "the staff member picks the person").
Actual: the local 409 comes back in under 250 ms; the footer "Save lead" is re-rendered in place as "Add as new" (same slot, same element), so the second click sends `confirmedNew: true`. The panel closes on a new lead: leads 2, persons 2 for that email. The adder never saw the match. (`dblclick()` with no gap held, as did two Enters on the focused button, because focus leaves the button while it is busy.)
Where: `web/add-lead-panel.tsx:72-74` (the two buttons share one slot); `sending` (`:64`) is cleared in `onSettled`, before the second click arrives.

**M1 Major: the check names only the newest person with that email, so an adder cannot pick the person they own.**
Steps (sharing off): T adds "Mia", `multi@x.example` (T owns L-00063). O adds the same email and picks Add as new (person 2, owned by O). T opens Add a lead with the same email and saves.
Expected: T is offered "Use existing person" for their own Mia (rule 4 shows the candidates; rule 5).
Actual: T sees only "Possible match with a record you cannot open — ask a manager", no Use existing person, so only Add as new: a third person. Each later add by either person makes the next one hidden from the other, so duplicates grow. The lead page afterwards also says "Possible match with a person you cannot see".
Where: `api/arrival.ts:40-45` (`possibleMatch` takes `findFirst` newest) and `api/leads.ts:155-161` (one match only). The cause is FO-2 code, but it breaks this panel's flow.

**M2 Major: the Source list offers the stored code "WEBSITE", and picking it makes a hand-added lead show as "Website form".**
Steps: as T (who sees a form lead), open Add a lead. The Source suggestions include `WEBSITE` (a raw code, EXPERIENCE §5). Pick it and save.
Expected: only plain-word sources; a typed-in lead never looks like a website-form lead.
Actual: saved with door MANUAL and source `WEBSITE`. Leads row and lead page show "Website form", so it is counted with form leads in the source filter (FO-4sf).
Where: `web/add-lead-panel.tsx:38-39` (`offered` = the sources the adder sees + Sample, not passed through `words()` and not filtered); `contract.ts:43` maps WEBSITE to "Website form".

**m1 Minor: a field edited while Save is in flight gets a match for the old details.** Steps: slow the POST (1.5 s), click Save lead for a known email, change Email to a new address before the reply. Actual: the 409 match for the old email appears under the new email. "Use existing person" puts the lead on the old person and drops the new email without a word; "Add as new" would send `confirmedNew` for an email that was never checked. Fields are not disabled while saving, and `set()` (`:67`) clears matches only before the reply arrives.

**m2 Minor: a lost reply, then any edit, gives a dead end.** Steps: let the server commit, then abort the reply (Playwright `route.fetch()` + `abort`). The panel says "Could not add the lead. Please try again." (right). Correct a typo in First name and save. Actual: "This request was already used with other details. Start a new Add." The lead exists (leads 1), but the panel neither says so nor links to it. The adder has to close, retype and meet their own lead as a match. Resaving with no edit returns the saved lead (held). `api/leads.ts:146`, `web/add-lead-panel.tsx:55`.

**m3 Minor: refusals from the server are shown as raw fragments.** First name "!!!" passes the panel's check and comes back as "this is required." under First name. An emoji-only source ("😀😀") comes back as "this is required." under Source, not AG-2-4's "Pick a source". Only the first failing field is reported, so a second bad field shows only after the next Save. Cause: `api/common.ts:24-30` (HAS_WORD, first throw wins), shown as-is by `web/add-lead-panel.tsx:54`.

**m4 Minor: sources that differ only by case, inner spaces or a tab are kept as separate sources and offered side by side.** The API saved "Phone call", "phone call", "Phone   call" and "Tab\there" (U+0009 is not in CONTROL), and T's Source suggestions list all of them. The source filter splits too. `api/common.ts:18,27`; `web/add-lead-panel.tsx:39`.

**m5 Minor: after the known-person reply, keyboard focus lands on the dialog itself.** Steps: Tab to Save lead and press Enter on a known email. Focus goes to the dialog container (the busy button lost it). The choice ("Use existing person", "Add as new") is only reached by tabbing through every field again. The `role=status` box is announced (held).

**m6 Minor: rules 4/5 only partly met.** The match line shows the name and a lead number, but not what matched (email or phone) or the owner (rule 4). After "Add as new" on a match the adder can see, the new lead shows "Possible match: Vic… (L-00066)"; rule 5 says it shows no banner (Keep separate). These are API answers (`api/leads.ts:159-161`, arrival path). Waive them if the Keep-separate flag is planned for FO-9.

**m7 Minor (API only): concurrent retries of one request id do not all get the same answer.** Five parallel posts with the same `requestId` and body: four 201 (same L-00035), one 409 KNOWN_PERSON. Still one lead, but a retrying client is shown a "match" with itself. One panel never sends twice at once (held), so this is reachable only from outside the UI.

## What held
- Permission: Read-only sees no button and gets 403 `agent/prospect:create`; no token gets 401; the other firm's Owner adds only into their own firm, and their `personId` for a sample-firm person gets 404.
- Rule 6: the 409 for a hidden person carries `personId: null`, the name "A person you cannot see" and no lead number; the panel shows the nameless line with only Add as new. `personId` of a person the adder cannot see, a garbage id or another firm's id all get 404 "No such person in your firm".
- Owner: the adder owns the lead; an injected `ownerStaffId` is ignored. `confirmedNew: "true"` (a string) is not taken as consent.
- Request id: a replay with the same body returns the same lead; a replay with other details gets REQUEST_REUSED; another staff member replaying the id gets 404 (sharing off). `dblclick()`, two Enters on the focused button and eight Enters in a field each made at most one lead.
- Check: an email typed in capitals or with spaces matches. Whitespace-only fields get all three messages ("Enter a first name.", "Add an email or a phone number.", "Pick a source."), and focus goes to the first invalid field. Text is capped at 100/254/40/60/5000 characters, and the server counts characters, not UTF-16 units.
- Source text: the server refuses line breaks, zero-width/direction marks, 61 characters and punctuation-only. "<script>…</script>" is stored and rendered as plain text. "Ñandú — 中文 عربى" and combining marks (NFC) are kept.
- Panel: Escape and Cancel do nothing while saving. Reopening gives empty fields, no match and a new request id. Closing returns focus to "Add a lead". Changing a field after a match clears it. axe (WCAG 2.1 AA) is clean with errors and with the match box shown.
- Widths: no sideways scroll at 320 and 1024 px, or at 200 % zoom (720×450 and 512×384 at DPR 2); Cancel and Save lead stay visible. No page errors in any run.
