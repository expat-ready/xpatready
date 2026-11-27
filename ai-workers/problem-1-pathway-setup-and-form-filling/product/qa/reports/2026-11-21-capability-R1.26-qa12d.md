# qa 12 — R1.26 Public enquiry form, hardened against abuse: Works on main ca3b24fad, 21 Nov

qa 12 is a cloud session (Opus 5.5, effort medium). This is task ZR126 from the tech lead (Lead 8): re-score R1.26 after #2649, the QA-617 fix, merged at about 04:5x IST. Live AI off, US$0.

## Verdict
**Works (P-339).**
* **The pack is green on main's head on GitHub,** with an independent re-run.
* **Gate A by screens** starts where a new firm starts and ends at R1.27's first step.
* **The fresh Opus reader** gives Works, about 85%.
* **QA-617 is closed.** QA-618 (Minor) is new; it does not hold Works.

## The runs (main ca3b24fad)
| Run | Where | Result |
|---|---|---|
| Pack: walks.yml `j_26` | GitHub, [run 44837061226](https://github.com/expat-ready/xpatready/actions/runs/44837061226), job 136636271818, artifact 14678453213 | **18 PASS, 0 FAIL** (`2026-11-21-r126-qa12d/walk_j26_job136636271818.txt`) |
| Independent re-run: walks.yml `j_26` | GitHub, [run 44837165973](https://github.com/expat-ready/xpatready/actions/runs/44837165973), job 136636623448, artifact 14678832470 | **18 PASS, 0 FAIL** (`walk_j26_job136636623448.txt`) |
| fo4b embed pack on ce8e05b1d | `2026-11-20-r126-qa12/fo4b_{1,2}.txt` | 45/45 twice. It carries the too-fast send and the rate limit; `sales/public.ts` is unchanged from ce8e05b1d to ca3b24fad |

Both walks were dispatched by the Lead. The reader checked qa's saved lines against the job logs: they match.

## Each Done-when clause
* **A visitor's enquiry becomes a lead:** one WEB_FORM lead each from
  * j_26 W2, the embed from a campaign link, with spring, google, cpc and the click id on its attribution;
  * j_26 W4, the hosted form.
* **A bot refused without saying why:**
  * the hidden field: j_26 W3;
  * a too-fast send and the rate limit: the fo4b pack.
* **The same send twice makes one lead:** j_26 W3.
* **Each field's message on the field:** j_26 W4, by screens.

## Gate A
* **The start:**
  * the setup runs the seed's own functions, and the form is off with no consent wording;
  * W1: while off, the page says so, and the public read and send answer 404;
  * the Owner switches it on by screens. That links the firm's newest EMAIL MARKETING wording and writes one audit line naming the link (`j_26.ts:102`).
* **SQL left in the setup:** one write, at `j_26.ts:60`.
  * `enabled = false` and `allowed_sites = '{}'` change nothing: the seed and the schema already give those values.
  * `thank_you_text` is outside R1.26 by the tech lead's ruling.
  * The wording link by SQL is gone. `:56` only reads the firm's wording, to compare against.
* **The end:** W5 shows both leads on Leads › Unassigned, which is R1.27's first step. It opens that page by its address, as the earlier verdicts accepted.

## #2649 (the reader read the code)
* **The wording:** the right one, from the same firm, EMAIL MARKETING, by the same rule as the booking page. The newest is picked by `publishedAt`, then `version`.
* **The write:** inside the switch's transaction, with the row locked and its version checked. Of two switch-ons at once, one wins and the other gets 409 STALE.
* **The audit line:** one, with before and after holding the on/off state and the wording link.
* **By design:** a form keeps its first wording when a newer wording is published.
* **Open review Minors:** m1, the refusal names no fix; m2, the refusal is tested on a stand-in database only. Both are folded into QA-618.

## Findings
* **QA-617: closed** (`qa/BUGS-CLOSED.md`).
* **QA-618, new** · Bug · Minor · runtime (FO-4w).
  * **What happens:** a firm left with no consent wording cannot switch its form on, and is told only "…no screen sets one yet".
  * **How it can happen:** only on a failure path. The seed's wording transaction can fail after the firm is marked seeded, and the seed never retries it. Or a firm was seeded before FO-2 part 3b and has not opened its booking page yet; the booking page creates the wording on first view, but the switch does not.
  * **Fix:** `saveEnabled` calls `ensureBookingWording`, plus a test of the real refusal path.
  * **Why it does not hold Works:** every new firm gets its wording at seed, so the main path is unaffected.
* **No other open BUGS.md row names R1.26.** QA-501 and QA-606 belong to R1.27.

## Not tested
* Coverage (c8).
* 200% zoom.
* The shared demo (:4400): this cloud copy has none.
* No local re-run this round: the two GitHub walks on main's head are the proof (P-339).

## Questions for the tech lead
1. **Please read and label.** R1.26 moves to Works on runs 44837061226 and 44837165973.
2. **QA-618's number** is self-assigned. QA-608 to QA-616 are on main or in open PRs.
