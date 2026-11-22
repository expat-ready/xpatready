# qa capability R1.89 (public pricing page), 22 Nov 2026

Run: `/qa capability R1.89` · main 01841047d · isolated copy :4470 (`qa89`, `PLATFORM_IDENTITY=local`), stopped · live AI off · US$0 · no Stripe call · no priced button (Start free trial only opened Sign up; nothing submitted).

## Verdict: Partial (was Not built). Not Works: the prices clause fails (QA-741, Major)

Parts: PF-5s part 1 (#2608, fa72345c7) is on main. The page exists and most of the row holds; no price can reach it on any running copy.

## Journeys (persona: a firm's owner with no account)
1. Main: open Pricing, read the plans, choose Yearly, Start free trial on a plan → Sign up carries the plan and period.
2. Plan change: our staff change a plan's name and trial days and switch a plan off → the page shows it on reload.
3. Prices: each plan shows its monthly and yearly price.
4. Keyboard only, 400 / 1024 / 1440 px, axe.
5. Error: the plans cannot be loaded → plain words, Sign in still offered.
6. Break: very long and non-English plan name, 0 trial days, unknown plan by URL, Back from Sign up.

## What held (`tests/journeys/j_89.ts`, twice, 12/14 both runs, exit 1)
* W1 the active plans exactly as stored in `platform_plan`, fewest seats first: name, seats, trial days. Shown in 222-364 ms.
* W2 a table change (Team renamed, trial 14 → 21, Firm switched off) shows after a reload, no restart; the judge fails before the change.
* W3 no digit on a card that is not that plan's stored seats or trial days.
* W4 keyboard only: Tab, Right arrow (Yearly), Tab, Enter → `/sign-up?plan=solo&period=YEARLY`, plan line "Solo (Sample), yearly" (R1.90's first step).
* W5 400, 1024, 1440 px: no sideways scroll, axe WCAG 2.2 A/AA clean. No page error.
* By hand: a 96-character name with French and Chinese wraps at 400 px with no sideways scroll; the server unreachable → "Plans could not be loaded. Could not reach the server. Check your connection and try again."; an unknown plan in the Sign up address falls back to the default plan.

## What failed
* **QA-741 (Gap, Major): no price is ever shown.** W6: every card reads "Price not shown" under "Prices unavailable". W6b: `monthly_price_cents = 4900` on the plan table changes nothing. Causes and files in the BUGS row.
* W7 (stand-in, said): with prices added to the answer in the browser the page shows "$49 per month, CAD", "+ applicable taxes", Yearly "$490 per year, CAD". So the page's half is built; the server's half has no source on a keyless copy.
* **QA-742 (Bug, Minor):** a 0-day plan reads "0-day free trial · no card needed"; Back from Sign up loses Yearly.
* Note (no row): the lead line says "Plan names and prices are Sample" while no price is shown.

## Journey score: 7 / 10 (pass is 8 with no 0)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | plans and trial read, sign-up reached; the price, the page's purpose, never shown (W6) |
| Next step obvious | 1 | one filled button, Sign in link |
| Plain words | 1 | all states in plain words |
| Feedback and state | ½ | "We could not read the prices just now" is said when nothing was tried (no price is set) |
| Correct data | ½ | stored values exact (W1-W3); prices absent (W6, W6b) |
| Error recovery | 1 | load failure and unknown plan handled |
| Accessibility and sizes | 1 | W4, W5 |
| Speed | 1 | 222-364 ms |
| Visual quality | 1 | screenshots `screens/J-89/screenshots/` |
| Trust and sources | ½ | Sample marked; claims prices are Sample with none shown |

Fixes, most valuable first: (1) a price source a keyless copy can show, labelled Sample, and a browser check that reads it (QA-741); (2) the 0-day wording (QA-742).

## Could not test
The shared demo :4400 (cloud session); Stripe test mode (no key in a lane, by rule); GitHub's runners (no Works claim, so no P-339 run); a real screen reader; D17/D20.

## Questions for the tech lead
1. R1.89's "prices … read from the plan table": concept BR-1 reads Stripe's prices through the plan's price ids. Which source should a keyless copy show: Sample prices in the local billing stand-in, or the table's own `monthly_price_cents`/`yearly_price_cents`? (qa scored the row's words: a price must show.)

## Suggestions
* Seed Sample prices for the three seeded plans in the local stand-in. *Needed for the proof · Capability.*
