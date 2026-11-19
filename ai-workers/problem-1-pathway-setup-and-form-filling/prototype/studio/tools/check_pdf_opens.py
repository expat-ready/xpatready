"""CS-D1t (R1.67): does this PDF open? The case upload doors ask before they store a PDF (api/src/case-checklist.ts
`pdfOpens`). Reads the file's bytes on stdin (nothing is written to disk before the answer) and prints one JSON line:
{"ok": true, "pages": n} when the structure reads (cross-reference table, trailer, page tree) and it has a page;
{"ok": true, "encrypted": true} for a password-protected file, whose structure read but whose pages cannot be counted
without the password (it is not damaged, so it is not refused here); {"ok": false, "error": "..."} for a file cut
short or otherwise unreadable. The file is opened as data only: nothing in it is run, no page is rendered and no text
is extracted. Address space is capped (1 GB) so a hostile file cannot take the machine's memory; the caller sets the
time limit.
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
        reader = PdfReader(io.BytesIO(sys.stdin.buffer.read()), strict=False)
        if reader.is_encrypted:
            return {"ok": True, "encrypted": True}
        pages = len(reader.pages)
        return {"ok": True, "pages": pages} if pages > 0 else {"ok": False, "error": "no pages"}
    except BaseException as e:  # any failure to read it, a memory limit included, is "does not open"
        return {"ok": False, "error": f"{type(e).__name__}: {str(e)[:160]}"}


print(json.dumps(main()))
