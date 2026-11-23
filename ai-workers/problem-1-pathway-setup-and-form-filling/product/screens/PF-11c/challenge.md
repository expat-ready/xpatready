# PF-11c part 1: readings to confirm (for the tech lead)

1. **Legal hold and the clock.** The row says "the clock pauses; resumes when released". Part 1 reads SA-2-21 ("unless under legal hold") as: no close while held; the firm closes on the first daily run after the release (the 90 days are not extended by the hold's length). Recommendation: keep this unless the founder wants the hold's days added back.
2. **Full export gate (review M5).** The close now requires PF-11's full export in the write-once archive (`FullExportPort`, `firms/<firmId>/export-*.zip`). PF-11 is not on main, so the feature wires `fullExport: null` and no firm closes anywhere until PF-11 and AUD-2's S3 adapter exist. The "download offered for 90 days" check is PF-11's.
3. **Alarm.** `firm_closure_blocked` is not in `deploy/cdk/lib/observability.ts` `ALARMED_ALERT_KINDS` (a deploy change outside this row). Recommendation: add it with PF-23c's next change.
4. **One missed notice blocks the close for good** (PF-5's `dueNotice` never sends an older notice late); the alert asks a person. Recommendation: a follow-up row for a manual re-send.
