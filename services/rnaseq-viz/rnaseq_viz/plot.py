"""Scatter plots for PCA scores. SVG keeps Unicode group names; PNG/PDF labels are ASCII."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

WIDTH = 960
HEIGHT = 640
PALETTE = [
    (15, 118, 110),
    (180, 83, 9),
    (30, 64, 175),
    (157, 23, 77),
    (22, 101, 52),
    (124, 45, 18),
    (67, 56, 202),
    (3, 105, 161),
]

# 5x7 glyphs, public-domain-style block letters written for this file.
_FONT = {
    " ": ["00000"] * 7,
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    "%": ["11001", "11010", "00100", "01000", "10110", "10011", "00000"],
    "(": ["00110", "01100", "11000", "11000", "11000", "01100", "00110"],
    ")": ["01100", "00110", "00011", "00011", "00011", "00110", "01100"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
    ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
}


def _bounds(scores: list[dict]) -> tuple[float, float, float, float]:
    xs = [row["PC1"] for row in scores]
    ys = [row["PC2"] for row in scores]
    xmin, xmax = min(xs), max(xs)
    ymin, ymax = min(ys), max(ys)
    if math.isclose(xmin, xmax):
        xmin -= 1
        xmax += 1
    if math.isclose(ymin, ymax):
        ymin -= 1
        ymax += 1
    pad_x = (xmax - xmin) * 0.12
    pad_y = (ymax - ymin) * 0.12
    return xmin - pad_x, xmax + pad_x, ymin - pad_y, ymax + pad_y


def _groups(scores: list[dict]) -> list[str]:
    seen: list[str] = []
    for row in scores:
        if row["group"] not in seen:
            seen.append(row["group"])
    return seen


def _xml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _ascii_label(text: str) -> str:
    out = []
    for ch in text:
        upper = ch.upper()
        if upper in _FONT:
            out.append(upper)
        elif ch == " ":
            out.append(" ")
    return "".join(out).strip()


def write_svg(path: Path, scores: list[dict], fractions: list[float]) -> None:
    xmin, xmax, ymin, ymax = _bounds(scores)
    left, top, plot_w, plot_h = 72, 48, 640, 520
    groups = _groups(scores)
    colors = {group: PALETTE[i % len(PALETTE)] for i, group in enumerate(groups)}

    def xy(x: float, y: float) -> tuple[float, float]:
        px = left + (x - xmin) / (xmax - xmin) * plot_w
        py = top + (1 - (y - ymin) / (ymax - ymin)) * plot_h
        return px, py

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        '<rect x="72" y="48" width="640" height="520" fill="none" stroke="#cbd5e1"/>',
        '<text x="72" y="32" font-family="sans-serif" font-size="18" fill="#0f172a">PCA</text>',
        (
            f'<text x="72" y="600" font-family="sans-serif" font-size="14" fill="#334155">'
            f'PC1 ({fractions[0] * 100:.1f}%)</text>'
        ),
        (
            f'<text x="80" y="66" font-family="sans-serif" font-size="13" fill="#334155">'
            f'PC2 ({fractions[1] * 100:.1f}%)</text>'
        ),
    ]
    for row in scores:
        px, py = xy(row["PC1"], row["PC2"])
        r, g, b = colors[row["group"]]
        parts.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="6" fill="rgb({r},{g},{b})"/>')
        if len(scores) <= 30:
            parts.append(
                f'<text x="{px + 8:.1f}" y="{py - 8:.1f}" font-family="sans-serif" font-size="12" fill="#0f172a">'
                f'{_xml(str(row["sample"]))}</text>'
            )
    legend_y = 56
    for group in groups:
        r, g, b = colors[group]
        parts.append(f'<circle cx="760" cy="{legend_y}" r="6" fill="rgb({r},{g},{b})"/>')
        parts.append(
            f'<text x="774" y="{legend_y + 4}" font-family="sans-serif" font-size="13" fill="#0f172a">{_xml(group)}</text>'
        )
        legend_y += 24
    parts.append("</svg>")
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")


def _png(path: Path, width: int, height: int, rgb: bytearray) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = bytearray()
    stride = width * 3
    for y in range(height):
        raw.append(0)
        raw.extend(rgb[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def _set_px(buf: bytearray, x: int, y: int, color: tuple[int, int, int]) -> None:
    if x < 0 or y < 0 or x >= WIDTH or y >= HEIGHT:
        return
    i = (y * WIDTH + x) * 3
    buf[i : i + 3] = bytes(color)


def _disc(buf: bytearray, cx: int, cy: int, radius: int, color: tuple[int, int, int]) -> None:
    r2 = radius * radius
    for y in range(cy - radius, cy + radius + 1):
        for x in range(cx - radius, cx + radius + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                _set_px(buf, x, y, color)


def _text(buf: bytearray, x: int, y: int, text: str, color: tuple[int, int, int]) -> None:
    cursor = x
    for ch in text:
        glyph = _FONT.get(ch)
        if glyph is None:
            continue
        for row_i, row in enumerate(glyph):
            for col_i, bit in enumerate(row):
                if bit == "1":
                    _set_px(buf, cursor + col_i, y + row_i, color)
        cursor += 6


def write_png(path: Path, scores: list[dict], fractions: list[float]) -> None:
    xmin, xmax, ymin, ymax = _bounds(scores)
    left, top, plot_w, plot_h = 72, 48, 640, 520
    groups = _groups(scores)
    colors = {group: PALETTE[i % len(PALETTE)] for i, group in enumerate(groups)}
    buf = bytearray([255]) * (WIDTH * HEIGHT * 3)

    def xy(x: float, y: float) -> tuple[int, int]:
        px = left + (x - xmin) / (xmax - xmin) * plot_w
        py = top + (1 - (y - ymin) / (ymax - ymin)) * plot_h
        return int(round(px)), int(round(py))

    for x in range(left, left + plot_w):
        _set_px(buf, x, top, (203, 213, 225))
        _set_px(buf, x, top + plot_h, (203, 213, 225))
    for y in range(top, top + plot_h):
        _set_px(buf, left, y, (203, 213, 225))
        _set_px(buf, left + plot_w, y, (203, 213, 225))
    ink = (15, 23, 42)
    _text(buf, 72, 16, "PCA", ink)
    _text(buf, 80, 54, f"PC2 ({fractions[1] * 100:.1f}%)", (51, 65, 85))
    _text(buf, 72, 600, f"PC1 ({fractions[0] * 100:.1f}%)", (51, 65, 85))
    for row in scores:
        px, py = xy(row["PC1"], row["PC2"])
        _disc(buf, px, py, 6, colors[row["group"]])
        if len(scores) <= 30:
            label = _ascii_label(str(row["sample"]))
            if label:
                _text(buf, px + 8, py - 16, label[:16], ink)
    legend_y = 50
    for index, group in enumerate(groups, start=1):
        _disc(buf, 760, legend_y, 6, colors[group])
        label = _ascii_label(group) or f"#{index}"
        _text(buf, 774, legend_y - 3, label[:18], ink)
        legend_y += 22
    _png(path, WIDTH, HEIGHT, buf)


def _pdf_escape(text: str) -> str:
    out = []
    for ch in text:
        if ch in "()\\":
            out.append("\\" + ch)
        elif 32 <= ord(ch) <= 126:
            out.append(ch)
        else:
            out.append("?")
    return "".join(out)


def write_pdf(path: Path, scores: list[dict], fractions: list[float]) -> None:
    xmin, xmax, ymin, ymax = _bounds(scores)
    left, top, plot_w, plot_h = 72, 48, 640, 520
    groups = _groups(scores)
    colors = {group: PALETTE[i % len(PALETTE)] for i, group in enumerate(groups)}
    page_h = HEIGHT

    def xy(x: float, y: float) -> tuple[float, float]:
        px = left + (x - xmin) / (xmax - xmin) * plot_w
        py = top + (1 - (y - ymin) / (ymax - ymin)) * plot_h
        return px, page_h - py

    ops: list[str] = ["1 1 1 rg", f"0 0 {WIDTH} {HEIGHT} re f", "0.80 0.84 0.89 RG", "1 w"]
    x0, y0 = xy(xmin, ymin)
    x1, y1 = xy(xmax, ymax)
    ops.append(f"{x0:.2f} {y1:.2f} {x1 - x0:.2f} {y0 - y1:.2f} re S")
    ops.append("BT /F1 12 Tf 0 0 0 rg")
    ops.append(f"1 0 0 1 72 {page_h - 28:.2f} Tm (PCA) Tj")
    ops.append(
        f"1 0 0 1 72 {page_h - 610:.2f} Tm (PC1 \\({fractions[0] * 100:.1f}%\\)) Tj"
    )
    ops.append(
        f"1 0 0 1 72 {page_h - 626:.2f} Tm (PC2 \\({fractions[1] * 100:.1f}%\\)) Tj ET"
    )
    for row in scores:
        px, py = xy(row["PC1"], row["PC2"])
        r, g, b = colors[row["group"]]
        ops.append(f"{r / 255:.3f} {g / 255:.3f} {b / 255:.3f} rg")
        ops.append(f"{px - 3:.2f} {py - 3:.2f} 6 6 re f")
    legend_y = 56
    ops.append("BT /F1 11 Tf")
    for index, group in enumerate(groups, start=1):
        r, g, b = colors[group]
        ops.append("ET")
        ops.append(f"{r / 255:.3f} {g / 255:.3f} {b / 255:.3f} rg")
        ops.append(f"754 {page_h - legend_y - 3:.2f} 8 8 re f")
        label = _ascii_label(group) or f"#{index}"
        ops.append("BT /F1 11 Tf 0 0 0 rg")
        ops.append(f"1 0 0 1 770 {page_h - legend_y:.2f} Tm ({_pdf_escape(label[:18])}) Tj")
        legend_y += 22
    ops.append("ET")
    stream = "\n".join(ops).encode("latin-1", errors="replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
        (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {WIDTH} {HEIGHT}] "
            f"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
        ).encode(),
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    blob = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(blob))
        blob.extend(f"{i} 0 obj\n".encode())
        blob.extend(obj)
        blob.extend(b"\nendobj\n")
    xref = len(blob)
    blob.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    blob.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        blob.extend(f"{offset:010d} 00000 n \n".encode())
    blob.extend(
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    path.write_bytes(blob)


def write_plots(out_dir: Path, scores: list[dict], fractions: list[float]) -> None:
    write_svg(out_dir / "pca.svg", scores, fractions)
    write_png(out_dir / "pca.png", scores, fractions)
    write_pdf(out_dir / "pca.pdf", scores, fractions)
