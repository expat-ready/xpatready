# FO-6d review, round 2 (diff only): part 1 of 2, PR #3207

Reviewer: independent reviewer agent, 23 Nov. Branch `claude/nice-curie-tzbprl`, head **8162df5963e24958aa8cb9a8e697d68afa8c6fed**. Scope: `git diff f6d048440 8162df596` (what changed since my round 1 on f6d048440), plus whether part 1 works on its own. Part 2 (#3224) has its own report.

## What I ran (Postgres 127.0.0.1:54329)
| check | result |
|---|---|
| `tests/check_fo6d_any_document.ts` | **24 passed, 0 failed** |
| `check_fo6_signing_api`, `check_fo6_signing_port`, `check_pf6b_permission_rules`, `check_pf19r_every_sender` | 51/51, 17/17, 40/40, 21/21 |
| `checkPdf(file, "letter.pdf", "Letter (Sample)")` on all **33 committed IRCC PDFs** (`official-sources/ircc/`) and the breaker's 3 opened copies | **34 GOVERNMENT_FORM.** The other 2 (`IMM5881E` checklist, `IMM5905E` instructions) have no form and are refused as PDF_PROTECTED. `imm5476e-2021.pdf`, accepted in round 1, is now caught. |
| `checkPdf` on ordinary PDFs: a LibreOffice letter, a pypdf blank page, a 2-page showcase PDF, a LibreOffice error PDF, a fillable non-government form (AcroForm only) | **all 5 accepted**, so the ordinary cases give no false positive |
| `checkPdf` on edge PDFs I built | a PDF with certification-signature markers (`/AcroForm` with a `/Sig` field, plus `/Perms /DocMDP`): **GOVERNMENT_FORM** (false positive, m1 below). An AES-256 owner-password fillable form: GOVERNMENT_FORM rather than PDF_PROTECTED. An owner-password page: PDF_PROTECTED |
| Deflate bomb, 6.6 MB: 400 streams, each 17 MB of zeros | accepted after **2.2 s of synchronous inflate** (m2) |
| **Part 1 alone, the webhook for an OTHER request** (a probe copy of the suite in the ignored `studio/var/`, since removed): the request from S1, consent written, then viewed, signed ×2 and completed through FO-6 part 3's `SigningHooksController` | **viewed and signed were applied by the RETAINER handler. `completed` gave 409 "The agreement changed at the same time (withdrawn or signed on paper)" on every delivery** (Major 1) |

## Round 1 findings
* **M1 (government forms): fixed.**
  * `isGovernmentForm` (`service.ts:133`) checks five signals: an IMM number in the name or title, `/NeedsRendering`, raw `/XFA`, `/AcroForm` together with `/Perms`, and `/XFA` inside a deflated stream. `checkPdf` runs it **before** the `/Encrypt` check (`:157`), so a protected IRCC form now gets "Government forms are not sent…", not "Upload an open copy."
  * The tests are honest:
    * The new S2 fail uses the real `forms/imm5257e.pdf`, renamed, plus an object-stream fixture whose `/XFA` exists only deflated. The f6d048440 code accepted both, so the old code fails this test.
    * The S2 pass now uses a plain PDF with a deflated page, which runs the inflate path and does not trip it.
  * What actually catches the real files is `/AcroForm`+`/Perms` or `/NeedsRendering`. The inflate path catches only the synthetic fixture, which is still the right guard for an opened copy that keeps its object streams.
* **M2 (person documents): moved to part 2** with the route. Part 1 no longer has the route, and the PF-6b sweep line went with it. Checked in part 2's report.
* **Minors 1-7:** taken or said.
  * m1: `DOCUMENT` vs `OTHER` is in "Deviations, said".
  * m2: the FKs to `platform_firm` and `platform_staff(firm_id, id)` are in the migration and the schema. The table is new, so there are no rows to validate.
  * m3: the stale `hooks.ts` comments are gone.
  * m4: split. Part 1 is 691 code lines (744 with md) by `git diff --shortstat 7d7979437 8162df596`, under P-610.
  * m5 and m6 are said in the PR body. m7 is said in part 2's body.
* **Breaker minors:**
  * Fixed: m1 (titles), m8 (`orderBy` before `take: 200`).
  * Left and said: m2, m5, m6, m7. m3 and m4 belong to part 2.

## Findings

### Blocker
None.

### Major
1. **On its own, part 1 hands OTHER webhook events to the retainer handler. The split's "stored and answered *no handler*" does not hold.**
   * **Where:** part 1 puts `signing/service.ts:129` back to `if (found.documentKind === "CONSULTATION")`, FO-6 part 3's line. f6d048440 had `!== "RETAINER"`, and part 2 restores that. Every other kind falls to `applyRetainer`. Before this row no other kind existed. Part 1 adds `OTHER` and lets it be sent, so this path becomes reachable.
   * **What the probe showed:** `viewed` and `signed` are applied, and they write permanent, insert-only audit lines with `retainerId: <the fo_signing_document id>`. `completed` stores the sealed and audit files and then hits `moveRetainer(...).count !== 1`. That rolls everything back as 409 `CHANGED`, "The agreement changed at the same time (withdrawn or signed on paper)". The provider retries forever, each retry writes another file pair, and the request stays CLIENT_SIGNED.
   * **Why it is Major and not Minor:** it is unlikely to be met live before part 2 merges, because nobody can sign without FO-6 part 4's door. But it is the exact property the split needs, it leaves wrong records that cannot be corrected, and nothing tests it.
   * **Fix:**
     * In part 1, take part 2's routing line: `found.documentKind !== "RETAINER"`, with `signingHandlerFor(found.documentKind)`, and `OtherKind = "CONSULTATION" | "OTHER"` in `handlers.ts`.
     * Add a pass and a fail in part 1's suite. With no OTHER handler registered, an OTHER `signed` event answers `{ applied: false, reason: "no handler" }` and stores one receipt. No signer moves, no audit line is written, and a RETAINER event still goes to `applyRetainer`.
     * Then rebase part 2, which loses those lines.
   * **Advisory, not a finding (FO-6 part 3's design):** a "no handler" receipt uses up the event id. If part 2 handled the same delivery later, it would answer `duplicate`. A 409 that keeps nothing would let the provider redeliver after part 2 lands.

### Minor
1. **The `/AcroForm` + `/Perms` signal also refuses certified PDFs** (`service.ts:136`).
   * `/Perms` holds `/DocMDP` in any PDF with a certification signature, for example one already certified by an e-signature service and then re-sent. AES-256 (R6) also puts `/Perms` in the encryption dictionary.
   * Both get "Government forms are not sent…". The PR body says only "a Reader-extended non-government form is refused too".
   * Every committed IRCC form with `/AcroForm` carries `/UR3` (31 of 31 checked; `imm5782e` is caught by `/NeedsRendering`). Narrow the signal to `/AcroForm` + `/UR3`, or say "certified PDFs" in the deviation.
2. **The inflate budget does not count failed inflations** (`:146`).
   * Each stream is inflated with up to 16 MB of output. A stream that goes over throws and adds nothing to `out`, so 400 such streams run 6.4 GB of synchronous inflate.
   * Measured: 2.2 s of blocked event loop per 6.6 MB upload. It needs a staff member with `portal:request-work`.
   * Fix: use `maxOutputLength: min(16 MB, 64 MB − out)`, and add the cap to `out` when the inflate throws.
3. **The title check refuses ordinary non-English text** (`routes.ts:20`, a new defect from breaker m1's fix).
   * `\p{Cf}` includes U+200C ZERO WIDTH NON-JOINER, which is standard in Persian spelling (e.g. "می‌خواهم"), U+200D (emoji sequences and Indic scripts) and the soft hyphen U+00AD that Word pastes. All of them are refused with "This must be plain text on one line." (checked with the committed regex).
   * Fix: refuse only bidi controls (U+202A-202E, U+2066-2069), U+200B, U+2060 and U+FEFF instead of all of `\p{Cf}`. Add a Persian title with ZWNJ as a pass.
4. **The name check misses `IMM.5476.pdf` and catches `IMM-2024 notes.pdf`.** Both are cosmetic: the file signals catch the real forms. No change needed.

## Done-when → proof (part 1's lines)
| line | pass | fail | holds? |
|---|---|---|---|
| government forms never sent this way | S2 pass (plain deflated PDF) | S2: real imm5257e, deflated-only `/XFA`, raw XFA, `client_IMM5476.pdf` | yes |
| non-PDF refused; §12 protected / no email | S2 | S2 ×3 | yes |
| key 403; another firm 404; not own 404 | S3 | S3 ×3 | yes |
| sending never moves a prospect | n/a | S3 | yes |
| firm signer optional, at most one | S1, S5 | S5 | yes |
| DB keeps part 1's rule except OTHER | D pass (OTHER clients-only SIGNED) | D fail (RETAINER) | yes |
| part 1 coherent alone (OTHER webhook before part 2) | none | none | **no: Major 1** |

## Journey score
Not applicable: API only, no screen. FO-6ds owns the journey and its score. In its place I ran the suites, the IRCC and ordinary PDF runs and the webhook probe above. I wrote no journey-test report.

## Could not check
Real certified PDFs from a vendor: I built the markers structurally. Fake adapter only (FO-6v held).

Fix list for Approve: Major 1, with its pass and fail test. The Minors can be done here or recorded.

Reviewer: Changes 8162df5963e24958aa8cb9a8e697d68afa8c6fed
Verdict: Changes
