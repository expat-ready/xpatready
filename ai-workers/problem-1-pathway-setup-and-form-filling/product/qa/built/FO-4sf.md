FO-4sf (PR on branch claude/eloquent-pascal-tc4gh0; AG-2-23 rule 1; R1.27; no schema change): staff filter the Leads list by source.
* On Leads, a **Source** filter beside the view chips: Web form, Added by hand, Booking (choose one or more; All sources clears). It is kept in the address (`?source=`), so a reload or Back keeps it.
* `GET /api/front-office/leads?source=MANUAL` (one value, a comma list or the key repeated) narrows the list **inside** who-sees-what (FO-2v): an own-only person still sees only their own leads. An unknown value → 400 naming WEB_FORM, MANUAL, BOOKING. No value → every source, as before.
* Proof: `tests/check_fo4sf_source_filter.ts` (API and browser, keyboard only, axe-core, 375/1024/1440 px).
