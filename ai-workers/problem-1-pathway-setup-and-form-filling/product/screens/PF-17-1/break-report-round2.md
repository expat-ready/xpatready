# PF-17 part 1: break report, round 2 (diff-only, head b6965705f; breaker, own git-archive copy)

Builder's check 38/38 in the copy. All round-1 attacks re-run and held: forged and cross-signed tokens, mixed case, path tricks, HEAD and other methods, Content publisher 403, other-environment and SQL-looking ids 404, PF-15 figures equal, no leak, fail-closed audit, size limits, repeated parameters.

* **m2 fixed:** SECURITY_LOCK → ATTENTION "security lock on"; PROVISIONING "still being set up"; ABANDONED / DELETED with an ended subscription → "sign-up abandoned" / "firm deleted" plus "no live subscription"; no subscription row → "no live subscription"; hold plus lock → HELD with both reasons; counts agree with `?health=attention`.
* **m3 fixed:** 27 searches combining `%`, `_` and `\` against planted names (`100%`, `Under_Score`, `Back\Slash`, `Mix\%_`, `Esc\%`) each match only literal text. Unknown keys all 400: `__proto__`, `__proto__[health]`, `constructor`, `constructor[prototype][x]`, `toString`, `hasOwnProperty`, an empty key, `Q`, `HEALTH`, `q%00`, a zero-width space before `q`, `health[]`, `q[]`, `page[]`, `_`.
* **Failed-jobs note works:** an unreadable queue → the page note, counts null, no 500. At the 10 000 cap → the note, counts null; at 9 999 → counted.
* **New m4 (Minor):** the 400 for an unknown key echoes up to 3 keys of 20 characters each, including invisible characters, back to our own staff member. It should name the allowed keys only.
* **New m5 (Minor):** with failed jobs not countable, a firm with nothing else wrong shows OK, so `?health=ATTENTION` misses it. The page note says it; one firm's answer only says it in `failedJobs.unavailable`.
* **m1 (speed) unchanged:** 100 firms take 530–642 ms; five lists at once take 1.5 s; `?q=` takes 7 ms; one firm takes 14 ms. Forced by the brief; goes in the PR body.
* **M1 unchanged and now disclosed:** `?health=HELD` with 100 firms returned 3 rows and wrote 100 platform.bypass lines. This is the tech lead's ruling; the label waits for it. If the ruling is "not per firm on every call", the code changes and this row comes back to the breaker.

Verdict: Approve
