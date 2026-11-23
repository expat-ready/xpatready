# FO-6d part 1: break, round 3 (diff only)

Scope: `git diff 8162df596 639e2514f` on PR #3207 (branch claude/nice-curie-tzbprl, head 639e2514f), as allowed by the tech lead
for the round 2 fix 9691d5539. Nothing else was looked at again. Method: a `git archive` of 639e2514f in the scratchpad (never
the shared :4400), the FO-6d set-up copied into an in-process Nest app on a random port with the fake signing port, one
scratch database per run (dropped at the end), and direct calls to `isGovernmentForm` / `checkPdf`. Scripts:
`scratchpad/breaker/r3/{attack,gov,bomb,bomb2}.mts`. Suites on the head tree: check_fo6d_any_document 26/0,
check_fo6_signing_api 51/0, check_fo6_signing 47/0, check_fo3c_consultation_agreement 42/0.

## Findings

No Blocker. No Major.

**m1 (Minor): an inflate that fails after it has produced output costs nothing against the budget.**
`any-document/service.ts:60` adds `PER` only for `ERR_BUFFER_TOO_LARGE`. A stream that inflates to just under 4 MB and then
fails its checksum (`Z_DATA_ERROR`, last byte of the adler32 flipped) or is cut short (`Z_BUF_ERROR`, adler32 dropped) adds 0.
Repro (`r3/bomb.mts`): 400 objects `<< /Length n /Filter /FlateDecode >> stream` + `deflate(4 MB - 1 KB of zeros)` with a bad
adler32, 1.59 MB file. Result: accepted, all 400 inflated, **1.6 GB inflated against the stated 24 MB budget**, 485 ms (bad
checksum) / 824 ms (cut short) of event-loop block in one upload. Padded to 25 MB: 816 ms. RSS grows ~20-40 MB and is freed,
so memory holds. The 400-stream cap is what bounds it, not the budget. The comment on line 50 ("every inflate counts its
output") is not true for this path. Only a signed-in user with agent/portal:request-work can send it, and it is under one
second, so Minor. Expected: a failed inflate counts at least its input-bounded worst case (or `PER`), as the capped case does.

**m2 (Minor): when the budget or the stream cap runs out, the check says "not a government form" (fails open).**
Repro (`r3/bomb2.mts`), each followed by a deflated object `<< /AcroForm << /Fields [] /XFA 9 0 R >> >>` (the open-IRCC-form
signal), file name `letter.pdf`, title "Engagement letter":
- 7 bombs of 4 MB - 1 KB each (fit under the cap, 28 KB file): ACCEPTED (5 over-cap bombs: GOVERNMENT_FORM; 6: ACCEPTED);
- 400 one-byte unfiltered streams (21 KB file): ACCEPTED, 0 ms;
- control, the XFA object alone: GOVERNMENT_FORM.
This needs someone who builds the file on purpose to get round AG-5-61 r6; round 2 had the same hole at 64 MB. Recorded so the
"a check, not a guarantee" note is read as "a deliberate file passes". No change asked of this PR.

**m3 (Minor): the title rule refuses harmless format marks that pasted text often carries.**
`any-document/routes.ts:20` refuses all of `\p{Cf}` except ZWNJ/ZWJ. Over HTTP (`r3/attack.mts`, 422 "This must be plain text
on one line"): `a‎b` (LRM), `a‏b` (RLM), `ا؜ب` (Arabic letter mark), `co­operation` (soft
hyphen, which Word and PDF copy-paste insert). LRM/RLM/ALM cannot reorder text the way the overrides can. A Persian, Arabic or
Hebrew title pasted from a chat or mail app commonly carries RLM, so it is refused with a message that does not name the
character. Expected: refuse the bidi embeddings, overrides and isolates (U+202A-202E, U+2066-2069), keep LRM/RLM/ALM (and
probably U+00AD).

**m4 (Minor): a title that looks blank is accepted.** `ㅤ` (Hangul filler) and `ﾠ` (halfwidth Hangul filler) are
`\p{Lo}`, so `/[\p{L}\p{N}]/` passes: 201, stored as `e385a4` / `efbea0`. The request list shows an empty-looking title.
(The braille blank U+2800, CGJ U+034F and combining-only titles are refused.)

## What held

Webhook routing (`signing/service.ts:129`), fake port, real `SigningHooksController.receive`:
- OTHER request, no handler: viewed, completed before the signatures (out of order), signed x2, the provider's "sent"
  (`other`) and declined each answer `{applied:false, reason:"no handler"}` and store one receipt; repeats answer
  `duplicate:true`; 3 parallel repeats of completed: 3 duplicates, no error. After all of them: status SENT, 0 viewed, 0 signed,
  0 evidence, no new audit line, 0 retainers, no new file, no mail.
- 20 parallel calls (10 each of two viewed events): 2 receipts, 18 duplicates, no 500 and no deadlock.
- CONSULTATION request (inserted row, real fake envelope): no handler, stored once and "no handler", repeat duplicate; with
  a CONSULTATION handler registered, signed and completed go to it (`applied:true`, right firm), and the door writes no
  receipt of its own. An OTHER event while only a CONSULTATION handler exists: "no handler", the CONSULTATION handler is not
  called. A second CONSULTATION registration throws. An OTHER handler gets OTHER events; a handler that throws makes the
  call fail with nothing stored (the provider redelivers); after undo, "no handler" again.
- RETAINER request (inserted row, unknown signer): goes to `applyRetainer` ("no such signer on this request"), as before.
  check_fo6_signing_api 51/0 confirms the retainer webhook path is unchanged.
- The enum has only RETAINER, CONSULTATION and OTHER, so `!== "RETAINER"` sends no other kind to a handler.
- Events stored "no handler" before part 2 lands are not replayed later. Nothing can reach that today: part 1 sends no
  signing email and there is no signer door, so no OTHER request can be signed before part 2. Not a finding.

`isGovernmentForm` with `/UR3` (`r3/gov.mts`, name `letter.pdf`, title "Engagement letter"):
- All 31 fillable IRCC files under official-sources/ircc (forms, checklists, previous editions) and the three open copies
  from round 2: GOVERNMENT_FORM. Every file with `/AcroForm` + `/Perms` also has `/UR3`, so nothing the old rule caught is
  lost. imm5782e has neither; `/NeedsRendering` catches it. IMM5881E (checklist) and IMM5905E (instructions) have no
  `/AcroForm`; both are refused as PDF_PROTECTED, the same as under the round 2 rule. Each check: 0-2 ms.
- A DocMDP-certified PDF (catalog `/Perms << /DocMDP 5 0 R >>`, `/SigFlags 3`, signature field, `/TransformMethod /DocMDP`):
  ACCEPTED. The same file with `/Perms << /UR3 >>` is refused: a firm's own Reader-extended form is taken for a government
  form. That is expected from the rule as written. `/U#523` (name escaping) gets past, the same kind of hole as `/X#46A` in
  round 1, so nothing new.
- 24 MB budget on capped bombs: 400 over-cap streams stop after 6 (40 ms, file 1.59 MB). Memory stays bounded in every run.

Title rule over HTTP: NUL, TAB, LF, DEL, NEL, CSI, U+2028, U+2029, RLO, LRE, PDF, RLI, PDI, tag characters, U+FFF9,
zero-width-only (ZWSP, ZWNJ, ZWJ, ZWNJ+ZWJ, WJ): 422. BOM-only: 422 "required" (trim). 201 chars: 422. Accepted, with the
bytes stored unchanged: Persian with ZWNJ (`d985db8ce2808c...`), Devanagari conjunct with ZWJ, emoji ZWJ family, 100 x "a"+ZWJ,
digits, Arabic-Indic digits, 200 chars. Raw multipart bytes: invalid UTF-8 and a CESU lone surrogate become U+FFFD (201 when
there is a letter, 422 when U+FFFD is alone); an overlong or raw NUL: 422. A field over 2048 bytes is multer's 400 (unchanged
by this diff). No 500 anywhere.

Clean-up: the round 3 scratch databases (xr_studio_fo6d_5803, xr_studio_fo6d_brk3_5905) were dropped. `xr_studio_fo6d_3016`
(created 06:15 UTC, before this round) is not mine from this round and was left alone. The local cluster on :54329 was found
stopped and was started for this run.

Verdict: Approve
