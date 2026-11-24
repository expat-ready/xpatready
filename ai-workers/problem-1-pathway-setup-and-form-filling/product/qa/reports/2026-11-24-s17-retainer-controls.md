# Replay S17 M1, M4, M5 (the retainer page) walked on main: qa 7, 24 Nov

**Asked by:** Lead 26. It asked qa to check, by walking main, three code-read claims in `product/design/replay-2026-11-24/CONTROLS-ON-MAIN.md` (branch claude/fervent-mahavira-b75d49), and to log only what qa reproduces.
**Run:** main 24c453a2c, isolated copy :4475 started fresh each run, PLATFORM_IDENTITY=local, live AI off, US$0, no live mail. The Owner (Representative, Sample) walks by screens at 1440 px. Sample people and prospects come by SQL, as in J-53. The starter template is uploaded by screens.
**Check:** `prototype/studio/tests/qa/check_s17_retainer_controls.ts`. Each judge states the right behaviour, so a FAIL reproduces the claim. **Two runs, the same result each time: 4 PASS (set-up), 4 FAIL (M1, M4 (a), M4 (b), M5), exit 1.**

| Claim | Verdict | What a person sees | Logged |
|---|---|---|---|
| S17 M1: Check and send drops typed, unsaved edits and sends the old version | **Reproduced** | The draft is at version 2 with a 1,500.00 fee. The person types 1750, which is not saved, though "Save as version 3" is on. Check and send's panel says "Version 2 … Fees CAD 1,500.00" and gives no word about the edit. Send sends version 2 at 150000 cents. The typed fee is gone. | QA-778 (Bug · Major) |
| S17 M4: "save a new version here" cannot be done; a missing email cannot be added | **Reproduced** | The blocker reads "The signer needs an email. Add it on <client>'s record, then save a new version here." Its link opens the prospect page, which has no email field or edit control. The lead page shows "Email: Not given", read only. With the email set on the person by SQL (labelled setup), "Save as version 3" stays disabled, the values do not show the email, and the blocker stays. | QA-779 (Gap · Major) |
| S17 M5: the template cannot be changed on a draft, yet a conflict refusal says to change it | **Reproduced** | With a Potential conflict and the starter template (no {conflict.disclosure}), Send answers 409 CONFLICT_DISCLOSURE_NOT_PRINTED, "use a template with {conflict.disclosure} and edit the agreement…". The page shows these words. The draft shows its template as text only, with no control. There is no Withdraw. The card offers only "Continue the draft". | QA-780 (Bug · Major) |

Screenshots: `2026-11-24-s17-retainer-controls/` (M1-send-panel-after-typing-1750, M1-after-send, M4-signer-needs-email, M4-the-record-link-lands-here, M4-after-email-on-record, M5-send-refused).

**The Notes from run 1** (word for word, Sample ids shortened):
* M1: before Check and send, "Save as version 3" enabled: true. The Send panel says: "… Version 2. Once sent, this version never changes. … Version 2 Fees CAD 1,500.00 …". Sent: version 2 at 150000 cents. Versions: 2.
* M4: the blocker's link opens /front-office/prospects/<id>. Email fields or edit controls found there: 0. (b) "Save as version 3" pressable: false. Values show the email: false. The signer blocker is still shown: true.
* M5: Send answered 409 CONFLICT_DISCLOSURE_NOT_PRINTED. The page shows the words: true. Template controls on the draft: 0. Status now: DRAFT.

**What this means for the rows.** R1.53 is **Works** (21 Nov, bfd1b2de1). These are three open Majors that name it, and P-305 says an open Major keeps a row Partial. qa has not moved the R1.53 row here: that is a question for the tech lead (below). QA-780 also touches R1.108 (the conflict check), which is Works.

**Not walked:** the other S17 claims (M2, M8) and the rest of the list; they were not asked.

## Questions for the tech lead
1. R1.53 is Works with three open Majors naming it (QA-778, QA-779, QA-780). Should qa hold it in `REGRESSION-HELD.md`, or move it to Partial now (P-305)? My recommendation is to hold it, and re-score it when the fixes merge. The flaws were there at the 21 Nov proof; j_53 never typed without saving, never used a client with no email, and never had a Potential conflict.
2. Severity: all three are marked Major, because each one sends the wrong agreement or blocks the path for good. Are any of them Critical under "a capability gives a wrong result"? QA-778 sends a fee the person did not intend. My recommendation: keep Major, because the panel shows the old fee before Send.

## Suggestions
* *Needed for the proof · Capability:* Check and send saves the typed edits first, or is off while there are any (QA-778). A person's email can be edited where their phone is (FO-9a) (QA-779). A draft's template can be changed, which the API's PATCH already takes as `templateId` (QA-780).
* *Later · Capability:* the starter template carries {conflict.disclosure}, so a firm on the starter is not stuck at its first potential conflict.
