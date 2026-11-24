# FO-6 part 4d — break report, round 1 (d192b8313)

Breaker, round 1, PR #3536, branch `claude/trusting-goodall-rteeoh` at d192b8313 (nothing edited, committed or pushed).
Scope: `POST /api/front-office/retainers/:id/download-link` with `file: "signed" | "evidence"`, and `GET /api/front-office/files/:token` for `signing/` keys (`retainers/e-signed-files.ts`, `retainers/routes.ts`). The FO-6d any-document route was used only as a source of tokens and keys.

## How it was run
* **In-process:** the PR's suite `tests/check_fo6_4d_signed_downloads.ts` copied to the scratch folder (`…/scratchpad/breaker/base.mts`). Imports point at the studio by absolute path, the psql binaries are `/usr/lib/postgresql/18/bin` (the suite's `/opt/homebrew/...` folder is empty in this cloud box, like the other 267 suites), and the database is named `xr_studio_brk4d_<pid>` (dropped at the end; checked that none is left). The PR's own 21 lines pass unchanged. My variants are appended in `…/scratchpad/breaker/attack.mts`. Run: `cd …/prototype && export PATH="/home/user/xpatready/.tools/node-v24.21.0/bin:$PATH" && npx tsx --tsconfig studio/api/tsconfig.json /tmp/claude-0/-home-user-xpatready/591bdc8e-3f51-5e22-8424-f3438ef3ad10/scratchpad/breaker/attack.mts`. The scratch folder also needs a `node_modules` symlink to `studio/node_modules`, and the file must end in `.mts` because of top-level await.
* **HTTP:** `zsh …/studio/tools/isolated.sh brk4d 4489 start --ttl 30 PLATFORM_IDENTITY=local`, then `…/scratchpad/breaker/http.sh` and `http2.sh` (curl, local sign-in as in `j_54.ts`), stopped by trap. Port 4400 was never used.

## Findings

**m1 (Minor): the 409 says "yet" for an agreement that can never be e-signed.** Reproduction (`attack.mts` B10):
1. Draft, Send, consent, then the client signs through the webhook (CLIENT_SIGNED).
2. `svc.signedOffline(R, r4, { reason, expectedVersion: 1 }, PDF)`.
3. The firm signs; part 3 answers `applied:false, "the agreement is signed offline"`.
4. `link(R, r4, { file: "signed" })`.

Seen: `409 NOT_SIGNED "This agreement is not signed electronically by everyone yet."` on a SIGNED_OFFLINE retainer whose request stays CLIENT_SIGNED with no evidence. The same words come back for WITHDRAWN, DECLINED and EXPIRED retainers (`e-signed-files.ts:35` reads only the request). Expected: the refusal is right (no e-signed copy exists), but "yet" promises a copy that will never come. Words that match the retainer's state would be better, for example "This agreement was signed on paper: download the signed-offline copy." or "…was not signed electronically." No data leaks: the caller already sees the retainer.

**m2 (Minor, by code reading): an e-signed consultation agreement gets the same false "not signed … yet".** A consultation agreement is an `fo_retainer` row with `kind: "CONSULTATION"` (`booking/consultation-agreement/service.ts:236`). The retainer's read rule (`retainers/service.ts:225`, `visible`) does not filter by kind, so `POST retainers/<consultation id>/download-link {file:"evidence"}` passes the 404 step. It then fails `documentKind: "RETAINER"` (`e-signed-files.ts:33`) and answers 409 "not signed electronically by everyone yet", although FO-3c's request is SIGNED with evidence. I could not reproduce it in-process: relabelling a request's kind is refused by the trigger `fo_signing_request_write` ("only the status and its end change"), and a full FO-3c signing set-up was not built. Expected: a refusal that names the right route (the consultation's own `signed-copy/download-link`), or 404 for a non-RETAINER kind. Its audit file has no download route anywhere, but that is FO-3c's scope and not a finding here.

## Attacks that held (expected = actual)
| # | Attack | Answer |
|---|---|---|
| 1 | Bodies (in-process): `null` and `{}` go to the old path and give the current version's docx; `[]`, `"signed"`, `{file:["signed"]}`, `{file:"SIGNED"}`, `{file:" signed"}`, `{file:null}`, `{file:{}}`, `{file:"evidence\u0000"}` | 422 on `file` or `body` (old `FileLinkBody`), no link |
| 2 | Strict body: `{file:"signed",version:1}`, `{file:"evidence",x:1}`, `{file:"signed",file2:"x"}`, a `__proto__` key | 422 naming the extra field |
| 3 | HTTP bodies: raw `null`, `"signed"`, truncated JSON | 400 BODY_NOT_JSON (app parser); `[]` 422; no 500 |
| 4 | Order: malformed id + bad body → 404; unknown id + bad strict body → 422; other firm's id + bad body → 422; other firm's id + good body → 404 "No such file"; id with a trailing `/` → 404 | as claimed |
| 5 | Uppercase retainer id | `idParam` lowercases it; a valid link (consistent with the old path) |
| 6 | A hidden colleague (everyone-sees-all off) on an **unsigned** retainer | 404, not 409: the signing state does not leak |
| 7 | The owner and representative with everyone-sees-all off | still gets the link (BR-3 read rule) |
| 8 | Firm B's person with a token naming firm A's sealed key (minted for B) | 404 (firm filter) |
| 9 | A link used after 301 s | 410 LINK_EXPIRED |
| 10 | Tokens: empty, 900 characters, `x.y`, `%2e%2e`, non-ASCII | 404, no 500 |
| 11 | Keys: another attempt folder, `sealed.pdfx`, `signing//`, upper case, `..` | 404, or refused at minting (`FileKey.parse`); no route can mint such a key |
| 12 | An OTHER document's sealed copy, original and **audit** key at `files/:token` | 404 |
| 13 | A retainer's sealed and audit keys at FO-6d's second check (`AnyDocuments.assertKeyVisible`) | 404 (filtered to OTHER). Consultation `copyVisible`, identity `assertCopyVisible` and support `assertKeyVisible` all need their own key or kind (read) |
| 14 | v1 sent then edited (request CANCELLED UPDATED), v2 sent and SIGNED | `{file:"signed"}` names the v2 request's sealed key, never v1's |
| 15 | A request SIGNED for an earlier version | cannot exist: after SIGNED, edit is NOT_EDITABLE and signed-offline is NOT_SIGNABLE; part 3's completion moves the retainer only with `currentVersion = document_version` |
| 16 | Signed offline after the client e-signed | 409 for `signed` (m1's words); `signed-offline` still gives the paper copy |
| 17 | Visibility lost after the link was made; another person's link | 404 (the PR's own lines, re-run) |
| 18 | No session; a READ_ONLY role (`agent/retainer:show` without `:download`) on both routes, over HTTP | 401; 403 missing-permission `agent/retainer:download` |
| 19 | 20 links and downloads in parallel, half signed, half evidence | exactly 2 distinct sha256 values, each the stored one; no error |
| 20 | Wiring on a running copy | the app boots with `RetainerSignedFiles` injected; e-signed bodies answer 404/422 over HTTP, not 500 |
| 21 | Headers | fixed names `signed-agreement.pdf` and `signing-evidence.pdf`, attachment, nosniff, no-store; no key in any answer or file name |

Not attacked: hostile uploads and planted instructions (this part takes no upload and runs no model; the sealed bytes come from the adapter, and the real vendor is FO-6v), screens, keyboard and zoom (API only), and the 100-program budget (two indexed reads per call).

Verdict: Pass
