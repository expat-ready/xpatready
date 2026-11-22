# PF-18s part 3 — My account → Notifications: break report

**SHA:** `dc04e9a7f792ed52a86ae73a379b4a964519759b` (branch `claude/focused-volta-qipbeu`, PR #2904). R1.92.
**Breaker:** a fresh context that did not build this screen. **Date:** 22 Nov 2026.
**Copy:** isolated `pf18snb` on :4447 (never :4400), `AI_LIVE=off PLATFORM_IDENTITY=local`, stopped afterwards. US$0, no model call.
**Read:** the diff; `notifications-page.tsx`, `notifications-contract.ts`; the API on main (`api/src/platform/settings/notifications/*`); concept draft §4 A and §5 and challenge m2–m4 (records, `git show dcc2e6b3b`); `tests/check_pf18s_notifications_browser.ts`.
**Scope (P-26):** concept §4 A only. Notifications → All (PF-18ns) is *Not built* here and was not checked.
**Method:** Playwright plus the API and SQL, through a scratch script outside the repo. Paths below are under `prototype/studio/web/src/modules/platform/settings/` unless they say otherwise.

## Verdict: **Changes**

There is no Blocker. One Major breaks challenge m2, which was marked *Needed for the proof*: after a role change the page is stuck on a refusal. The five Minors are wording, focus and a stale cached view.

## Findings

### M1 (Major): after a role change, every Save is refused until a reload, and the overlay meant for this case never runs
* **Did:** Case Officer user-O opened the page (six groups, Payments included). They unticked Mentions email and Payments email. The Owner then ran `PATCH /api/platform/staff/:id/roles {roles:["READ_ONLY"]}` (200), and user-O's session stayed valid. User-O pressed Save, then Save again.
* **Expected:** challenge m2: "drop any group missing from `current.groups`, because a role change removed it; otherwise the next Save is a 400 `NOT_YOURS` that refuses everything". Concept §5 says a 400 shows "the service's `detail`, then reload".
* **Actual:**
  * Both PUTs returned **422** ("This group cannot reach you, so it has no switches." / "PAYMENTS cannot reach you"). Nothing was written.
  * The Payments row stayed on screen and Save stayed enabled with "2 unsaved changes", so each further Save was refused the same way.
  * The person's valid Mentions change was refused with it.
  * The only ways out are to reload, or to guess that Payments must be ticked back. When they ticked it back, Save went through and Payments disappeared.
* **Why:**
  * The version is a hash of the saved rows only (`api/src/platform/settings/notifications/service.ts:36`). A role change does not change it, so the save is never a 409.
  * `overlay` only runs on 409 (`notifications-page.tsx:56-60`). The page's 4xx branch (`:61-62`) neither re-reads nor drops the group.
  * The contract's comment (`notifications-contract.ts:123-125`) says this case is covered, and the check only tests `overlay` as a pure function (DN3 "pure"), so no test sees the real path.
* **Repro:** see above. Screenshot: scratch `A-role.png` (not committed).

### m1 (Minor): the refusal list shows raw codes, and only the last of several
* **Did:** a PUT naming two groups that cannot reach the person (TEAM_WATCH and FIRM_AND_CONNECTIONS, as Case Officer).
* **Expected:** the person's words ("Payments", "Team watch"), one line each.
* **Actual:**
  * The page lists `Object.values(e.problem.fields)` (`notifications-page.tsx:62`). The server keys both lines `groups`, so `fields` is `{groups:"FIRM_AND_CONNECTIONS cannot reach you"}`: the first group is lost.
  * The list shows enum codes ("PAYMENTS cannot reach you"), not labels. `issues` has both lines.

### m2 (Minor): a 409 whose re-read fails says "We've loaded the latest" when it has not
* **Did:**
  1. A second tab saved Needs you in-app off.
  2. This tab unticked Mentions email.
  3. The GET was aborted (Playwright route), and the person pressed Save.
* **Expected:** the notice says the latest could not be loaded, with a way to try again.
* **Actual:**
  * The notice reads "…We've loaded the latest; your unsaved changes are kept on top. Save again."
  * Needs you in-app still shows ticked (in the database it is off), and the base version is unchanged.
  * The next Save is another 409 with the same words. After the network came back, the next Save was a third 409 (which re-read), and only a fourth would go through.
  * Code: `notifications-page.tsx:58-60` sets the same text whether or not `current?.success`.

### m3 (Minor): a 409 when the other tab saved the same change says "Save again" while Save is disabled
* **Did:** this tab unticked Mentions email. A second tab saved exactly that change. This tab pressed Save.
* **Actual:**
  * 409, then a re-read. `overlay` leaves no difference, so Save is disabled with no unsaved count.
  * The warning still says "your unsaved changes are kept on top. Save again."
  * Nothing tells the person their choice is already saved. (`notifications-page.tsx:60`)

### m4 (Minor): focus falls to `<body>` while sending and after a successful save
* **Did:** keyboard only: Space on Mentions email, Tab to Save, Enter. The PUT was held 800 ms.
* **Expected:** challenge m4 notes that `Button busy` disables a focused button and asks that focus be placed deliberately. Failure does this: the notice gets focus.
* **Actual:**
  * `document.activeElement` is `BODY` during the send and after success.
  * The next Tab lands on the toast's "Dismiss", away from the person's place (WCAG 2.4.3).
  * Code: `notifications-page.tsx:53, 92`.

### m5 (Minor): coming back to the page in the app shows the cached switches, not the newer ones it has just read
* **Did:**
  1. Opened Notifications, then went to Profile.
  2. Another tab saved Needs you in-app off.
  3. Came back with Back, more than 2 s later.
* **Actual:**
  * The background GET returned `inApp:false`, but the page shows the box ticked.
  * `base` takes the first data it sees (the cache) and never updates (`notifications-page.tsx:26`, `if (q.data && !base)`).
  * The page looks clean but shows wrong values. A later Save hits a 409 and recovers, but a person who only looks is misled.

## What held
* Ticking a box back to its loaded value clears the unsaved count and disables Save (`changedGroups`).
* **Double and rapid saves:**
  * Enter, then Enter and Space while the PUT was held, sent one PUT (busy ref plus disabled).
  * 10 concurrent PUTs from one version gave 1×200 and 9×409, with one row written (advisory lock).
* **Two tabs (DN3 path):** the other tab's change shows, the person's change stays on top, and the next Save goes through.
* **Session ended mid-save** (signed in elsewhere while the PUT was in flight): the 401 shows the frame's "Signed in elsewhere" card, and nothing is written.
* **Another person's settings:**
  * The Owner's `GET ?staffId=<Case Officer>` returns the Owner's own eight groups.
  * A body `staffId` is a 422 unknown key.
  * `/api/platform/staff/:id/notifications` is 404.
  * No token and a bad token are both 401.
* **Hostile bodies:**
  * A 5 MB body is 413 in 7 ms.
  * Empty `groups` is 422.
  * `null` is 400.
  * A 70-character non-ASCII version is 422.
  * A repeated group is 422 (DN4).
* **Network:**
  * A failed send keeps the changes (DN5).
  * Going offline and back online with the GET failing kept the form and the draft (no error page).
  * Leaving mid-save, then Back: the save landed and the page shows it.
* **Layout:** 320, 375, 1024 and 1440 px, and 200 % zoom (720 CSS px at ×2): no sideways scroll, and axe (WCAG 2.2 A/AA) found 0 violations on `main`.
* **Focus on problems:** the 422 and 409 notices take focus.
* **Security row:** "Always on", with no control.
* **Leaving with unsaved changes:** `beforeunload` asks while dirty (DN6). An in-app menu click is not blocked, as m2 accepts.
* **Not applicable on this page:** uploads, rules, the 100-program budget, and free text. The labels are the server's pack, so long or non-English input has nowhere to go.
