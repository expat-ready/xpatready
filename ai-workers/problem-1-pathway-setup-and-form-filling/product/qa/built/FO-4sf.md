FO-4sf (#1962; AG-2-23 rule 1; R1.27; no schema change): staff filter the Leads list by source.
* On Leads, a **Source** filter beside the view chips lists the lead sources the person has (as stored: "Website form", "Phone call", "Referral" …; choose one or more; All sources clears). It is kept in the address (`?source=` once per source), so a reload or Back keeps it.
* Source is where the lead came from (AG-02 glossary), never the door it arrived by: a booked lead whose source is "Phone call" shows under Phone call.
* `GET /api/front-office/leads?source=…` narrows the list **inside** who-sees-what (FO-2v): an own-only person sees only their own leads, and another person's sources are never named. An unknown value → 400 naming the person's sources. No value → every source, as before. `GET /api/front-office/leads/sources` gives the choices.
* Proof: `tests/check_fo4sf_source_filter.ts` (API and browser, keyboard only, axe-core, 375/1024/1440 px).
