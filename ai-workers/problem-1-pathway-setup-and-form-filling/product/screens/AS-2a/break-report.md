# AS-2a break report: cited gates and assessment-only releases (PR #3663, head 6f71259ea)

Isolated copy `brk2a` on :4481 (fresh database, `setup_visitor_visa.ts` 15/15, the builder's `check_as2a_cited_gates.ts` 50/50 and `check_as1m_eligibility_move.ts` 52/52 green there first). Actors are given with `x-actor`: author user-A, reviewer user-C, approver user-B, officer user-O, client user-P. "Release" below means submit (A), then sign every change-summary item (C), then approve (B). Scope: the AS-2a row of `screens/AS-2/shape.md`. The screen findings the builder already lists in `walk-as2a/walk.md` (AS-2a2) are not repeated here. US$0: no model call, no priced button.

## Breaks

**B1. Blocker: the flag on a combination that has forms turns off two release guards, and cases still open on the release.**
* Repro on the Visitor visa (`aa78296f…`, released v1 with IMM 5257 and IMM 5707). Gate `g = {key:"s.nominee", label:"Holds a provincial nomination (Sample)", condition:{op:"eq", field:"person.is_provincial_nominee", value:true}, source:{https://www.example.gov/…, section, quote, date:"2026-11-20"}}`. No form on this combination asks `person.is_provincial_nominee`.
  1. Without the flag: `PUT /api/combinations/aa78…/eligibility-gates {gates:[g], judgement:[]}` → 200. Then `POST …/submit` → 400 "s.nominee: This gate reads … which no case of this application is asked". The P-62 guard holds.
  2. With the flag: `PUT … {gates:[g], judgement:[], assessmentOnly:true, version:2}` → 200. Release → 201: v2 has 2 forms and `eligibility.assessment_only: true`.
  3. `GET /api/runtime/openable` (user-O) → `{version:2, startable:true, why:null}`.
  4. `POST /api/runtime/cases {combinationId:"aa78…", clientActor:"user-P", principal:{displayName:"Client B (Sample)"}}` (user-O) → **201**.
  5. On that case, `POST /api/runtime/cases/5aa5b29f…/assessments {person}` → 201. The result names `person.is_provincial_nominee` as missing, a fact nobody on the case is ever asked.
* Expected: the flag excuses nothing on a draft with forms (the builder's own test R says "its form and document lines are still checked"). Either the flag is refused while forms exist, or every check stays on and no case opens.
* Actual:
  * The gate-placement check (P-62) is skipped: `engine/eligibility-gates.ts:241` `if (isAssessmentOnly(e)) {…; continue;}` has no check on forms.
  * The filing-mode check is skipped: `api/src/studio.ts:470`, `api/src/programs.ts:205`.
  * Open a case is refused only when the release has no forms: `engine/programs.ts:74` `&& !s.forms.length`.
  * The door says `assessment_only: true` for this release (`api/src/configurator/eligibility.door.ts:57` ignores forms), so the port tells callers no case opens on a release that cases do open on.
  * The reviewer signs the line "Assessment only: no forms: no case opens on it", which is false here.

**B2. Major: an open case can be moved onto an assessment-only release (release-update door).**
* Repro:
  1. Open a case on Visitor visa v1 (case `3ad1994c…`, 201).
  2. After B1, remove both forms: `DELETE /api/combinations/aa78…/forms/IMM%205257` and `DELETE /api/combinations/aa78…/forms/IMM%205707` with body `{}` (both 200).
  3. Release v3 (201): forms 0, `assessment_only: true`. `GET /runtime/openable` now says "Assessment only: no forms. … a case does not open on it".
  4. `GET /api/runtime/cases/3ad1994c…/release-update` (user-O) → `target.version 3`, `refused: null`.
  5. `POST` to the same path with `{target_version:3, from_revision:1, reason:"Adopting the current release"}` → **200** "Moved to Release 6".
  6. `GET /api/runtime/cases/3ad1994c…` → pin `release_version 3`, status OPEN. The client's `GET …/questionnaire` → 200.
* Expected: 409 in the words "Assessment only: no forms", the same as `POST /runtime/cases`.
* Actual: the move goes through. `api/src/release-update.ts:139` (`move`) and `moveRefusal` (`engine/runtime/release-update.ts:227`) never read the target's `assessment_only` flag or `startableMissing`.
* Held on the other doors: Stages (`api/src/case-stages.ts:109` calls `startableMissing`), and prospect-won and the sample case (both go through `createCase`), checked by reading.

**B3. Major: data the save accepts makes the port throw (shared contract).**
* Cause: the save counts characters by code point (`engine/eligibility-gates.ts:23` `chars = [...x].length`). The port counts UTF-16 units (`ports/eligibility.port.ts:63` `quote … .max(2000)`, `section .max(200)`, `url .max(500)`).
* Repro:
  1. On a new STREAM: `PUT …/eligibility-gates {gates:[{…, source:{url:"https://www.example.gov/sample-stream", section:"Eligibility (Sample)", quote:"a"+"😀"×1999, date:"2026-11-20"}}], judgement:[], assessmentOnly:true}` → 200.
  2. Release → 201.
  3. `new ConfiguratorEligibility(rows from config_release).assess({release_id, persons:[{role:"principal", known:{"person.criminal_history":false}}]})` throws ZodError `too_big … path ["rules",0,"source","quote"]`.
* The same happens with a section of `"a"+"😀"×199` and with a URL of 494 code points that contains astral characters (checked with `checkSource` against `RuleSource.safeParse`).
* Expected: one way of counting. Either refuse at save, or keep the port's limit at or above what the save allows.
* Actual: `listAssessable` lists this release, but every assessment of it fails. FO-15a/b would surface this as a 500.

**B4. Minor: an omitted or null `assessmentOnly` clears the flag on any re-save.**
* Repro: `PUT {…, assessmentOnly:true}` → `assessmentOnly:true`. Then `PUT {gates, judgement, version:1}` (no field) → `assessmentOnly:false`. `assessmentOnly:null` → false too (`engine/eligibility-gates.ts:130`).
* Effect: any caller that does not know the field drops the flag without a word at save time. Examples are the stage-one checkpoint (`api/src/checkpoint-stage-one.ts:46` puts `{gates, judgement, version}`) and an older web build. The change summary does show "No longer assessment only" at review.

**B5. Minor: `Eligibility|assessment_only` can name two different changes.** A gate may be keyed `assessment_only` (KEY_PATTERN, `engine/eligibility-gates.ts:19`), and the flag's line uses the same key (`:284`).
* Repro: a stream with `gates:[{key:"assessment_only", …, source}]`, `assessmentOnly:true`, then submit. The review shows two lines, `Eligibility|assessment_only|added|Gate: …` and `Eligibility|assessment_only|added|Assessment only: no forms…`. One sign-off item `"Eligibility|assessment_only"` (user-C, 201) covers both.
* Expected: a reserved key is refused for gates, or the flag line gets a key no gate can take. The same class already exists for `gate_order`, `officers_judgement` and `disclaimer`.

**B6. Minor: source URLs are checked loosely and stored exactly as typed.** Each of these got 200 with the URL stored as sent:
* `https://www.canada.ca@evil.example/ircc` (host evil.example; reads as canada.ca)
* `https://user:pass@www.example.gov/x`
* `https://canadа.ca/x` (Cyrillic а, homograph)
* `https://localhost/x`, `https://10.0.0.1/x`
* `https:/www.example.gov/x`, `https:www.example.gov`, `https:\\evil.example\x`, `https://www.example.gov/a b`, `HTTPS://WWW.EXAMPLE.GOV/x`

Expected: no userinfo, a public host shown as parsed (punycode), and the normalised `URL.href` stored, so the reviewer signs, and later a client sees, the address the link really opens (`engine/eligibility-gates.ts:114`). `javascript:`, `data:`, `http:` and a 501-character URL are refused (held).

**B7. Minor: the "read" date accepts years 0000-0099 and judges "today" by UTC.**
* `date:"0000-01-01"`, `"0001-01-01"` and `"0096-02-29"` → 200. `Date.UTC` maps years 0-99 to the 1900s, and the day still matches (`engine/eligibility-gates.ts:118`). Expected: a plausible date (no page was read in year 0).
* "Today" is the server's UTC date (`checkGates` default `today`). An author in IST between 00:00 and 05:29 is refused "after today" for their own date.
* Held: `9999-12-31`, tomorrow, `2026-02-29`, `2026-13-01`, `2026-00-10`, full-width digits and a number are refused. `2024-02-29` and today are accepted. Surrounding spaces are trimmed before storing.

**B8. Minor: some invisible or bidi characters get into quotes.** U+061C (Arabic letter mark, a bidi control), U+2060 (word joiner) and U+00AD (soft hyphen) are accepted in the quote and stored. `INVISIBLE` (`contracts/runtime.ts:22`) misses them. U+202E, NUL and U+200B are refused (held).

**B9. Minor: a gate's cited source does not satisfy the source register.** An assessment-only gate `{op:"gte", field:"case.funds_available_cad", value:10000, source:{sample:true}}` saves (200). Submit then gives 400: "1 number has no source entry … Add the official source". So every numeric provincial gate (CLB, 60 points) needs its citation twice, which AS-2d1/d2's loaders will hit. Also, `case.*` and `relationship.*` facts are accepted on a person's gate of an assessment-only release, and `requiredFacts` asks them of "principal".

## Held
* A cited gate saves, and is carried into the snapshot and the review line. An uncited gate on an assessment-only combination → 400 `gates.0.source`.
* `assessmentOnly` set to `"true"` or `1` → 400. With zero gates → 400.
* Source shapes: `{sample:"true"}`, `{sample:true,url}`, `{}`, `[…]`, `__proto__`, a non-string url, a punctuation-only quote, and a quote containing a NUL or U+202E → all 400 in words.
* Hindi and Arabic quotes are stored as given. A multi-line quote is allowed; section is one line only.
* Without the flag, the same no-form draft is refused at submit. Removing the flag after release and resubmitting with no form is refused.
* Only an author saves: user-C and user-B get 403 "Not allowed", user-O and user-P get 403 "Not for case people", no actor or an unknown one gets 401. GET as officer or client → 403.
* The author cannot sign off (403), the approver cannot sign (403), and the author cannot approve.
* Race: six PUTs at once on version 1 → one 200 and five 409. The stored row is at version 2, so no write was lost.
* `POST /runtime/cases` on a no-form assessment-only release → 409 with the exact words. `GET /runtime/openable` shows it not startable.
* The door returns `rules[]` with state and source: met, not_met and not_answered, and `{sample:true}`. The port contract and fake suites are green.
* Old releases' hash: `snapshotEligibility` adds `source` and `assessment_only` only when set, and nothing re-hashes a stored snapshot, so it is unchanged (by reading, plus the builder's test F).
* Not run: the 100-program and 400-combination budget (the PR adds an O(1) flag read per row to `openable` and catalogue), keyboard, 1024 px and 200 % zoom. The PR adds no new UI controls; the editor only carries `source` and the flag through on a re-save.

Verdict: Block
