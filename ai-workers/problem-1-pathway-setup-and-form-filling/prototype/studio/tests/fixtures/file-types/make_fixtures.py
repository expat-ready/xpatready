"""PF-F4 fixtures: one real, small sample of each allowed upload type, plus the refusal cases that need real files.
Re-run by hand only (the files are committed): python3 -I studio/tests/fixtures/file-types/make_fixtures.py
Needs Pillow (JPEG, PNG, TIFF) and ffmpeg with libx265 (the HEIC's HEVC frame); the HEIC container and the Word and Excel
files are written here with the standard library. No PDF is committed (push guard, P-82): the test builds
its plain PDF in code and reads a committed IRCC form for the scripts flag. Every value is Sample test data."""
import io, os, struct, subprocess, sys, tempfile, zipfile, zlib
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
out = lambda name, data: open(os.path.join(HERE, name), "wb").write(data)

def pil(fmt, **kw):
    b = io.BytesIO(); Image.new("RGB", (32, 24), (200, 60, 40)).save(b, fmt, **kw); return b.getvalue()

out("sample.jpg", pil("JPEG", quality=80))
out("sample.png", pil("PNG"))
out("sample.tiff", pil("TIFF"))  # little-endian: II*\0

# A PNG whose header declares 20000 x 20000 (400 megapixels, over 89.5): a real signature and IHDR with a right CRC.
def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
ihdr = struct.pack(">IIBBBBB", 20000, 20000, 8, 2, 0, 0, 0)
out("bomb.png", b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"\0" * 64)) + chunk(b"IEND", b""))

# HEIC: ISO-BMFF (ftyp heic, meta with one hvc1 item, mdat) around a one-frame HEVC stream from ffmpeg.
def box(t, d): return struct.pack(">I", 8 + len(d)) + t + d
def full(t, v, f, d): return box(t, struct.pack(">I", (v << 24) | f) + d)
with tempfile.TemporaryDirectory() as tmp:
    hevc = os.path.join(tmp, "f.hevc")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1",
                    "-c:v", "libx265", "-x265-params", "log-level=error", "-pix_fmt", "yuv420p", "-f", "hevc", hevc], check=True)
    raw = open(hevc, "rb").read()
nals = [n.lstrip(b"\0") for n in raw.split(b"\x00\x00\x01") if n.strip(b"\0")]
nals = [n[:-1] if n.endswith(b"\0") else n for n in nals]
kind = lambda n: (n[0] >> 1) & 0x3f
vps, sps, pps = (next(n for n in nals if kind(n) == k) for k in (32, 33, 34))
slices = [n for n in nals if kind(n) < 32]
rbsp = sps.replace(b"\x00\x00\x03", b"\x00\x00")
ptl = rbsp[3:15]  # profile_tier_level: space/tier/idc (1), compatibility (4), constraints (6), level (1)
hvcc = bytes([1]) + ptl + bytes([0xF0, 0x00, 0xFC, 0xFD, 0xF8, 0xF8, 0, 0, 0x0F, 3])
for t, n in ((32, vps), (33, sps), (34, pps)): hvcc += bytes([0x80 | t]) + struct.pack(">HH", 1, len(n)) + n
data = b"".join(struct.pack(">I", len(n)) + n for n in slices)
ftyp = box(b"ftyp", b"heic" + struct.pack(">I", 0) + b"mif1heic")
def meta(offset):
    hdlr = full(b"hdlr", 0, 0, struct.pack(">I", 0) + b"pict" + b"\0" * 12 + b"\0")
    pitm = full(b"pitm", 0, 0, struct.pack(">H", 1))
    iloc = full(b"iloc", 0, 0, bytes([0x44, 0x00]) + struct.pack(">HHHHII", 1, 1, 0, 1, offset, len(data)))
    iinf = full(b"iinf", 0, 0, struct.pack(">H", 1) + full(b"infe", 2, 0, struct.pack(">HH", 1, 0) + b"hvc1" + b"\0"))
    ipco = box(b"ipco", box(b"hvcC", hvcc) + full(b"ispe", 0, 0, struct.pack(">II", 64, 64)))
    ipma = full(b"ipma", 0, 0, struct.pack(">IHB", 1, 1, 2) + bytes([0x81, 0x02]))
    return full(b"meta", 0, 0, hdlr + pitm + iloc + iinf + box(b"iprp", ipco + ipma))
m = meta(0); m = meta(len(ftyp) + len(m) + 8)
out("sample.heic", ftyp + m + box(b"mdat", data))

# Word, Excel and their macro twins: the smallest parts an office program opens, written by zipfile.
CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/{part}" ContentType="{ct}"/></Types>'
RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="{part}"/></Relationships>'
DOC = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Sample</w:t></w:r></w:p></w:body></w:document>'
WB = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sample" sheetId="1" r:id="rId1"/></sheets></workbook>'
def ooxml(part, ct, body, macro=False):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT.format(part=part, ct=ct)); z.writestr("_rels/.rels", RELS.format(part=part)); z.writestr(part, body)
        if macro: z.writestr(part.split("/")[0] + "/vbaProject.bin", b"\xd0\xcf\x11\xe0Sample macro project")
    return b.getvalue()
W = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
X = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
out("sample.docx", ooxml("word/document.xml", W, DOC))
out("sample.xlsx", ooxml("xl/workbook.xml", X, WB))
out("macro.docm", ooxml("word/document.xml", "application/vnd.ms-word.document.macroEnabled.main+xml", DOC, macro=True))
out("macro.xlsm", ooxml("xl/workbook.xml", "application/vnd.ms-excel.sheet.macroEnabled.main+xml", WB, macro=True))
# No plain ZIP here: the root .gitignore keeps *.zip out of git, so the test builds its ZIPs in code.
print("written to", HERE)
