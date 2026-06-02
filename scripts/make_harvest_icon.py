#!/usr/bin/env python3
# Generate a macOS app-icon PDF for Harvest: white rounded tile + the wheat mark
# (frontend/src/components/ui/Logo.jsx) in the brand color --acid (#2f5233).
# No third-party deps — hand-written PDF, rasterized later by `sips`.

import re

N = 1024.0          # canvas (points == pixels at 72dpi)
C = N / 2.0         # center
MARGIN = 64.0
RADIUS = 200.0
S = 44.0            # px per svg unit
STROKE = 60.0       # wheat stroke width in px
# brand --acid #2f5233
R, G, B = 0x2f / 255.0, 0x52 / 255.0, 0x33 / 255.0

# ── wheat paths from HarvestMark (viewBox 0 0 18 18) ─────────────────────────
PATHS = [
    "M9 2 L9 16",
    "M9 5 Q6 5 5 3.5 Q6 2 9 2.5",
    "M9 5 Q12 5 13 3.5 Q12 2 9 2.5",
    "M9 8 Q6 8 5 6.5 Q6 5 9 5.5",
    "M9 8 Q12 8 13 6.5 Q12 5 9 5.5",
    "M9 11 Q6 11 5 9.5 Q6 8 9 8.5",
    "M9 11 Q12 11 13 9.5 Q12 8 9 8.5",
]


def tx(sx, sy):
    """svg(0..18, y-down) -> pdf(points, y-up), mark centered on canvas center."""
    return (C + (sx - 9.0) * S, C - (sy - 9.0) * S)


def f(v):
    return ("%.3f" % v).rstrip("0").rstrip(".")


def emit_path(spec):
    # SVG compact form glues the command to its first number ("M9 2"); split them.
    toks = re.findall(r"[MLQ]|-?\d*\.?\d+", spec)
    ops, i, cur = [], 0, (0.0, 0.0)
    while i < len(toks):
        c = toks[i]; i += 1
        if c == "M":
            px, py = tx(float(toks[i]), float(toks[i + 1])); i += 2
            cur = (px, py); ops.append("%s %s m" % (f(px), f(py)))
        elif c == "L":
            px, py = tx(float(toks[i]), float(toks[i + 1])); i += 2
            cur = (px, py); ops.append("%s %s l" % (f(px), f(py)))
        elif c == "Q":
            cx, cy = tx(float(toks[i]), float(toks[i + 1]))
            ex, ey = tx(float(toks[i + 2]), float(toks[i + 3])); i += 4
            x0, y0 = cur
            c1x, c1y = x0 + 2.0 / 3.0 * (cx - x0), y0 + 2.0 / 3.0 * (cy - y0)
            c2x, c2y = ex + 2.0 / 3.0 * (cx - ex), ey + 2.0 / 3.0 * (cy - ey)
            ops.append("%s %s %s %s %s %s c" % (f(c1x), f(c1y), f(c2x), f(c2y), f(ex), f(ey)))
            cur = (ex, ey)
    return "\n".join(ops)


def rounded_rect(x0, y0, x1, y1, r):
    k = 0.5523
    o = []
    o.append("%s %s m" % (f(x0 + r), f(y0)))
    o.append("%s %s l" % (f(x1 - r), f(y0)))
    o.append("%s %s %s %s %s %s c" % (f(x1 - r + r * k), f(y0), f(x1), f(y0 + r - r * k), f(x1), f(y0 + r)))
    o.append("%s %s l" % (f(x1), f(y1 - r)))
    o.append("%s %s %s %s %s %s c" % (f(x1), f(y1 - r + r * k), f(x1 - r + r * k), f(y1), f(x1 - r), f(y1)))
    o.append("%s %s l" % (f(x0 + r), f(y1)))
    o.append("%s %s %s %s %s %s c" % (f(x0 + r - r * k), f(y1), f(x0), f(y1 - r + r * k), f(x0), f(y1 - r)))
    o.append("%s %s l" % (f(x0), f(y0 + r)))
    o.append("%s %s %s %s %s %s c" % (f(x0), f(y0 + r - r * k), f(x0 + r - r * k), f(y0), f(x0 + r), f(y0)))
    o.append("h")
    return "\n".join(o)


# ── build content stream ─────────────────────────────────────────────────────
content = []
# white rounded tile
content.append("1 1 1 rg")
content.append(rounded_rect(MARGIN, MARGIN, N - MARGIN, N - MARGIN, RADIUS))
content.append("f")
# wheat strokes
content.append("%s %s %s RG" % (f(R), f(G), f(B)))
content.append("%s w" % f(STROKE))
content.append("1 J")  # round cap
content.append("1 j")  # round join
for p in PATHS:
    content.append(emit_path(p))
    content.append("S")
stream = ("\n".join(content) + "\n").encode("latin-1")

# ── assemble PDF with a correct xref ─────────────────────────────────────────
objs = []
objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
objs.append(("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] /Contents 4 0 R /Resources << >> >>" % (int(N), int(N))).encode())
objs.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"endstream")

out = bytearray()
out += b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
offsets = []
for idx, body in enumerate(objs, start=1):
    offsets.append(len(out))
    out += ("%d 0 obj\n" % idx).encode() + body + b"\nendobj\n"
xref_pos = len(out)
out += b"xref\n"
out += ("0 %d\n" % (len(objs) + 1)).encode()
out += b"0000000000 65535 f \n"
for off in offsets:
    out += ("%010d 00000 n \n" % off).encode()
out += b"trailer\n"
out += ("<< /Size %d /Root 1 0 R >>\n" % (len(objs) + 1)).encode()
out += b"startxref\n" + str(xref_pos).encode() + b"\n%%EOF\n"

with open("/tmp/harvest_icon.pdf", "wb") as fh:
    fh.write(out)
print("wrote /tmp/harvest_icon.pdf (%d bytes)" % len(out))
