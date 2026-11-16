# PF-5v part 1: review (independent reviewer, P-303)

PR #1955, branch `claude/runtime-signupmail`, commit `2dce7a1caebb996c356bb1c99368298422c28872`. Reviewed 16 Nov 2026.
Diff `origin/main...2dce7a1c`: `api/src/platform/firms/signup.ts` (+12/-3), `tests/check_pf5v_signup_mail.ts` (new), `product/qa/built/PF-5v.md` (new).
Scope, per the row owner's ruling (Lead B rev 16.62, PR comment 6909412424): QA-484 only. QA-481 (the verification email through MailPort) moves to PF-5v part 2 after PF-19p, so this review does not count its absence as a finding.
This change touches the API only, with no screen. The screen-review parts that need a screen (concept elements, the 1024 px and 200 % walk, the BIC-01 to BIC-20 scorecard, D1 to D20) are N/A. I checked code correctness, unchanged behaviour, words, and whether each rule's test fails when the rule is removed.

## What I ran
* `tests/check_pf5v_signup_mail.ts`: **6 passed, 0 failed**. `tests/check_pf5_signup_billing.ts` (postgres on 54329): **53 passed, 0 failed**. The PF-5 suite file is unchanged by the PR.
* `product/tools/typecheck.mjs`: api has 15 known errors and 0 new; web has 0. CI picks up the new suite (`select-suites.mjs` lists `tests/check_*.ts`).
* **Same-input check, main against this PR**: the same 25 bodies sent to main's `signup.ts` and to this commit's, through `FirmSignUp.signUp` with a null database, so only the field check runs.
* **Output check**: `Body.safeParse` on both versions gives identical `parsed.data` for `"  Maple   Law  "`, `"\tMaple Law\n"` and `"Maple Law"`. The firm name is trimmed and its inner spaces are kept, as before. The email passes through unchanged, as before (`emailOf` still normalises it).
* **Mutation pass**: 11 single-line breaks of the new code, each run against a copy of the PF-5v suite (results below).
* **HTTP walk** on an isolated copy, runtime port :4435 (`tools/isolated.sh rvpf5v 4435 … PLATFORM_IDENTITY=local`), stopped afterwards. I never used :4400.

## Schema correctness (zod 4.4.3)
* **Empty check aborts.** `filled()` is `z.string({ error })` plus a refine with `abort: true`, so an empty field gets exactly one message.
  * `{}`, `undefined` and `null` all give `["email: Enter your work email.", "password: Choose a password.", "firmName: Enter your firm's name.", "countryCode: CA only for now"]`.
  * The blank body gives exactly the three empty messages, in field order.
  * Before this PR, `""` as the password gave both "at least 12 characters" and "not only spaces". Now it gives only "Choose a password.".
  * A wrong type (`5`, `true`, `[]`, `null`) gets the empty words from `z.string({ error })`, as the record says.
* **Password**: only `""` counts as empty. Every other refusal gives the same messages on main and on this PR:

  | Password | Answer |
  |---|---|
  | 11 characters | at least 12 characters |
  | 3 spaces | at least 12 characters; not only spaces |
  | 14 spaces | not only spaces |
  | 257 characters | at most 256 characters |
  | 257 spaces | not only spaces; at most 256 characters |
  | 256 characters | passes |

* **firmName**: `filled → transform(trim) → pipe(min 2, max 120, no Cc/Cf)`. The pipe stops when the empty check fails, so no second message appears.
  * `" A "`, 121 characters, `"Ma\0ple"`, `"\u0007"` and `"​A"` give the same messages on main and on this PR.
  * `"\t\n"` changes, as intended, from "2 to 120 characters" to "Enter your firm's name.".
* **Email**: a blank email now gets "Enter your work email.", as intended. Before, it reached `emailOf` and got "give your work email". A bad email still gets exactly `["email: give your work email (name@example.com)"]` (unit test and HTTP walk).
* **`words()`**: a message that starts with `<field>:` passes through as written.
  * Any other message becomes `<path>: check this answer`. Nested paths join with dots (`acceptedTerms.1: check this answer`). A non-object body gives `body: check this answer`.
  * Unknown keys give `a, b: not a field of this form`. A nested unknown key cannot happen (the form has no nested objects).
  * Duplicates are removed with a `Set`, and the order of first appearance is kept.
  * None of the 25 bodies returned validator text. On main, 9 of them did ("Invalid input: expected string…", "Unrecognized keys", "Invalid option", "Too big").
* **No other PF-5 part 1 behaviour changed.** The field check still runs before any database read or mail. The limit, the form stamp, the 503 when sign-up is not set up, the 202 answers and verification are untouched, and the PF-5 suite has 53/53, including m1/m8 ("each field error names its field").

## Do the tests fail when a rule is removed?
| Break | Result |
|---|---|
| `abort: false` | FAIL (blank answers) |
| email not `filled` | FAIL ×2 |
| firmName not `filled` | FAIL ×2 |
| password blank = trim | FAIL (spaces password) |
| password not `filled` | FAIL ×2 |
| `words` falls back to the validator's message | FAIL (wrong type / unknown key) |
| no trim before the length check (`blank` uses `s === ""`) | FAIL |
| `z.string()` without `{ error }` (a wrong type is not answered as empty) | FAIL |
| no `unrecognized_keys` branch | **survives** (m1) |
| no `Set` de-duplication | **survives** (m3) |
| no `.transform(trim)` | **survives** (m2) |

Every rule the ruling names (the three empty messages, the bad email's words, other refusals keeping their words, no validator text) has a real pass and a real fail.

## Findings
**Blocker:** none. **Major:** none.

**Minor** (fix or list in the PR; none blocks):
* **m1.** The words "<key>: not a field of this form" appear in `qa/built/PF-5v.md` but no test pins them. Without the branch, an unknown key answers "body: check this answer" and every test still passes.
  * Where: `signup.ts`, `words()`, first line; `tests/check_pf5v_signup_mail.ts`, the `typed` check.
  * Fix: assert `typed.includes("extra: not a field of this form")`.
* **m2.** No suite pins that the stored firm name is trimmed. The PR rewrote this line (`.trim()` became `.transform((s) => s.trim()).pipe(…)`), and removing the transform fails nothing.
  * I checked by hand that the output is identical. This gap existed before the PR, but the PR is the line's newest edit.
  * Fix: one assertion in PF-5 or PF-5v that `"  Maple Law "` is stored or parsed as `"Maple Law"`.
* **m3.** The `Set` de-duplication is not tested, and none of my 25 bodies produced a duplicate. Either add a test or drop it as unneeded. It is harmless.
* **m4.** Test names and header overstate what the tests check.
  * `check_pf5v_signup_mail.ts:1-2` says the verification email "reaches the demo inbox through MailPort" (QA-481), but this part does not test that.
  * The 4th check's name starts "a bad email keeps its words", but that body fails parsing first, so the email is never checked and no email message is asserted. The 5th check covers the bad email.
  * Fix: reword both to describe what is checked.
* **m5.** `qa/built/PF-5v.md` says "a wrong type answers as empty". That is true for email, password and firmName only. Other fields answer "<field>: check this answer". Add "(email, password, firm name)".

**Seen, not a finding (outside this row):** a body that is not JSON (`{oops`) answers 400 with the body parser's own words ("Expected property name or '}' in JSON at position 1"). This happens before the door, applies across the app, is not zod text, and is not changed by this PR.

## Journey test (reviewer role; the one journey score for this check)
I took the role of a client of the public sign-up API and sent requests with curl to :4435. There is no screen yet (QA-484 is the API's answer), so the browser, axe, width and keyboard steps are N/A.
* **J1, main error path.** Persona: a new firm Owner. Goal: "I pressed Sign up with nothing filled in."
  * `{}` gives 400 CHECK_FIELDS with each field named in plain words, plus the country.
  * The blank form gives exactly the three messages.
* **J2, alternate errors.** A bad email gives "give your work email (name@example.com)". A short password gives "at least 12 characters".
* **J3, break it.** An unknown key `admin` gives "admin: not a field of this form". An array body gives "body: check this answer". Period `WEEKLY` gives "period: check this answer". None of them returned validator text.
* **Data underneath.** Every refusal comes before any read or write (DW2 runs with a null database). The PF-5 suite (53/53) covers storage, audit and the single firm.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: all three fields named |
| Next step obvious | 1 | each message says what to do ("Enter…", "Choose…") |
| Plain words | 1 | no validator text in 25 bodies or J1 to J3 |
| Feedback and state | 1 | 400 CHECK_FIELDS, one message per field |
| Correct data | 1 | identical `parsed.data`; nothing stored on refusal |
| Error recovery | 1 | J2: the existing words are kept |
| Accessibility and screen sizes | N/A | no screen |
| Speed | 1 | the check runs before any I/O; answers were immediate on :4435 |
| Visual quality | N/A | no screen |
| Trust and sources | N/A | no AI or immigration values |

**Journey score: 7/7 applicable, 10/10 scaled. Pass** (no 0).
Not tested: a person's unaided walk on the sign-up screen (none built yet), a real screen reader, and the email through MailPort (part 2).

Verdict: Approve 2dce7a1caebb996c356bb1c99368298422c28872

## Re-review (diff only, P-277): `2dce7a1c..922c87be`
Two commits are in the diff: c3da635e (the module card) and 922c87be (this review, plus fixes for m1, m4 and m5). Neither changes a line of `api/src`.
* **Module card:** `api/src/platform/MODULE.md` adds `tests/check_pf5v_signup_mail.ts` to the Tests line. `module-cards.py tree` passes (14 cards).
* **m1, fixed.** The new check needs all of these in the `typed` answer:
  * `extra: not a field of this form`;
  * the three empty messages for a wrong type of email, password and firm name;
  * `period: check this answer`.

  I re-ran three breaks against it, and each fails the new check:
  * the `unrecognized_keys` branch removed;
  * `z.string()` without `{ error }`;
  * a different fallback message.
* **m4, fixed.** The header now says part 1 (QA-484) only and that QA-481 is part 2. The 4th check is renamed so it no longer claims the bad email; its assertions are unchanged.
* **m5, fixed.** `qa/built/PF-5v.md` now says that a wrong type of email, password or firm name answers as empty, and any other wrong answer gets "<field>: check this answer".
* **m2 and m3** stay listed in the PR as Minors, which the bar allows.
* **Run:** `tests/check_pf5v_signup_mail.ts` passes 7/0. The PF-5 suite and the code are unchanged since the first review.

No Blocker or Major.

Verdict: Approve 922c87be04e967c8e140998f11ac1c85497664b5
