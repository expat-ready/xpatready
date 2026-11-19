"""CS-D1t (R1.67): does this PDF open, whole? The case upload doors ask before they store a PDF (api/src/case-checklist.ts
`pdfOpens`). Reads the file's bytes on stdin (nothing is written to disk before the answer) and prints one JSON line:
  {"ok": true, "pages": n}        it ends as a PDF ends, its structure reads and every page is there;
  {"ok": false, "locked": true}   it needs a password to open, so its pages cannot be read (break M1: such a file is
                                  never taken on trust; a file protected only against editing opens with no password);
  {"ok": false, "error": "..."}   cut short or otherwise unreadable.
Two checks, because the reader alone forgives too much (break M1: it rebuilt 21 of 22 official forms cut 10 bytes short):
(1) the end-of-file marker is in the last 1024 bytes, where a PDF reader looks for it (ISO 32000-1, 7.5.5; a file cut
short, or one with an update cut part-way, has none there); (2) pypdf reads the cross-reference table, the trailer and
the page tree, and every page object is a page. The file is opened as data only: nothing in it is run, no page is
rendered and no text is extracted. Address space is capped (1 GB) so a hostile file cannot take the machine's memory;
the caller sets the time limit and how many of these run at once.
  .tools/solution-1-prototype/.venv/bin/python -I studio/tools/check_pdf_opens.py < file.pdf
"""
import io
import json
import logging
import sys

logging.disable(logging.CRITICAL)
try:
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (1 << 30, 1 << 30))
except Exception:  # no such limit on this platform: the caller's time limit still holds
    pass
from pypdf import PdfReader  # noqa: E402


def main():
    try:
        data = sys.stdin.buffer.read()
        if b"%%EOF" not in data[-1024:]:
            return {"ok": False, "error": "no end-of-file marker in the last 1024 bytes"}
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            try:
                opened = reader.decrypt("")
            except Exception:
                opened = 0
            if not opened:
                return {"ok": False, "locked": True}
        pages = len(reader.pages)
        if pages <= 0:
            return {"ok": False, "error": "no pages"}
        for page in reader.pages:
            if page.get("/Type") != "/Page":
                return {"ok": False, "error": "a page of the page tree is missing"}
        return {"ok": True, "pages": pages}
    except BaseException as e:  # any failure to read it, a memory limit included, is "does not open"
        return {"ok": False, "error": f"{type(e).__name__}: {str(e)[:160]}"}


print(json.dumps(main()))
