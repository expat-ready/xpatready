# J-37: resume note (stopped 19 Nov 08:3x IST by Lead 86, P-719)

**Owner from here:** #2011's lane, after FO-2 part 3b. It starts from this branch. Do not open a J-37 PR from the lane that wrote this note.

**Branch:** `claude/evidence-j37`. It was branched from origin/main 9d440b2f4. Its head is the commit that adds this note; its parent is fd9ce2081 (the walk). **No PR yet.**

**Done.**
* `prototype/studio/tests/journeys/j_37.ts`: the public booking walk, on an isolated copy, in two real browsers, with mail read back from the demo inbox. The demo inbox reads the real outbox (PF-19b's local adapter), so the mail needed no swap: it is already real on the running app.
  * W1: the page lists times.
  * W2: one booker books.
  * W3: two bookers press "Book this time" on the same time at the same moment. One gets through; the other sees "This time was just booked." with the next free times and keeps their answers. Exactly one booking exists, SCHEDULED, with the host.
  * W4: "Your Free consultation is booked" arrives in the demo inbox; the refused booker gets no mail.
  * W5: the mail's manage link opens the booking at its own time with Reschedule and Cancel. A broken link shows "This link is no longer valid."
* Result at fd9ce2081: **8 PASS, 0 FAIL, 1 HELD**, the same on two runs.
* Reviewer (Opus) at 48b350a: **Approve**, 8.5/10, no Blocker or Major (`review.md`). Its Minors m1–m5 and m7 are fixed in fd9ce2081.
  * fd9ce2081 itself is not reviewed yet.
  * Open: m6 (an edge at the shortest-notice cut-off) and m8 (port 4437 is in the runtime lane's range; for the tech lead).
* Screenshots: `screenshots/w1..w5-*.png`.

**Left.**
1. **W4b** (J-9 W4, moved from PF-23w, #1800) is printed HELD today. Booking's `arrival` is `fakeArrival()` in `api/src/front-office/booking/runtime-ports.ts`, so a reminder due after an API restart finds no booker.
   * After FO-2 part 3b swaps `arrival` to FO-2's ArrivalPort: merge its branch tip in (P-270, no rebase).
   * Then make W4b real: book, restart the API (`isolated.sh … restart`, as `j_9.ts` does), and wait for "Reminder: your Free consultation …" in the demo inbox.
   * **Watch out:** the first free time is often today, and the 24 h and 1 h reminders are queued only while still in the future. Book a slot more than 25 h ahead, or use a clock seam on the demo copy, and name it in the PR.
2. After 3b is on main: merge `origin/main` in, run the walk again, and get a fresh review (the head will differ from the approved one). Then open the PR non-draft after `Reviewer: Approve <sha>` (P-683), with the `Duplicate check:` and Done-when lines.
3. The recorded walk (`node studio/tests/journeys/walk.mjs j_37`) needs Playwright's ffmpeg for video, which the cloud image lacks (revision 1011, not 1013). Use CI's `walks.yml` for the recording.

**Run.** From `prototype/`, build the web first (`cd studio/web && npx vite build`), then:
`zsh studio/tools/isolated.sh j37 4437 start --ttl 30 && trap 'zsh studio/tools/isolated.sh j37 4437 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_37.ts j37 4437`
