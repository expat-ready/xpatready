# FO-5f2 walk (builder, P-352), 15 Nov IST, head 7573418504

There is no retainer screen in the web app yet (the template routes are API only), so the person's journey was walked over HTTP: the same calls a screen will make.
* **Copy:** isolated copy `fo5f2_walk` on :4471 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), its own database, started and stopped in the same command.
* **Actor:** user-R, the Owner of the Sample firm.
* **Script:** session scratchpad `walk/walk.mjs`, not kept. Exit 0.

```
1 sign in as user-R (Owner): {"staffId":true,"firm":"sample-firm"}
2 page read: the template list: {"status":200,"ms":23}
3 upload the Word file (header, footer, image): {"status":201,"ms":492,"placeholders":["client.name","fees","fees.amount","fees.label","firm.name"]}
4 upload the LibreOffice file: {"status":201,"ms":55,"placeholders":["client.name","fees","fees.amount","fees.label","firm.name"]}
5 upload a header named word/h.rels with {client.passport}: {"status":422,"ms":13,"code":"PARTS_NOT_ALLOWED","detail":"This Word file has parts a template cannot have."}
6 upload a 107 KB file whose body is 1.3 M runs, with page reads alongside: {"status":422,"ms":3734,"code":"TOO_COMPLEX","detail":"This Word file is too complex to use as a template.","reads":31,"notOk":0,"slowestReadMs":335}
7 upload the Word file again after the worker died: {"status":201,"ms":328,"placeholders":["client.name","fees","fees.amount","fees.label","firm.name"]}
8 download the starter (rendered by the worker): {"status":200,"type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","bytes":1418}
9 page read at the end: {"status":200,"ms":7}
```

**What it shows:**
* The worker starts inside the real API process (run by tsx). Both real files (Word and LibreOffice) are accepted with their placeholders, and the `.rels`-named header is refused before any parse.
* The memory-exhaust file:
  * kills only the worker (422 TOO_COMPLEX in 3.7 s);
  * the 31 page reads made during that time all answered 200, the slowest in 335 ms;
  * the next upload and the starter download work on a new worker.
