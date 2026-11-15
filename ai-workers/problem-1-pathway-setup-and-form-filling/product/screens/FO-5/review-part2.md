# FO-5 part 2 of 2 (the retainer API): independent review (P-303)

* **PR:** #1777, branch `claude/funny-franklin-ckwwev`. **Commit reviewed:** `c97154b778ddec23df64de5ea79b17a3ab6cb03a` (`git rev-parse HEAD`). Reviewer: Opus, did not build it. Date: 14 Nov 2026.
* **Read:** the diff (`git diff origin/main...HEAD`, 11 files); row FO-5 (`origin/lead/2026-11-07-lead31`); brief `lead-b-briefs/FO-5.md`; concept `fo-5s-retainer-signing` §3 BR-1..BR-18 and §6-§7; contracts §0, §2.3, §2.6, §7 (`origin/lead-b-front-office`); on main: `ports/files.ts`, `ports/render.ts`, `platform/identity/keys.ts`, `platform/settings.ts`, the part 1 migration `20261114210000_fo5_retainer_tables`, PF-3's seeded keys; AG-05 v2.1 only for C5 and AG-5-47.
* All paths below are under `prototype/studio/` unless they say otherwise.

## Runs
* `node_modules/.bin/tsx --tsconfig api/tsconfig.json tests/check_fo5_retainers.ts`: **116 passed, 0 failed**.
* HTTP, isolated copy `fo5rev` on :4434 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`; FO-1a's front-office seed run by hand, three Individual prospects inserted as the test does), signed in as user-R (Owner + Case Manager, licence), user-T (Case Manager, licence), user-O (Case Officer), user-S (firm B). Stopped afterwards; the files it left in the demo's `var/front-office-files/` (m5) removed by hand.

| Call | Result |
|---|---|
| `GET retainer-templates/starter` as R, then upload it as a template | 200 `.docx`, `X-Sample-Note: Sample wording. Unconfirmed: no counsel.`; upload 201, 17 placeholders, no warning |
| starter as O (Case Officer) | 403 |
| Prepare on prospect 1 with a fee; Prepare again on the same prospect | 201 DRAFT v1; second 409, generic text (m8) |
| PATCH edit and POST send at the same moment | send 200; edit 409 `CHANGED` (correct) |
| the same edit again, an empty edit, another edit | **500, 500, 500** `FileKeyTaken` (M1); only Withdraw still works |
| download link as R; the URL as R / firm B / no session / altered | 200 docx / 404 / 401 / 404 |
| sees-all off: read as O; as T (neither owner nor representative) | 404, 404 |
| sees-all off: a link R made, used by O | 200 (m7) |
| sees-all off, T the representative of a retainer on R's prospect: read / edit / send / Signed offline | 200 / 200 / 200 / 200, `prospectWon: true` (m3) |
| a template with `{#fees}{fees.label}{/fees}`; one with `{fees.label}` outside any loop | 422 "{fees.fees.label} is not a placeholder we know"; 201, no warning (m4) |

## Done when: each line has a pass and a fail
| Line | Pass | Fail | Holds? |
|---|---|---|---|
| no active licensed person → no draft (AG-5-49) | representatives = R, T | 409 "No active licensed consultant" | yes; checked before the prospect, so it leaks nothing |
| client name or fee empty → send refused at the field (AG-5-9); everything else "missing" | v2 with fees sendable | 422 `fields.fees`, `fields.client.name` | yes. `completeness` (service.ts:271-279) blocks only those two plus BR-6's choices (signer with an email) |
| merge values copied; a later change to the person never alters them (AG-5-3) | v2 keeps "Client A Sample" | the new name is not in v2; v3 takes it | yes |
| `original_sha256` matches the stored file | sha over stored bytes | other bytes under the key refused | yes |
| an edit before any signature makes version 2 and ends version 1's request | v3, v2 `UPDATED` | — | yes, in part 1's order (end, then status, then the new version) |
| an edit after the client signed → refused (AG-5-65) | — | 409, and a racing edit is refused by the `FOR UPDATE` re-check (service.ts:364-365) | yes, but see M1 for what that refusal leaves behind |
| withdraw without a reason → refused; after Signed → refused (AG-5-34) | Sent → Withdrawn with reason | 422 no reason / spaces; 409 after Signed offline; 409 on a draft | yes |
| Signed offline needs a file and a reason and makes the prospect WON once | WON `SIGNED_OFFLINE`, one stage move | no file, no reason, not a PDF, over 10 MB (Sample), again → refused; one move only | yes; a consultation agreement never wins (service.ts:430) |
| unknown placeholder refused with its name; no fee placeholder → accepted with a warning | warning | 422 naming `{client.passport}` | yes (m4 is a loop edge case) |
| representative reads with everyone-sees-all off; another case officer without the prospect does not | T reads it and the header | O 404 | yes (writes go further: m3) |
| a download link expires and is refused for another firm | link for its firm | expired, other firm, altered | yes at `FileLinks`; route 404/401 also seen over HTTP |
| firm A reading firm B's retainer → 404 | — | read, edit, send, withdraw, draft on B's prospect: 404 | yes |
| every change writes one audit line in its transaction through `AuditPort` | 6 lines for 6 changes on RA1 | a failing audit rolls the draft back | yes; outbox row last in every transaction |

## What holds
* **Keys (AG-05 C5):** every route declares one `agent/retainer:*` key matching C5 (routes.ts:168-182); each is seeded by PF-3; the Case Officer lacks configure-template, offline-sign and void. Default deny via PF-4's guard (O → starter 403).
* **Firm walls:** every read is `firmId`-scoped first; another firm's ids are 404; the download token carries the firm and is checked against the session's firm.
* **FilesPort adapter:** firm folder per key, `FileKey` refuses `..`; write via temp file + `link` (atomic, two writers cannot both win); same bytes = retry. **Links:** HMAC-SHA256 over firm, key, expiry; constant-time compare; 5 minutes (Sample); expired 410, other firm or altered 404; `no-store`.
* **Money:** cents as `bigint`, 0..CAD 100 million, whole numbers only, `ON_DATE` alone carries a real date, currency CAD by the column, total as the sum of rows with an amount ("CAD 3,750.50" tested).
* **Audit and events:** `AuditPort.record(tx, …)` in each transaction (fail-closed, tested), outbox row last; event payloads `.strict()` with ids, kind, version only; audit detail holds ids, versions and sha256, never a name, email or licence number; the read response drops the licence number.
* **Render port and starter:** docxtemplater + pizzip; the starter is built at run time from `samples/fo5-starter-retainer.txt` by the port, no binary in git, labelled Sample and "Unconfirmed: no counsel" in the file and the header; the fee loop is in place; it uploads back with no unknown placeholder and no warning.
* **Part 1's triggers:** the writes follow r2-n2's order everywhere (version ended before the status moves; retainer bumped before the new version; fee rows in the version's transaction). r2-n1's stale comment is fixed. The `platform.prisma` lines moved under the slot lines (no SQL change).
* **AG-5-50:** a Corporate prospect with no `SIGNATORY` gets a draft, a warning and the company's contacts; client name is the company's.

## Findings

### Major
**M1. A rolled-back change leaves its file key taken, and every later Edit of that retainer is a 500 for good.** `service.ts:361-365`: Edit renders and `put`s `retainers/<id>/v<n+1>.docx` *before* its transaction, and only then re-checks the status under the lock. When that re-check refuses (the correct 409 `CHANGED`: a send, or once FO-6 lands the client opening the link or signing, at the same moment), the file stays. The next Edit renders v<n+1> again; the bytes always differ (other values, and even an identical request: pizzip stamps the time into the zip, `docx.ts:56`), so `LocalFiles.put` throws `FileKeyTaken` (`files.ts:40`), which nothing maps: **500 "Something went wrong"** on every retry, forever. Part 1's CHECKs fix the key name (`fo_retainer_version_file_key_check`: `retainers/<id>/v<n>`), so the service cannot pick another one. *Reproduced over HTTP on the first try* (table above): after the race, three edits → 500, 500, 500. Edit and resend (BR-9, AG-5-65 r1, a Done-when line) is then gone for that retainer; the only way out is Withdraw, which emails the client "Agreement withdrawn" once FO-6 lands. The same pattern is in `newTemplateVersion` (`service.ts:193-197`: two Owners uploading a new version at once; the loser can never upload v<n+1> with another file) and `signedOffline` (`service.ts:423-429`: if its transaction is refused, a re-scanned PDF is refused for good). A concurrent double edit also gives the loser a 500 instead of 409.
*Fix (builder's choice; the bar is "a change whose transaction rolled back never blocks the next attempt", with a test that forces a rollback after the file write and then edits again):* e.g. take the retainer's lock and re-check the state before rendering, map `FileKeyTaken` to a 409, and make a refused attempt's key reusable — either keys unique per attempt (needs part 1's three key CHECKs loosened in a new migration: Lead B's OK, P-600) or a byte-stable render plus a rule that a key no row references may be replaced. Ask Lead B in the PR if the migration route is chosen.

### Minor
* **m1. `retainer.sent` is written by FO-5, before FO-6** (`service.ts:392`, `ports/events.ts`). The row's events are drafted, withdrawn and signed_offline; concept §7 gap 2 gives `retainer.sent` to FO-6's send, with the prospect's move to Retainer sent (contracts §2.3). Today a SENT retainer has no request, no email and no prospect move, and the insert-only outbox keeps that event. Either hold the event for FO-6, or state in the PR that FO-6 takes over this method and must handle SENT retainers that have no request.
* **m2. Signed offline wins the prospect but writes no `prospect.won`** (`service.ts:438-451`). Contracts §2.6: "Front office then writes one `prospect.won` event"; FO-8 makes the client from it. The row names only `retainer.signed_offline`, and FO-2 (owner of `prospect.won` and `prospect.stage_moved`) is not on main. This is not a defect of this row. It is a question for Lead B: who writes `prospect.won` for `SIGNED_OFFLINE` (FO-2 reacting to `retainer.signed_offline` with `prospectWon: true`, or FO-5 once the name exists)? Record it in the PR.
* **m3. The representative gets write access, not just read** (`service.ts:121-131` gates every action). With everyone-sees-all off, user-T (representative, not the owner) edited, sent and recorded Signed offline on R's prospect, making it WON (HTTP table). The row and BR-3 grant "may read that retainer and the prospect's header"; AG-05 (v2.1 line 516) says prepare and send also need to "see the lead, prospect…". Either limit writes to people who see the prospect, or get Lead B's OK for the wider rule and write it in the code comment.
* **m4. Placeholders inside a loop or section** (`docx.ts:42-47`). Every tag inside `{#fees}` is prefixed, so `{fees.label}` there is refused as "{fees.fees.label} is not a placeholder we know", a name the firm never typed. Outside any loop, `{fees.label}` is accepted with no warning and prints nothing, because the data has no such key. A section like `{#client.phone}…{/client.phone}` is refused in the same way. The known list (`placeholders.ts:118-121`) shows these names as `fees.label`, which invites both mistakes. Accept the loop's bare names only inside the loop, refuse them outside it, and name in the message exactly what was typed.
* **m5. Isolated copies write into the demo's files** (`files.ts:27` ignores `STUDIO_VAR`; `core.ts:27` has `VAR_ROOT`). `fo5rev` wrote to `studio/var/front-office-files/<firm>/`, and `isolated.sh stop` reported "files removed" but left them (three other firms' folders from earlier runs are still there). `isolated.sh` promises the demo's files are never touched. Default the root to `join(VAR_ROOT, "front-office-files")`.
* **m6. The local adapter is looser than the port** (`files.ts:39-41`). The port (`ports/files.ts:1-3`) and its fake refuse the same key with another content type; `LocalFiles` accepts it and keeps the old type. Also, a key ending `.meta` is the meta file of another key (`files.ts:47, 67`): `put("x.docx.meta")` "succeeds" without writing, and `get` returns the other key's JSON. No caller uses such a key yet, but the port is shared (FO-6, FO-7). Refuse `.meta`/`.tmp` endings or keep meta files in a separate tree, and compare the content type.
* **m7. A download link works for anyone in the firm with the download key** (`routes.ts:155-161`). It checks the firm and the expiry but not visibility: with sees-all off, O downloaded with a link R made (200). Five minutes limits the risk. Bind the token to the staff id, or re-check `visible()` at download.
* **m8. A second Prepare on a prospect with a live retainer gets a generic 409**, "This already exists, or someone else saved the same thing at the same moment" (the global unique-violation mapping; `service.ts:297-302`). Part 1's review (i) asked the API for a plain message, e.g. "Client A already has a retainer in progress. Open it." The rendered v1 file is also left behind (harmless: random id).
* **m9. Send does not re-check the representative** (`service.ts:381-395`). If the representative was deactivated or lost the keys after drafting, the retainer still goes out, and BR-14's dead end ("The representative is no longer active…") follows after the client signs. One `representatives()` check at send prevents this.
* **m10. An edit that ends a sent request writes no event** (`service.ts:366-369`). Under concept §7 gap 9, FO-6 cancels the vendor request when it sees `retainer.withdrawn`; an edit-ended request has no event, so FO-6 must hook Edit directly (BR-9 already makes the two one step). Put this in the PR for FO-6's builder.
* **m11. Gaps against the concept for FO-5s (no new scope asked):** no route lists a prospect's retainers (S2's card has to find them) and no route downloads a template's file or an earlier template version (S1: "versions (each downloadable)"; template versions are not rows, only keys). Say in the PR where FO-5s gets these from (FO-4's prospect read, a later row) so the screen row is not blocked.
* **nit.** The Done-when link lines are tested on `FileLinks`; the route's 410/404 mapping and the representative's read through the guard have no route-level test (the HTTP check above covers them once).

## Journey score (reviewer; the one score for this check)
There is no screen, so the browser parts of `journey-test` (axe, widths, keyboard, visual quality) do not apply. I walked the API journeys over HTTP as staff would drive them through FO-5s (table above): starter → template → prepare → edit → send → withdraw / Signed offline → download, plus the wrong role, another firm, sees-all off, a double submit and a race.

| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | main path works end to end |
| next step obvious | 1 | read returns `canSend`, field `blockers`, `missing` |
| plain words | ½ | most refusals are plain; "{fees.fees.label}" (m4), generic 409 (m8), 500 text (M1) |
| feedback and state | 1 | status, versions with ended reasons, sent times |
| correct data | 1 | values copied, sha256 matches, cents, one audit line each, outbox last |
| error recovery | **0** | after a correct 409 `CHANGED`, Edit is a 500 for good (M1) |
| accessibility and screen sizes | n/a | API only |
| speed | ½ | not timed; no visible wait on any call |
| visual quality | n/a | API only |
| trust and sources | 1 | starter labelled Sample and "Unconfirmed: no counsel" in file and header |

**6 of 8 applicable (7.5 of 10 scaled), one criterion at 0: not a pass.** What would raise it, most valuable first: M1 (error recovery to 1), then m4 and m8 (plain words).

## Verdict
Block on **M1**. To fix: a change whose transaction rolled back (Edit, a new template version, Signed offline) must never leave a key that refuses the next attempt, and a lost race answers 409, never 500. Add a test that forces a rollback after the file write and then edits again. The Minors m1-m11 are for the builder to fix or record in the PR; m2, m3 and m10 need Lead B's answer, not a code change by themselves.

Verdict: Block

## Round 2 (diff-only)
* **Commit reviewed:** `a79fa9e484a63f0f0cad3c792a1b6ced99069c76`. Only `git diff c97154b77..a79fa9e48` was read (the round 1 fix commit `a79fa9e48`; `867a9fb4b` and `9ad7981b9` add only this review and `break-report-part2.md`). Breaker's B-1..B-15 were read for what they ask, not re-tested.
* **Run:** `node_modules/.bin/tsx --tsconfig api/tsconfig.json tests/check_fo5_retainers.ts`: **138 passed, 0 failed**. Probe: `placeholdersOf` (`api/src/front-office/retainers/docx.ts`) called from a scratch script on hand-made zips (results under B-2 below).
* **P-600 read of the new migration `20261115010000_fo5_retainer_file_keys`:** it changes only FO-5's own constraints: three `*_file_key_check` constraints and `fo_retainer_offline_check`, on `fo_retainer_template`, `fo_retainer` and `fo_retainer_version`. No table, column, row, function or other area is touched. The offline constraint is re-created with part 1's other clauses word for word. Part 1's unsuffixed keys stay valid, and a key still names its own row, version and id (tested pass and fail). Its stamp `20261115010000` is later than main's newest (`20261114230000_pf25_web_address`; main has moved since the branch, and nothing conflicts). The rollback note is present. **Holds.**

### Round 1 findings
| Finding | Answer in the diff | Holds? |
|---|---|---|
| **M1** (and B-1) | Every stored key gets a fresh 12-hex attempt suffix: `service.ts` `attempt()`, used by upload, new version, `renderVersion` and Signed offline. The test rolls back an edit, and then a Signed offline, after the file write; the next attempt succeeds. Two edits at once give one winner and the loser 409. | **yes** |
| B-5 | `tx()` maps a refusal raised inside a transaction to 409 | yes (see r2-m1) |
| m3 (B-11) | `visible(ctx, id, true)` for edit, send, withdraw and Signed offline: the representative is read-only unless they own the prospect or sees-all is on | yes |
| m4 | `{fees.label}` is accepted inside the loop and rendered there; outside the loop it is refused | yes; a section on a plain value (`{#client.phone}{client.phone}{/client.phone}`) is still refused as `client.phone.client.phone` (nit) |
| m5 (B-7) | the default root is under `STUDIO_VAR` | yes |
| m6 | the content type is compared; `.meta` and `.tmp` key endings are refused | yes |
| m7 | link tokens are bound to the staff id; another person's link → 404 | yes |
| m8 (B-9) | `RETAINER_OPEN` is checked before rendering, and the unique index maps to it | yes for Prepare; see r2-m2 for Edit |
| m9 (B-4) | an ineligible representative blocks in read and in Send | yes |
| m1, m2, m10, m11 | left as questions for Lead B in the PR body | accepted as recorded |

### New in this diff
**r2-M1 Major: B-2's zip-bomb limit trusts the sizes the zip declares about itself, so one edited header brings the bomb back.** `docx.ts` `load()` adds up `_data.uncompressedSize` from the zip's own directory and stops at 30 MB. pizzip inflates an entry in full and only *then* compares the real length with the declared one ("Bug : uncompressed data size mismatch").
* **Reproduced:** I took a `.docx` whose `word/document.xml` really expands to 1.88 GB and patched its two size fields to say 1000 bytes. The file is 1.8 MB, under the 5 MB template limit. `placeholdersOf` refused it, but only after **6.3 s of synchronous inflate (the event loop blocked for every firm) and about 3.8 GB of resident memory**. A 300 KB variant: 0.9 s, 733 MB.
* **Why it is worse now:** `placeholdersOf` reads every XML part, so a 5 MB upload can carry several lying parts, enough to exhaust memory on a normal server.
* **Who can do it and what it costs:** an Owner or Admin of any firm, on purpose and as often as they like. Refused uploads write no audit line. The availability cost falls on every firm sharing the server.
* **What the fix did achieve:** B-2's stored, persistent form (a template that stalls every later draft) is gone, because such a file is no longer accepted.
* **Fix:** bound the inflate itself, not the declared size. For example, in `load()` inflate each entry before handing it on with `zlib.inflateRawSync(compressed, { maxOutputLength: declared })`, keeping the 30 MB running total, and refuse on `RangeError` with "We could not read this file.". Add a test with a lying header next to the honest bomb test.

**Minor**
* **r2-m1. `tx()` turns any database error that mentions an FO table into "This changed at the same time"** (`service.ts` `tx()`, the `/fo_retainer|fo_prospect|fo_stage_move|P2002|…/` line). A genuine bug, such as a check constraint the code violates, then reads as a harmless race. It is not logged, because the conflict replaces the error. Map only the race signals (P2002, P2034, serialization failure, deadlock, the named unique index) and let other errors through to the logged 500 path, or log the original before mapping.
* **r2-m2. Edit and resend of an Expired retainer, after a new retainer took the prospect, still answers the generic race text.** `edit()`'s `tx()` passes no unique map, so `fo_retainer_one_live_per_prospect` falls through to `CHANGED` "This changed at the same time (someone else saved it)" instead of `RETAINER_OPEN` (B-9's second case). Pass the same `{ fo_retainer_one_live_per_prospect: open }` map, or check before rendering as Prepare does.
* **nit.** An empty `PATCH` is now refused (B-12), so the way to rebind a draft to the person's corrected name (BR-7) is to send any field again, e.g. the same signer. That is fine for FO-5s, but say so in the code comment.

### Verdict (round 2)
Block on **r2-M1**: the zip-size limit must hold against a zip that lies about its sizes, with a test. Everything else from round 1 holds. r2-m1, r2-m2 and the nit are for the builder to fix or record.

Verdict: Block

## Round 3 (diff-only)
* **Commit reviewed:** `0b5518de93ffb1f73dae9d2932838ca259295338`. Only `git diff a79fa9e48..0b5518de9` was read (Lead 50's ruling, P-293). The code is in `0b5518de9`; `8cc4d7576` and `d9aeb0339` are records (this review and the breaker's report).
* **Run:** `node_modules/.bin/tsx --tsconfig api/tsconfig.json tests/check_fo5_retainers.ts`: **146 passed, 0 failed**.
* **Probes:** scratch scripts, nothing in the repository. I ran `placeholdersOf` and `renderDocx` on hand-made files. On a throwaway database, dropped afterwards, I checked what a Prisma check-violation error carries.

### Round 2 findings
| Finding | Answer in the diff | Holds? |
|---|---|---|
| **r2-M1** (B-17) | `load()` inflates every deflated part with `inflateRawSync(…, { maxOutputLength: remaining budget + 1 })` before pizzip sees it; a stored part counts its own length; an unknown method is refused. Every loaded entry has `getCompressedContent`, so the `continue` covers only folders. | **yes.** My round 2 files are now refused at once. The 1.8 MB file that really expands to 1.88 GB (declared as 1000 bytes): refused in 28 ms at 119 MB RSS, against 6.3 s and 3.8 GB before. The 300 KB one: 32 ms. The starter still reads |
| r2-m1 (B-16) | `tx()` maps only race signals and part 1's state-trigger messages to 409; anything else is logged and rethrown (500) | yes (r3-m2 is about what the log line holds) |
| r2-m2 | Edit and resend of an Expired retainer checks the live slot before rendering, and maps the unique index → `RETAINER_OPEN` | yes, tested |
| B-18, B-3 rest, B-19 | text only from `<w:t>` and docProps; parts declared in `[Content_Types]` under any name; at most 2000 tags; ten names per refusal | yes (r3-m1 is a gap in B-18's reading) |
| earlier nit | the hidden-character and blank-text classes in `str()` are `\u` escapes | yes |

### New in this diff
No Blocker and no Major, so the row is not split.

**Minor**
* **r3-m1. `placeholdersOf` reads only `<w:t>`, but docxtemplater also renders `<a:t>` (DrawingML shapes) and `<m:t>` (equations)** (`docx.ts` `placeholdersOf`; docxtemplater's `file-type-config.js:17` `tagsXmlTextArray`). I made a body with `{client.passport}` in an equation and `{client.dob}` in an `a:t` run. `placeholdersOf` found only `client.name`, so the upload is accepted. When rendered, both tags are filled from the data or print empty.
  * BR-1's "an unknown placeholder refuses the upload" is skipped for those two places.
  * No value outside the known list can print, because the data holds only the known merge values. So the harm is a silent blank, not a leak.
  * Fix: read the same element list docxtemplater renders (`w:t`, `a:t`, `m:t`, and the docProps tags), and add a test with each.
* **r3-m2. The new "unexpected database refusal" log line can carry the failing row's values** (`service.ts` `tx()`: `console.error(… ${m.slice(0, 600)})`, where `m` includes `JSON.stringify(e.meta)`).
  * Shown on a throwaway table: for a check violation, `meta.driverAdapterError.cause.detail` is PostgreSQL's "Failing row contains (…)" with every column. That text lands in the first 600 characters.
  * For `fo_retainer_version`, the row includes `merge_values`: the representative's licence number and the client's and signer's emails. Contracts §1.2 and AG-1-30/-31 say a licence number never appears in a log.
  * No path the code can reach today fails a check on that table: `merge_values` stays well under 64 KB, and the keys and hashes are generated. So this is latent.
  * Fix: log the SQLSTATE and the constraint or trigger message, never `detail` or `meta`.

### Verdict (round 3)
Approve. r2-M1 is fixed and verified against a zip that lies about its sizes. Every round 1 and round 2 finding holds or is recorded as a question for Lead B (m1, m2, m10, m11). r3-m1 and r3-m2 are Minors for the builder to fix or record, in this PR or a follow-up.

Verdict: Approve 0b5518de93ffb1f73dae9d2932838ca259295338

## Round 3b (diff-only, Devin's two findings)
* **Commit reviewed:** `19a36dd3c33547d5b645310bdde51fc900a1ed0c`. Only `git diff 7a11b144f..19a36dd3c` was read: `routes.ts` (+1 line), `service.ts` (+11) and the test. `7a11b144f` added only records over the approved `0b5518de9`.
* **Run:** `node_modules/.bin/tsx --tsconfig api/tsconfig.json tests/check_fo5_retainers.ts`: **153 passed, 0 failed**.

| Devin thread | Answer in the diff | Holds? |
|---|---|---|
| 4575579111, a stale save overwrites fees | `edit()` requires an integer `body.expectedVersion`. A missing one is refused with 422 at the field. One that differs from the retainer's `currentVersion` is 409 `CHANGED`, naming the newer version. The `FOR UPDATE` re-check inside the transaction is unchanged, so a save that lands between the read and the lock is still refused. | **yes.** The test saves v2 from one tab: the v1 tab's save is 409 and v2's fee stays. A save without `expectedVersion` is 422. One naming v2 makes v3. Every other edit in the suite goes through a helper that sends the current version, so no existing check was loosened |
| 4575579436, a link outlives a change of owner | `assertFileVisible()` takes the retainer id from the key (`retainers/<uuid>/…`, anything else 404). It re-runs the read form of `visible()`, which keeps the firm wall and the strict UUID check. `download` calls it after the token check and before reading the file. | **yes.** After the prospect changes owner with sees-all off, the former owner gets 404. The new owner and the retainer's representative still may download. A template key is 404. Every key `fileKey()` can sign is under `retainers/<id>/`, so no legitimate link is refused |

* **nit.** The route's one-line call is exercised only through the service method; the suite has no HTTP-level check of it.
* No new findings. r3-m1 and r3-m2 stand as written in round 3.

Verdict: Approve 19a36dd3c33547d5b645310bdde51fc900a1ed0c

## Round 3c (type-only)
Round 3c (type-only): `git diff 19a36dd3c..1d42f813f` is this review record plus one line in `service.ts` `read()`. It adds `as Record<string, unknown>` to `version.values`, a type assertion only, so the output does not change: the licence number is still set to `undefined` and so left out of the JSON. `node product/tools/typecheck.mjs` reports "no new type errors" (15 known, 0 fixed). No new findings.

Verdict: Approve 1d42f813f2a4160f6f503faa74e379c4dbdd3aa3

## Round 3d (diff-only, B-24)
* **Commit reviewed:** `06f0861773d3657801f7262008656afdf3233514`. Only `git diff 542f3256c..06f086177` was read: `routes.ts`, `service.ts` and the test.
* **Runs:** `node_modules/.bin/tsx --tsconfig api/tsconfig.json tests/check_fo5_retainers.ts`: **159 passed, 0 failed**. `node product/tools/typecheck.mjs`: "no new type errors" (15 known, 0 fixed).

| Check | Holds? |
|---|---|
| `expectedVersionOf()` takes a whole number at least 1 on JSON routes. On multipart, it takes digit text (`/^\d{1,9}$/`). Anything else is a 422 at the field. `stale()` is a 409 `CHANGED` naming both versions. | yes |
| `send()` checks the version right after `visible()`, before the blockers and before any write. Its transaction still updates only `where status = DRAFT and current_version = <checked version>`, so an edit landing between the check and the write is still refused. The route now passes its `Body`. | yes; the test covers stale (409, nothing sent), missing (422) and current (sent) |
| `signedOffline()` checks the version after the reason and before the file checks, the file write and the transaction. Its transaction keeps `current_version = <checked version>`. | yes; the test covers stale (409, nothing filed, the prospect not won), missing or malformed (422) and current given as multipart text "2" (filed) |
| `edit()` uses the same helper, so `0` or a negative is now 422. The lock re-check is unchanged. | yes |

* **Note for FO-5f (Lead B's call, not a defect of this diff):** paper signed on an earlier version can no longer be filed once a newer version exists. Part 1 already ties Signed offline to the current version, so the firm's way out is to edit back to the signed terms (a new version) or withdraw. Say so on S6's Signed offline panel.
* No new findings. r3-m1 and r3-m2 stand.

Verdict: Approve 06f0861773d3657801f7262008656afdf3233514

## Round 3e (CI: PF-25 stamp check)
* **Commit reviewed:** `6bad0f6c418e299850383d53453460d5a51bd1a6`. That is `08b0dc88b` (code approved at `06f086177`; `06f086177..08b0dc88b` adds only records), plus the merge of `origin/main` (`dc6d03be7`), plus one test change.
* **The merge did not touch FO-5:**
  * `git diff 08b0dc88b..dc6d03be7` over FO-5's own files is empty: `api/src/front-office/`, `api/src/features/front-office-retainers.ts`, both FO-5 migrations, `front-office-retainers.prisma`, `samples/fo5-starter-retainer.txt` and `tests/check_fo5_retainers.ts`.
  * The `api/` folder as a whole does change, but only with main's own files (PF-25's `platform/web-address/*` and its feature file, plus main's `answer-keys.ts`, `fill*.ts` and checkpoint edits). `platform.prisma` gains only PF-25's two lines under its own slot.
  * Seen from main (`git diff dc6d03be7^2 dc6d03be7`), the merge carries exactly FO-5's files and records, nothing else.
  * Migration order: `20261114210000_fo5_retainer_tables` < `20261114230000_pf25_web_address` < `20261115010000_fo5_retainer_file_keys`, so FO-5's new stamp is still later than main's newest (P-600 (4)).
* **The test change** (`git diff dc6d03be7..6bad0f6c4`, `tests/check_pf25_web_address.ts:89-93`): "PF-25's migration is the newest of all" becomes "later than every one before it, and its 14-digit stamp unique". This is correct. The old form fails every later schema row that P-600 requires to merge after it, which is CI shard 1's failure at `7a11b144f`. Its uniqueness clause still catches a stamp clash.
  * **nit:** `newestBefore < NEW` is true by construction (it is taken from `d < NEW`). What remains checked is that the migration exists and its stamp is unique. That is all a test can check once later rows exist; the order at merge time stays P-600's step for the release holder.
* **Runs:** `check_pf25_web_address.ts` **68 passed, 0 failed** (the stamp line passes: "newest before it: 20261114210000_fo5_retainer_tables"). `check_fo5_retainers.ts` **159 passed, 0 failed**. Typecheck: not re-run here. The coordinator reports no new type errors, and this round's only change is a test file.
* No new findings.

Verdict: Approve 6bad0f6c418e299850383d53453460d5a51bd1a6

## Round 3f (CI guards)
* **Commit reviewed:** `2a36d6952b8ba60098b5641b840fb09309159bf6`. Only `git diff 6bad0f6c4..2a36d6952` was read: this record, `service.ts` (5 lines) and `tests/check_b164_no_engine_keys.ts` (1 line plus a comment).
* **Runs:** `check_case_feed.ts` **39/39**; `check_b164_no_engine_keys.ts` **63 passed, 0 failed**; `check_fo5_retainers.ts` **159 passed, 0 failed**. Typecheck: not re-run here (the coordinator reports no new type errors).

| Change | Judgement |
|---|---|
| 1. Five `this.audit.record(tx, this.line(…))` calls become `{ ...this.line(…), entity: "fo_retainer" }` (draft, edit, send, withdraw, Signed offline) | Same data at runtime: `line()` already sets `entity: "fo_retainer"`, and the spread then overwrites it with the same value. Action, entity key, summary and detail are unchanged, so the earlier checks still hold: no name, email or licence number; audit in the transaction; outbox row last. It only makes the entity a literal that `check_case_feed`'s sweep can read, like the template and `prospect.won` writes already were. **Fine.** |
| 2. `NOT_KEYS` in `check_b164_no_engine_keys.ts` gains `firm` and `fees` | **An acceptable narrowing, not a loosening of the guard.** `keyLike()` checks known keys and the heads of every known combination key *before* `NOT_KEYS` (`:141-145`). So a real program code can never be hidden by this list: it is caught as a known prefix first. `NOT_KEYS` only switches off the last fallback, the guess that an unknown two-to-five-letter head before one dot is a *new* program. Program codes are two or three letters taken from the data ("vv", "sp", "pnp"), and no program is "firm" or "fees". The ALLOW list (shrink-only) is untouched, the program-name, form-number, slice-word and regex checks are untouched, and the line names its reason, as the list's other heads (`exempt`, `cited`, `uci`) do. The one thing it stops flagging is a string such as `"fees.sp"`, a fee table keyed by a program code in the *second* part. The old heuristic caught that only by accident, because it reads the head as the program, and a later row would need a proper check for it anyway. Recorded as a nit, not a finding. |

* No new findings. r3-m1 and r3-m2 stand.

Verdict: Approve 2a36d6952b8ba60098b5641b840fb09309159bf6

## Round 3g (main merge after FO-3 and PF-4t)
* **Commit reviewed:** `b79f50ce8243c97f8deb1e848ecf74336d4417ca`, a merge of `origin/main` (FO-3 #1760, PF-4t #1775; main is an ancestor) into `eb9004a0a`. Read: `git diff origin/main b79f50ce8 -- ports/events.ts api/src/front-office/retainers/routes.ts`, plus the file list of `git diff origin/main b79f50ce8` and `git diff eb9004a0a b79f50ce8` over FO-5's files.
* **`ports/events.ts`:** relative to main, only FO-5's additions: the four `RETAINER_*` names after main's `BOOKING_*`, and `RetainerEventPayload` (strict; ids, kind, version, `prospectWon`) after main's `BookingEvent`. The text matches what was approved. Main's lines are untouched.
* **`retainers/routes.ts`:** the same 15 routes in `@` form (`api/tsconfig.json` has `experimentalDecorators` and includes `src/front-office/**`), with `@Inject` on all four constructor parameters. I compared them one by one with the approved `decorate` table.
  * Paths, verbs, `HttpCode(200)`s, keys, upload interceptors (2× limit) and parameter bindings are the same. Send's `Body` is still passed.
  * `link` still signs for the person, and `download` still runs the token check, then `assertFileVisible`, then `no-store` and `nosniff`.
  * The only import change is `decorate`, gone from `keys.ts` after PF-4t. No logic changed.
* **Nothing else moved:** since `eb9004a0a`, FO-5's other files (`service.ts`, `docx.ts`, `placeholders.ts`, `files.ts`, the feature file, migration `20261115010000`, schema file, test) are unchanged. The other `front-office/` changes are main's FO-3 booking files. The whole diff from main is FO-5's own file list: records, code, migration, the two schema lines, the starter text and the tests (FO-5's suite, `check_b164`'s one line, `check_pf25`'s stamp check). Main's newest migration is still `20261114230000_pf25_web_address`, so FO-5's `20261115010000` stays later (P-600 (4)).
* **Runs:** I re-ran `check_fo5_retainers.ts`: **159 passed, 0 failed** (its route-key check reads the `@` metadata). I did not re-run the other suites, the typecheck or the HTTP walk; the coordinator reports fo3 105/105, pf0p 71/71, case feed 39/39, b164 63/63, pf25 68/68, prisma 8/8, no new type errors, and the HTTP walk 12/12.
* No new findings. r3-m1 and r3-m2 stand.

Verdict: Approve b79f50ce8243c97f8deb1e848ecf74336d4417ca

## Round 3h (main merge after PF-21)
* **Commit reviewed:** `c026c684a3fbb59c2eec9bf2cc4d608e5461c014`, a merge of `origin/main` (with PF-21 #1753; main is an ancestor) into `d9951461d`. Read: the two conflicted files against `origin/main`, the file list of `git diff origin/main c026c684a`, and FO-5's files since `d9951461d`.
* **`ports/events.ts`:** compared with main, only FO-5's additions: the four `RETAINER_*` names after main's `COMPLAINT_*` names, and `RetainerEventPayload` after main's `ComplaintClosed`. The text matches what was approved. Main's lines, including PF-21's, are untouched.
* **`tests/check_pf25_web_address.ts`:** no difference from main. PF-21's wording of the same stamp-check fix is taken, and FO-5's round 3e version is dropped.
* **FO-5's files unchanged since `d9951461d`:** the diff over `api/src/front-office/retainers/`, `files.ts`, the feature file, migration `20261115010000`, the schema file, the starter text and `check_fo5_retainers.ts` is empty.
* **The whole diff from main** is FO-5's list (15 files). `platform.prisma` moves only FO-5's three back-relation lines under its own slot lines, next to PF-21's `platComplaints*` lines, which stay as main has them.
* **Migration order:** main's newest migration is `20261114234500_pf21_complaints`, earlier than FO-5's `20261115010000` (P-600 (4)).
* **Runs:** I re-ran `check_fo5_retainers.ts`: **159 passed, 0 failed**. I did not re-run the other suites or the typecheck; the coordinator reports pf21 107/107, pf25 68/68, fo3 105/105, pf0p 71/71, case feed 39/39, b164 63/63, prisma 8/8, and no new type errors.
* No new findings. r3-m1 and r3-m2 stand.

Verdict: Approve c026c684a3fbb59c2eec9bf2cc4d608e5461c014
