# FO-4p2b break report: the prospect page's Notes, calls and timeline (PR #3832)

Commit `be4b8a3c79a007467ac72b5b3c9fe9f9a5909590` · breaker (fresh agent, did not build it) · 26 Nov 2026.
Isolated copy `br_fo4p2b` on :4437 (`AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), never :4400. Setup as
`tests/check_fo4p2b_prospect_activity_browser.ts` (that suite: 23/23 pass on this copy). Attacks: API calls with `fetch`, and
Playwright Chromium at 1440 and 375 px in the time zones named below. Every removed key and changed role grant was put
back (CASE_OFFICER again has its 9 `agent/prospect:*` keys; user-O is CASE_OFFICER again), and the copy was stopped.
Scope (P-26): FO-4's concept r2 §4 screen 4 ("centre timeline … with Log a call and Add a note") and panel 5. Path
prefix: `prototype/studio/web/src/modules/front-office/sales/prospect-activity.tsx` (PA).

## Findings

| # | Sev | What I did | Expected | Actual | Where |
|---|-----|------------|----------|--------|-------|
| M1 | Major | Opened Log a call from the keyboard (focus on "Log a call", Enter), then (a) Escape, (b) chose an outcome and pressed Enter on "Log the call" | Focus goes back to "Log a call" (WCAG 2.4.3; the Panel has `returnFocus` for a panel opened without a Radix trigger, controls.tsx:108-110) | In both cases `document.activeElement` is BODY. A keyboard user is sent back to the top of the page after every call | PA:107 (no `returnFocus`) |
| M2 | Major | In the panel, chose Connected and typed call notes, then pressed Escape. Did it again and clicked the overlay | A confirm before typed input is thrown away (concept §4c BIC-13 "input kept"; `confirmClose` is in controls.tsx:111-113; add-lead-panel.tsx:116 and identity-panel.tsx:131 use it) | The panel closes with no question. Reopened, Notes is empty. A note typed during a 20-minute call is lost to one key press | PA:107 (no `confirmClose`) |
| M3 | Major | Added a 40-line note (and a 4,000-character note) by API, then opened the page at 375 and 1440 px | The whole note can be read somewhere on the page | `line-clamp-3` shows 3 lines and an ellipsis (`scrollHeight` 800 against `clientHeight` 60), with no Show more, link or other place to read it. Call notes are cut the same way. A note can be up to 5,000 characters, so staff cannot read most of what their team wrote. Screenshot: the 375 px section (see the hand-back) | PA:78 |
| m1 | Minor | Added a note with the keyboard (Tab to "Add note", Enter) | Focus stays on the button or the box | The button becomes `disabled` while busy and focus falls to BODY. "Show all 500 lines" by the keyboard: the button is removed and focus also falls to BODY | PA:68, PA:82 |
| m2 | Minor | Future time (+1 h, Asia/Kolkata), a time before the lead arrived, and 5,001-character call notes in the panel | Plain sentences on the field | Each error is on the right field (held), but the words are the server's raw `fields` text: "when: a call cannot be logged in the future.", "when: the call cannot be before the lead arrived.", "at most 5000 characters.". On the note box: "this is required." (emoji-only note) and "remove control characters." | PA:35-36 (`Object.values(e.problem.fields)[0]`) |
| m3 | Minor | Minutes: `1,5` / `1e3` / `0x10` / `0.004` | A decimal comma is accepted (or the error names the format), and nonsense is refused | `1,5` → "Minutes from 0 to 1440." `1e3` is stored as 60,000 s and `0x10` as 960 s (JavaScript's `Number()`). `0.004` is stored as 0 s and shows no duration | PA:94, PA:102 |
| m4 | Minor | America/New_York, When `2026-03-08T02:30` (in the spring-forward gap; the lead's arrival was moved back to 1 Jan by SQL) | 03:30 EDT (what the browser's own `Date` gives) or a refusal | Stored as `06:30Z`, which the timeline shows as 01:30, an hour before the time that was typed. The ambiguous `2026-11-01T01:30` becomes EDT (05:30Z), which is fine | PA:31-34 (`withOffset` adds the offset to the typed text, not to the moment `Date` resolved) |
| m5 | Minor | When field | `max` = now, so the date picker does not offer future times | No `max` attribute. The server refuses (held), but only after a round trip | PA:113 |
| m6 | Minor | Pasted 3,000 `é` in NFD (`e` + U+0301) into the note box | Counted as 3,000, as the server does (`textUpTo` and `text()` normalise to NFC: the API accepted the same text, 201) | "Keep the note to 5,000 characters (6,000 now)." and Add note is disabled. Mac-pasted text can be NFD | PA:29 (`len` without `normalize("NFC")`) |
| m7 | Minor | Clicked Add note, then kept typing in the box while the request ran | What was typed after the click is kept | `onSuccess` runs `setText("")`, which clears the later typing as well. The call panel also closes on Escape while a save is running (other panels guard this with `if (!isPending)`), so an error that comes back later is never seen | PA:48, PA:107 |

### Outside this diff (server, FO-2p4), surfaced by this screen: not blocking this PR, for a follow-up row
| # | Sev | Repro | Actual | Where |
|---|-----|-------|--------|-------|
| S1 | Major | A Persian note with the normal zero-width non-joiner: `می‌خواهم ویزا بگیرم` (U+200C). Also an emoji family `👨‍👩‍👧` (U+200D), in a note or in call notes | 422 "remove control characters.", in the UI and in the API. Correct Persian spelling cannot be saved | api/src/front-office/sales/common.ts:19 (`CONTROL` includes `​-‏`) |
| S2 | Minor | Two `POST …/notes` at the same moment with the same text | 201 and 201, two `fo_note` rows (no idempotency key; STANDARDS §4 "Idempotent creates"). The UI guards a double click and a double Enter (1 row each) | calls.ts `addNote` |
| S3 | Minor | `GET …/timeline` | On screen, no AUDIT line shows its summary (held). The JSON still carries `"summary":"Staff 8285f1d4-… engaged lead L-00002 …"` and `actor: staff:<id>` to the browser | timeline.ts:52 |

## What held
- **Time zones:** Asia/Kolkata 12:00 → 06:30Z; Pacific/Chatham (+13:45) 20:00 → 06:15Z; Asia/Kathmandu (+05:45) → 04:15Z; St John's in July (−02:30) → 12:30Z; London in June (BST) → 08:00Z; New York in July (EDT) → 14:00Z. Each is shown back in the viewer's own time.
- **Call limits:** a time more than 5 min ahead is refused on the When field, and a time before the lead arrived is refused there too. Typed notes are kept after an error. Minutes 1440 → 86,400 s. `-1`, `1440.01`, `Infinity` and `abc` are refused on Minutes. Enter in Minutes submits. "How it went" is required.
- **Double submit:** a double click on "Log the call" stored 1 call. Enter twice on "Add note" stored 1 note.
- **Notes:** an empty note is not sent. 5,001 characters are refused with the count. 5,000 Arabic and 5,000 CJK characters are saved. RTL text is laid out right (`dir=auto`, `<bdi>`). Hostile `<img onerror>` / `<script>` show as text: no element, no script run.
- **Leakage on screen:** no staff id, email or audit summary on any line. Firm B gets 404 on firm A's notes, calls and timeline, and firm B's note never shows on A.
- **Keys and states:** READ_ONLY sees the timeline, with no Add note and no Log a call, and the API gives 403. A key removed after the page loaded gives "Your role does not allow this." (the call's in the panel's summary). A lead id on the prospect page gives "Prospect not found". A lost prospect reads "Marked lost" first, and notes and calls are still allowed (the concept does not forbid them).
- **500 cap** (600 notes inserted by SQL): opens in 0.33 s with 10 lines and "Show all 500 lines". After that: 500 lines in 88 ms, "Older lines are not shown (the newest 500 are).", and the oldest kept is the 499th note.
- **375 px:** no sideways scroll. The panel is the full width (375). No page errors.

Verdict: Changes be4b8a3c79a007467ac72b5b3c9fe9f9a5909590 (M1 to M3 are in this diff. The fixes are small: `returnFocus`,
`confirmClose` with the pending guard, and a way to read a whole note or call. S1 to S3 are FO-2p4's and go to a follow-up row.)
