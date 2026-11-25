# Break report: QA-779 part (a), a person's email (PR #3556, head 76270bf84)

Adversarial breaker, 24 Nov. Isolated copy `brk779` on :4449 (PLATFORM_IDENTITY=local, live AI off, US$0), stopped and removed afterwards.
The builder's `check_qa779_person_email.ts` ran green first (23/23). The probes are scratch scripts (API: about 120 calls; browser: Playwright, 14 journeys); they are not committed.
Sample firms and Sample people only. No screenshots in the repo were regenerated.

## Findings

No Blocker. No Major.

| # | Severity | What I did | Expected | Actual | Where |
|---|---|---|---|---|---|
| m1 | Minor | Set up a person with a conflict check recorded, then changed only their **phone** via the API. On the prospect page: Edit email, then Save with the address unchanged. | Nothing changed, so no "saved" toast and no claim about the email. | The toast says "Email saved." (no write and no audit line, which is correct). The page also says "The conflict check was run with the old email. Run it again…", but the email never changed; the phone did. The same words appear when there was no email before, or when a name change made the check stale. | `web/…/person-email.tsx:50`, `:95` (shown on any CONFLICT_CHECK_STALE, whatever caused it) |
| m2 | Minor | With everyone-sees-all **off**: the lead is owned by the Owner and the prospect by the Case Manager. The Case Manager calls GET prospect. | Decide whether the prospect owner may read the email of a person whose lead they cannot open. | `person.email` is now returned to the Case Manager. Before this change they could not read it anywhere: lead read 404; conflict-checks, timeline and retainers carry no address. The new read matches the edit route's own `seen` rule (a prospect the editor owns that names the person). So this is a widening, not a leak, but it was not stated. Read-only and Billing could already read it on the lead read (same key `agent/prospect:show`). | `api/…/sales/prospects.ts:235` |
| m3 | Minor | Two people, P1 and P2, are both set to the same new address in two simultaneous PATCHes. | At least the second save warns about a duplicate (P-574 (2)). | Both are 200 with **no warning**. `Duplicates.check` runs before, and outside, the row lock and the transaction. | `api/…/people/edit.ts:114` |
| m4 | Minor | With everyone-sees-all off, the Case Manager owns Wil's prospect (Wil's lead is the Owner's). The Case Manager sets another person's email to Wil's address. | Wil is named, or at least not called unopenable: the Case Manager can open Wil's prospect and may even edit Wil's email. | The warning reads "Someone you cannot open already has this email address…". It is nameless, so nothing leaks, but the words are inaccurate. The match "seen" rule (lead only) differs from the edit's `seen` (lead or owned prospect). | `api/…/people/edit.ts:131-132`, `duplicates/service.ts` (seen = lead) |
| m5 | Minor | Set a merged-away (tombstone) person's email via PATCH (`merged_into_id` set). | 404 or 409: a merged-away record is never a match and should not be edited. | 200, the email is written to the tombstone, with an audit line. The phone path does the same (the same `seen`), so this predates the PR. It is reachable by API only. | `api/…/people/edit.ts:117` |
| m6 | Minor | Body `{"email":"x@example.com","version":""}`. | 422 on `version` (an empty version is not a version read). | 409 STALE, with the current email and phone. The person is visible, so nothing leaks. The phone path is the same (`:76`). | `api/…/people/edit.ts:111`, `:119` |
| m7 | Minor | UI: type r1, press Enter, then type r2 and press Enter while the save is in flight. | Either the field is locked while saving, or r2 is kept as a draft. | Only r1 is saved, and the second Enter is swallowed by the one-save guard. `draft.saved()` then clears r2 silently: the editor closes, showing r1 and "Email saved.". The input is not read-only while busy. | `web/…/person-email.tsx:49`, `:73` |
| m8 | Minor | UI: a stale save shows the conflict notice, which takes focus. Press Escape. | Escape cancels (the file's own comment). | Nothing happens: the Escape handler sits on the form, and focus is on the notice outside it. Cancel and "Use the saved version" do work. | `web/…/person-email.tsx:66-67` |
| m9 | Minor | Addresses the field accepts: `a..b@x.com`, `.a@x.com`, `a@-x.com`, `a@x..com`, `a@[127.0.0.1]`, `%00@x.com`, `<img src=x onerror=alert(1)>`-style local parts (no spaces), a lone combining mark `́@example.com`, 200 emoji (254 code points, 806 UTF-8 bytes). Homoglyphs too: Cyrillic `аna@`, full-width `ａｎａ@`. | The field the retainer will be sent to refuses what can never be delivered, or at least warns on homoglyph twins. | All are saved with 200. A homoglyph twin of an existing address gets no duplicate warning (exact match only). This is inherited: FO-2's `email` rule, as the ruling asks. React renders the markup as text, so there is no XSS. | `api/…/sales/common.ts:39`, `ports/matching.ts:13` |

## What held

- **Ids.** Another firm's person, an unknown id, the nil UUID, `abc`, a UUID with a suffix or braces, `%00`, 5,000 characters: all 404 with the same words. An upper-case UUID is accepted and lower-cased.
- **Who may.**
  - No token: 401. A bad token: 401. Read-only and Billing: 403.
  - Case Officer with see-all: 200. Firm B's Owner on a firm A person: 404.
  - See-all off: an unseen person is 404, and nothing is saved.
  - An invalid email on an unseen person is 422, refused before any read, so it says nothing about whether the person exists.
- **Bodies.**
  - Arrays and scalars: 422 or 400.
  - `email` as an array, object, true or number: the field's one sentence.
  - `__proto__`, `constructor` and other unknown fields: 422, named.
  - `version` as a number, or over 100 characters: 422.
  - `phone: null`, `""` or a number beside an email: 422 on the phone, and neither field is saved.
  - Phone only: the answer is as before, without an email.
  - Form-encoded bodies are parsed, but the route needs a bearer token, so there is no CSRF path. PUT and POST: 404.
- **Values.**
  - Bidi marks (U+202E, U+200E), NBSP, tab, U+2028, BOM, NUL, a lone surrogate, the full-width `＠`, quoted local parts, 255+ and 100,000 characters: 422, never a 500.
  - Mixed case, İ/ẞ/ǅ/Σ, NFD forms and IDN domains are lower-cased or NFC-normalised and saved. The database is collation C, so the `lower()` check cannot reject them.
  - Leading and trailing whitespace and newlines are trimmed.
- **Versions.**
  - If-Match `*`, `garbage`, `W/"…"`, a list, unquoted or `""`: 422.
  - A body version that differs from If-Match: 422.
  - Eight parallel saves with the same If-Match: exactly one 200 and seven 409, one audit line.
  - Eight parallel saves with no version: serialised by the row lock, last writer wins, one line each.
- **Duplicates.**
  - A visible match is named with its lead number. A hidden match is nameless, with no name or id in the body.
  - Another firm's person with the same address: no warning. A merged-away person: no warning.
- **Audit.**
  - One `front_office.person.email_changed` line per change. Its summary, actor and entity key hold no `@`.
  - `detail` has only firmId, staffId, foPersonId and `email_before` / `email_after`, as the phone's do.
  - A case-only change writes nothing. Email and phone together write one line each.
  - No `module_event`; the timeline reads only fo_lead and fo_prospect lines, so the address reaches no timeline or notification.
- **Conflict gate.**
  - Stale after a real change. Still OK after a case-only change. OK again after changing back (values compared, not timestamps).
- **Screen.**
  - Keyboard only: Tab reaches Add email; Enter focuses the field; typing and Enter saves; focus returns to Edit email.
  - Escape in the field cancels, and focus returns.
  - A 422 shows the field's sentence with `aria-invalid`.
  - A double click, a double requestSubmit and Enter together make one write.
  - A stale save from a second session shows Saved now / Yours. "Keep mine, then Save" then saves.
  - Two tabs share the draft and say "also open in 1 other window".
  - A reload mid-edit keeps the draft and its old version, so a colleague's save in between gives a 409, never a silent overwrite.
  - Back mid-edit keeps the draft.
  - 375 px, 320 px and 1024 px at 200 % (512 css px): no horizontal scroll with a 250-character address.
  - Read-only sees the address with no button. No page errors.

Verdict: Approve (Minor findings only; m1 and m2 are worth a line from the tech lead before or after the merge).
