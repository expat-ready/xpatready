# Evidence lines (qa capability case side, 16 Nov 2026, main e593acccc, qa cloud container, isolated copies)

Result lines only, quoted word for word from the run output (AGENTS rule 1: raw logs are not committed).

## qa383-api
```
== api run 1
PASS  QA-383 setup: the configured checkpoint loads (Demo › Load the configured checkpoint) — {"status":201}
PASS  QA-383 setup: With an LMIA (wp.lmia_inside) is on the checkpoint
PASS  QA-383 setup: a With an LMIA case opens — {"status":201}
PASS  QA-383 fail (C6.19): the question is on the case's questionnaire (client's, else the firm's) — {"status":200}
PASS  QA-383 fail (C6.19): no choice is labelled with the map note's lead-in "only option:" — {"offered":"[[{\"key\":\"Canada\",\"label\":\"Canada\"}]]"}
PASS  BK-383 DW1: the one choice offered reads "Canada" — {"offered":"[[{\"key\":\"Canada\",\"label\":\"Canada\"}]]"}
PASS  BK-383 DW5 setup: the answer is stored as before the fix, "only option: Canada" — {"status":200,"stored":"only option: Canada"}
PASS  BK-383 DW5: the saved "only option: Canada" reads as "Canada", with no problem on it — {"id":"58a79df6-552d-494c-b4d0-9a330f3efa12","value":"Canada","status":"DECLARED","channel":"questionnaire","by":"user-P","at":"2026-11-15T18:58:02.088Z","answered":null,"problems":[],"confirmed":true,"why":"Declared: the client's own answer; it fills the form
PASS  BK-383 DW5 (IMM 5710): its copy writes the form's code 511 — {"written":"511"}
PASS  BK-383 DW5 (IMM 5409): its copy writes "Canada" in the Country box, never the lead-in — {"written":"Canada"}
PASS  BK-383 DW5 fail: a free-text answer that starts "Only choice:" reads back word for word (saved and on the questionnaire) — {"status":200,"saved":"Only choice: I stayed with my sister","read":["Only choice: I stayed with my sister"]}
PASS  QA-383 fail (C6.19) = BK-383 DW4: the answer "Canada" is saved with no problem on it — {"status":200,"problems":[]}
PASS  BK-383 DW2: IMM 5710's copy writes the form's code 511 for "Canada" — {"written":"511"}
PASS  BK-383 DW3: IMM 5409's copy writes "Canada" in the Country box — {"written":"Canada"}
PASS  BK-383 DW6: an "e.g." note gives no option list (noteList, pdfOptions) — {"options":[]}
PASS  BK-383 DW6: the fill writes no example's code into a box that prints no list (by hand, saying the note gives examples only) — {"ok":false,"hand":true,"reason":"the map's note gives examples only (no list), and the box prints no list of its own","steps":["code_list:imm1344.country (e.g. Canada=511, United States of America=461)"]}
PASS  BK-383 DW1 (pure): "only option: Canada=511" lists the one choice "Canada" and the fill writes 511 for it
17/17 passed
== api run 2
PASS  QA-383 setup: With an LMIA (wp.lmia_inside) is on the checkpoint
PASS  QA-383 setup: a With an LMIA case opens — {"status":201}
PASS  QA-383 fail (C6.19): the question is on the case's questionnaire (client's, else the firm's) — {"status":200}
PASS  QA-383 fail (C6.19): no choice is labelled with the map note's lead-in "only option:" — {"offered":"[[{\"key\":\"Canada\",\"label\":\"Canada\"}]]"}
PASS  BK-383 DW1: the one choice offered reads "Canada" — {"offered":"[[{\"key\":\"Canada\",\"label\":\"Canada\"}]]"}
PASS  BK-383 DW5 setup: the answer is stored as before the fix, "only option: Canada" — {"status":200,"stored":"only option: Canada"}
PASS  BK-383 DW5: the saved "only option: Canada" reads as "Canada", with no problem on it — {"id":"e43325e2-089b-40f7-9408-4c47a20523c2","value":"Canada","status":"DECLARED","channel":"questionnaire","by":"user-P","at":"2026-11-15T18:58:06.138Z","answered":null,"problems":[],"confirmed":true,"why":"Declared: the client's own answer; it fills the form
PASS  BK-383 DW5 (IMM 5710): its copy writes the form's code 511 — {"written":"511"}
PASS  BK-383 DW5 (IMM 5409): its copy writes "Canada" in the Country box, never the lead-in — {"written":"Canada"}
PASS  BK-383 DW5 fail: a free-text answer that starts "Only choice:" reads back word for word (saved and on the questionnaire) — {"status":200,"saved":"Only choice: I stayed with my sister","read":["Only choice: I stayed with my sister"]}
PASS  QA-383 fail (C6.19) = BK-383 DW4: the answer "Canada" is saved with no problem on it — {"status":200,"problems":[]}
PASS  BK-383 DW2: IMM 5710's copy writes the form's code 511 for "Canada" — {"written":"511"}
PASS  BK-383 DW3: IMM 5409's copy writes "Canada" in the Country box — {"written":"Canada"}
PASS  BK-383 DW6: an "e.g." note gives no option list (noteList, pdfOptions) — {"options":[]}
PASS  BK-383 DW6: the fill writes no example's code into a box that prints no list (by hand, saying the note gives examples only) — {"ok":false,"hand":true,"reason":"the map's note gives examples only (no list), and the box prints no list of its own","steps":["code_list:imm1344.country (e.g. Canada=511, United States of America=461)"]}
PASS  BK-383 DW1 (pure): "only option: Canada=511" lists the one choice "Canada" and the fill writes 511 for it
16/16 passed
```

## qa383-screen
```
== screen run 1
PASS QA-383s setup: With an LMIA is on the configured checkpoint
PASS QA-383s setup: a case opens — {"status":201}
PASS QA-383s: the client reaches the question by screens
PASS QA-383s: the question's answer box is found (a list or choices), so the next step asserts something
PASS QA-383s fail (C6.19): no choice on screen reads "only option:" — {"text":"Country or territory where the person currently resides Choose… Canada Choose… | Canada"}
PASS BK-383s DW1: the one choice on screen reads "Canada" — {"shown":["Canada"]}
PASS BK-383s DW4: picking it saves "Canada", with no problem shown — {"saved":"Canada","problem":null}
PASS BK-383s DW2: IMM 5710's copy writes the form's code 511 — {"written":"511"}
PASS BK-383s DW3: IMM 5409's copy writes "Canada" in the Country box — {"written":"Canada"}
== screen run 2
PASS QA-383s setup: With an LMIA is on the configured checkpoint
PASS QA-383s setup: a case opens — {"status":201}
PASS QA-383s: the client reaches the question by screens
PASS QA-383s: the question's answer box is found (a list or choices), so the next step asserts something
PASS QA-383s fail (C6.19): no choice on screen reads "only option:" — {"text":"Country or territory where the person currently resides Choose… Canada Choose… | Canada"}
PASS BK-383s DW1: the one choice on screen reads "Canada" — {"shown":["Canada"]}
PASS BK-383s DW4: picking it saves "Canada", with no problem shown — {"saved":"Canada","problem":null}
PASS BK-383s DW2: IMM 5710's copy writes the form's code 511 — {"written":"511"}
PASS BK-383s DW3: IMM 5409's copy writes "Canada" in the Country box — {"written":"Canada"}
```

## gateb-c71-c78
```
Gate B: the PR names C7.1, C7.8; claims Works for none (no bug check).
    C7.1-application-type.test.ts on the checkpoint: exit 0, 12/12 passed (494 s: copy 8, Load the configured checkpoint 157, run 329)
    C7.8.test.ts on the checkpoint: exit 0, 20/20 passed (367 s: copy 7, Load the configured checkpoint 157, run 203)
Gate B: passed.
gate exit 0
```

## gateb-c619
```
Gate B: the PR names C6.19; claims Works for none (no bug check).
    C6.19.test.ts on the checkpoint: exit 0, 89/89 passed (161 s: copy 7, Load the configured checkpoint 147, run 7)
Gate B: passed.
gate exit 0
```
