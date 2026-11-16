# PF-Fp part 1 — review (reviewer, 16 Nov 2026)

PR #2028, branch `claude/runtime-pffp-topdf`, **commit 42ba3563**. A runtime row with no screen: the `toPdf` port, its fake and contract, and the Gotenberg adapter. The container line is PF-8's and is not in scope. Read against the brief (`lead-b-front-office:…/lead-b-briefs/P-630-amendments.md`, "New row PF-Fp") and tech gate entry 17 ("Word to PDF: Gotenberg").

**Verdict: Changes needed (Block).** One Major is open (M1). It is a one-line fix plus one live check, and I have verified that fix (below).

## What I ran (studio folder, node 24.22.1)
* `npx tsx tests/check_pffp_pdf.ts`: **37 passed, 0 failed**, and the live part printed NOT RUN.
* `GOTENBERG_URL=http://172.18.0.2:3000 npx tsx tests/check_pffp_pdf.ts`: **48 passed, 0 failed**. The container ran from digest `sha256:53073e79…2996` with the three flags, on network `pffp-net` (`Internal=true`), with no mounts.
* `node tools/check-port-contracts.mjs`: 0 problems, `DocumentPdfPort ×2`. `graph.mjs --check`: exit 0. `tsc --noEmit`: no error in the touched files.
* Probes I wrote myself (in the scratchpad, not committed):
  * A body that stalls after the headers gives TIMEOUT in 304 ms (limit 300), so the timeout covers the body read.
  * A 51 MB answer gives FAILED ("over 52428800 bytes").
  * Inside the container only `soffice.bin` runs, so Chromium is not started, as the gate requires.
  * With webhook headers sent, the container answers a synchronous 200 `%PDF-`, so webhooks are off.

## Gate entry 17, condition by condition
| # | Condition | Result |
|---|---|---|
| 1 | Only `/forms/libreoffice/convert` is enabled | **Not met (M1).** The adapter calls only that route: there is no path in the base URL and `redirect:"error"` (tested). Chromium routes answer 404 live. But the nine `/forms/pdfengines/*` routes are open on the container. |
| 2 | Private network, no outbound, no secrets, no volume | The adapter's part is met: `gotenbergBase` refuses a user, a password, a path, a query, `file:` and `ftp:`. The network part is PF-8's stack line; on this host the container's network is internal with no mounts. |
| 3 | 10 MB cap, 30 s timeout, failure means no PDF and the `.docx` is kept | Met. TOO_LARGE is refused before sending (the stand-in saw 0 requests). TIMEOUT is returned. FAILED covers unreachable, non-ok, not a PDF and an adapter that throws. `withPdf` keeps the `.docx`. The values are labelled Sample. |
| 4 | Port and fake in `ports/` (zod only); CI and the demo use the fake | Met. `pdfFromEnv` gives the fake by default and refuses Gotenberg under `CI`. Nothing wires it yet (tested). The port sits on its own interface; see the next section. |
| 5 | Pinned by digest, 8.40.0; patch within 7 days | The digest is met (`isPinned`, with 4 fail shapes). The 7-day rule is process, not code. |

## The decision to use its own port (`DocumentPdfPort`, not `DocumentRenderPort.toPdf`)
I think this decision is sound:
* `DocumentRenderPort.render` throws on failure. `toPdf` must never throw.
* The two have different adapters: docxtemplater runs in-process, and Gotenberg is a remote call.
* Putting both on one interface would force `DocxRender` (`docx.ts`, outside the touch list) to carry a method it cannot keep.

It still departs from the literal text of the brief and of gate condition 4. It is recorded in the PR (decision 1) and is not silent. Lead B should amend the brief's row and gate entry 17 condition 4 to name `DocumentPdfPort` (P-423 Lead read: this is a shared contract).

## Contract: fake and adapter
The 5 cases (convert, over the cap, not a zip, unreadable, timeout) pass on:
* `fakePdf`;
* `GotenbergPdf` against the stand-in;
* `GotenbergPdf` against the live 8.40.0 container.

Three broken adapters each fail their own case: one that throws, one that sends before checking, and one with no time limit. The promises match. The fake's TIMEOUT waits for the limit, like the real adapter, and both refuse with the same `refuseBeforeSending`.

## Findings
**Blocker:** none.

**Major**
* **M1. Gate condition 1 ("only the LibreOffice route is enabled") is not met by `GOTENBERG_FLAGS`.**
  * Where: `api/src/front-office/render/gotenberg.ts:18`.
  * What I saw: on the live container, `POST /forms/pdfengines/metadata/read`, `/metadata/write` and `/flatten` each answered **200**; `merge`, `split`, `convert`, `encrypt`, `embed` and `bookmarks/read` answered 415, so the routes are live. These routes are ExifTool, QPDF, pdfcpu and pdftk. The gate's own safety section names those tools in its critical and high advisories (GHSA-gpf4-wmvf-cgjw, GHSA-r77c-ghhj-665p).
  * Why it slipped through: the gate lists three flags, so the gate's own list is short too. This file is the one source PF-8 will read. The check at `tests/check_pffp_pdf.ts:87` only compares the constant with the same literal, and the live check (`:154-156`) probes only Chromium routes. So the tests show condition 1 as met when it is not.
  * **Fix:** add `--pdfengines-disable-routes=true` to `GOTENBERG_FLAGS` and its test (`:87`). Add a live check that `/forms/pdfengines/metadata/write` and `/merge` answer 404. Ask Lead B to add the flag to gate entry 17.
  * Verified: a throwaway container from the same digest with the four flags answered 404 on those routes, and the full live run still gave 48 passed, 0 failed.

**Minor**
* **m1.** `gotenberg.ts:53`: `AbortSignal.timeout` sits outside the `try`. A `timeoutMs` of -1 or NaN makes `toPdf` **throw** (`ERR_OUT_OF_RANGE`), which breaks "never throws" through bad configuration. Fix: check for a positive integer in the constructor (`:46`).
* **m2.** Three promises have no test:
  * the timeout during the body read (`readCapped`, `:59`, `:76`);
  * the 50 MB output cap (`:79`);
  * webhooks off.

  Removing the cap, or clearing the timer once the headers arrive, keeps the suite green. Fix: a stand-in that sends headers and then stalls, one that sends a body over the cap (with a lowered cap), and a live check that webhook headers still get a synchronous 200 PDF.
* **m3.** `tests/check_pffp_pdf.ts:159`: the downloadFrom check (`status !== 200`) cannot fail. A download from `127.0.0.1:9` fails whether or not the flag is set. Fix: assert that the 400 body is "no form file found", which shows the field was ignored.
* **m4.** C2's real pass and fail (internal network, outbound refused, no volume) is only a manual note in the PR body. Carry it into PF-8's Done when as a scripted check.

## Journey test (reviewer role; no screen, so a scripted walk of the callers)
Journeys:
1. FO-5p asks for a PDF of a filled retainer and gets the PDF plus the `.docx`.
2. The converter is down or slow, and the `.docx` is still offered.
3. A firm uploads a hostile or huge Word file, and it is refused before sending or FAILED.
4. An operator sets the wrong env, and the app refuses at start.
5. CI runs with no container and uses the fake.

All five hold, except that the hostile-input surface is wider than the gate allows (M1).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Live conversion; `pdftotext` reads every line back (C6) |
| Next step obvious | 1 | `withPdf` returns `{docx, pdf, failure}`; MODULE.md names FO-5p's wiring |
| Plain words | 1 | Short failure details; no internals leaked |
| Feedback and state | 1 | Four failure reasons, each tested |
| Correct data | 1 | The text is intact; a line not in the file is absent |
| Error recovery | ½ | Never throws in normal use; throws on a bad `timeoutMs` (m1) |
| Accessibility and screen sizes | N/A, scored 1 | No screen |
| Speed | 1 | Timeout at 304 ms against a 300 ms limit; the suite takes seconds |
| Visual quality | N/A, scored 1 | No screen |
| Trust and sources | ½ | Pinned, flags in one place; condition 1 is shown as met but is not (M1) |

**Journey score: 9/10. Pass in form, but the verdict stands on M1.**

## Not checked
* PF-8's stack line and the real network rules (out of scope).
* The breaker's results: no breaker comment was on the PR when I read it.
* `run-suites.sh --changed`: there is no Postgres here. The change to `ports/render.ts` only adds exports.
* A real firm template (only the `buildDocx` sample was converted).
* D17 and D20 stay with the founder.

## Re-review: commit 4d4a3673 (diff 42ba3563..4d4a3673, `prototype/` only)
**What I ran:**
* CI part: **41 passed, 0 failed**.
* Live part, on `pffp-got` with the four flags: **53 passed, 0 failed**.
* `check-port-contracts.mjs`: 0 problems.

**Each live check fails when its flag is removed.** I ran the live part against throwaway containers from the same digest, each with one flag left out:
* Without `--api-disable-download-from`: **52/1**. The downloadFrom check fails with "Unable to download file from…".
* Without `--webhook-disable`: **52/1**. The webhook check fails with status 204.
* The builder's own run with the old three flags gave 52/1 on the pdfengines 404 check.

**Status of each finding:**
| Finding | Status |
|---|---|
| M1 | **Fixed.** `gotenberg.ts:19` sets four flags, and the test checks the exact set. A live 404 check covers 4 Chromium routes and 8 pdfengines routes. |
| m1 | **Fixed.** The constructor (`gotenberg.ts:53-54`) refuses -1, NaN, 0 and 1.5 (tested), so `toPdf` cannot reach a bad `AbortSignal.timeout`. |
| m2 | **Fixed.** A dribbled body gives TIMEOUT in under 1.5 s. The output cap gives FAILED when over and the PDF when under. Webhooks off is checked live (200 `%PDF-`, never 204). |
| m3 | **Fixed.** The check requires the 400 "no form file found" answer. It fails when downloadFrom is on (above). |
| Break F1 | **Fixed.** `plainBytes` copies by the array's real length. A 20 MB array that reports 4 bytes gets TOO_LARGE and is never sent, on both adapters. |
| Break F2 | **Fixed.** `CI !== undefined`, so `""`, `"false"` and `"true"` are all refused (tested). |
| m4 | Open, as a note for PF-8's Done when (agreed). |

**New Minors (non-blocking, no re-review needed):**
* **n1.** `gotenberg.ts:25`: `pdfOutputCap` is an exported, mutable, module-wide test hook. Any importer can change the production cap. Prefer a `maxOutputBytes` constructor option, validated like the other limits.
* **n2.** `ports/render.ts:69`: `plainBytes` copies the whole input before the size check, so a very large input is copied once before it is refused. The input comes only from our own API, so the impact is low.

**Verdict on 4d4a3673: Approve.** No Blocker or Major is open. The journey score rises to 10/10: error recovery and trust and sources are now 1 each.

Reviewer: Approve 4d4a367358dd2c453102bd477be63df3b709dcfe
