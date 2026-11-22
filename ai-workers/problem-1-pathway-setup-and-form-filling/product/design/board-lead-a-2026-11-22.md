# Lead A board: the cycle 07:00 22 Nov → 07:00 23 Nov (founder: nothing below 12; target 15)

Kept by Lead 1; one line per capability; updated at each check that changes it. "Proven" = qa's journey exits 0 on main's head and the row is Works on the qa board.

| # | Capability | Left to build | Lane / PR | Waits on | Walk | Risk |
|---|---|---|---|---|---|---|
| 1 | R1.89 public pricing page | QA-741 prices from the plan table, QA-742 | #2926 building | none | j_89 exists (#2912) | low |
| 2 | R1.39 staff calendar | QA-743 time off on the calendar | lane started 11:0x | none | j_39 exists (#2914) | low |
| 3 | R1.88 firm reads its audit log | AUD-4s page | #2916 building | none | j_88 to write | medium |
| 4 | R1.10 checking every input | p6 merged 11:01 (#2883); p3a #2909, p4 #2908 in review; then p3b, p5 | 2 lanes | shared allow-list between the parts | j_10 to write | medium |
| 5 | R1.102 find a person or case | #2884 in the queue; CS-S1 p2 #2913; PF-30s #2921 | 3 lanes | #2884 merging | j_102 to write | medium |
| 6 | R1.23 firm branding | panel #2910 approved, CI running; the client-pages part not named yet | 1 lane | the lane names the client-pages part | j_23 to write | medium |
| 7 | R1.104 consultation agreement | FO-3c #2922 building | 1 lane | SigningPort on main (lane checks) | j_104 to write | medium |
| 8 | R1.13 logs and alarms | none (proof only) | AWS session | AWS deploy; #2911 queued; on-call address | AWS evidence | medium |
| 9 | R1.15 secrets in a managed store | none (proof only) | AWS session | AWS deploy | AWS evidence | medium |
| 10 | R1.5 staff sign-in, two-step | PF-4s part 1 (started 10:55) | 1 lane | Lead read (schema, permissions); AWS proof | AWS evidence | high |
| 11 | R1.90 sign-up and trial | trial banner (lane started 11:1x); invited sign-up routes + screen | 1 lane + 2 parts | PF-4s part 1 for the invited sign-up | j_90 exists (#2917) | high |
| 12 | R1.24 firm web address | #2885 (left the queue, shard 7 red: lane told); PF-25w | 1 lane + 1 part | PF-4s; `lab` NS records; AWS | j_24 to write | high |
| 13 | R1.21 our invoices with tax | tax amount on the invoice | none yet | **founder: Stripe test key, or re-word the done-when** | j_21 exists (#2918) | high |
| 14 | R1.92 firm profile, offices | PF-18s p2 #2906, p3 #2904 (queued); firm-profile API not built, no row | 2 lanes | shaping of the firm-profile API | none | not today |
| 15 | R1.20 seat limits | PF-4c1b → PF-4c p2 → invite screen (serial) | none | a lane | none | not today |

**To reach 12:** rows 1-10 all proven plus two of 11-13. That needs: the AWS proof working today (rows 8-10, 12); qa walking each row the hour its last part merges (two qa lanes; journeys for rows 3-7 written before the builds finish); every label only on a green head (row 12 lost 34 minutes to a red label).
