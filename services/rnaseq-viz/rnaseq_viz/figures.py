"""Volcano, heatmap, and Venn figures from in-memory tables."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

LFC_CUT = 1.0
PADJ_CUT = 0.05

_UP = (180, 83, 9)
_DOWN = (15, 118, 110)
_NS = (148, 163, 184)
_INK = (15, 23, 42)


def _xml(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _png(path: Path, width: int, height: int, rgb: bytearray) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = bytearray()
    stride = width * 3
    for y in range(height):
        raw.append(0)
        raw.extend(rgb[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    )


def _px(buf: bytearray, width: int, height: int, x: int, y: int, color: tuple[int, int, int]) -> None:
    if x < 0 or y < 0 or x >= width or y >= height:
        return
    i = (y * width + x) * 3
    buf[i : i + 3] = bytes(color)


def _disc(buf: bytearray, width: int, height: int, cx: int, cy: int, radius: int, color: tuple[int, int, int]) -> None:
    r2 = radius * radius
    for y in range(cy - radius, cy + radius + 1):
        for x in range(cx - radius, cx + radius + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                _px(buf, width, height, x, y, color)


def is_significant(log2fc: float, padj: float) -> str:
    if padj <= PADJ_CUT and log2fc >= LFC_CUT:
        return "up"
    if padj <= PADJ_CUT and log2fc <= -LFC_CUT:
        return "down"
    return "ns"


def write_volcano(out_svg: Path, out_png: Path, rows: list[dict], title: str) -> None:
    width, height = 960, 640
    left, top, plot_w, plot_h = 72, 48, 760, 520
    xs = [float(row["log2fc"]) for row in rows] or [0.0]
    ys = [-math.log10(max(float(row["padj"]), 1e-300)) for row in rows] or [0.0]
    xmin, xmax = min(min(xs), -LFC_CUT - 0.5), max(max(xs), LFC_CUT + 0.5)
    ymin, ymax = 0.0, max(max(ys), -math.log10(PADJ_CUT) + 0.5)
    pad_x = (xmax - xmin) * 0.08 or 0.5
    xmin -= pad_x
    xmax += pad_x
    ymax *= 1.08

    def xy(x: float, y: float) -> tuple[float, float]:
        px = left + (x - xmin) / (xmax - xmin) * plot_w
        py = top + (1 - (y - ymin) / (ymax - ymin)) * plot_h
        return px, py

    y_cut = -math.log10(PADJ_CUT)
    x_neg, _ = xy(-LFC_CUT, 0)
    x_pos, _ = xy(LFC_CUT, 0)
    _, y_line = xy(0, y_cut)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        f'<text x="72" y="32" font-family="sans-serif" font-size="18" fill="#0f172a">{_xml(title)}</text>',
        '<rect x="72" y="48" width="760" height="520" fill="none" stroke="#cbd5e1"/>',
        f'<line x1="{x_neg:.1f}" y1="48" x2="{x_neg:.1f}" y2="568" stroke="#e2e8f0"/>',
        f'<line x1="{x_pos:.1f}" y1="48" x2="{x_pos:.1f}" y2="568" stroke="#e2e8f0"/>',
        f'<line x1="72" y1="{y_line:.1f}" x2="832" y2="{y_line:.1f}" stroke="#e2e8f0"/>',
        '<text x="72" y="610" font-family="sans-serif" font-size="14" fill="#334155">log2FC</text>',
        '<text x="78" y="66" font-family="sans-serif" font-size="13" fill="#334155">-log10 padj</text>',
    ]
    colors = {"up": _UP, "down": _DOWN, "ns": _NS}
    for row, y in zip(rows, ys):
        kind = is_significant(float(row["log2fc"]), float(row["padj"]))
        px, py = xy(float(row["log2fc"]), y)
        r, g, b = colors[kind]
        parts.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="4" fill="rgb({r},{g},{b})"/>')
    parts.append("</svg>")
    out_svg.write_text("\n".join(parts) + "\n", encoding="utf-8")

    buf = bytearray([255]) * (width * height * 3)
    for x in range(left, left + plot_w):
        _px(buf, width, height, x, top, (203, 213, 225))
        _px(buf, width, height, x, top + plot_h, (203, 213, 225))
    for y in range(top, top + plot_h):
        _px(buf, width, height, left, y, (203, 213, 225))
        _px(buf, width, height, left + plot_w, y, (203, 213, 225))
    for row, yv in zip(rows, ys):
        kind = is_significant(float(row["log2fc"]), float(row["padj"]))
        px, py = xy(float(row["log2fc"]), yv)
        _disc(buf, width, height, int(px), int(py), 4, colors[kind])
    _png(out_png, width, height, buf)


def _row_z(values: list[float]) -> list[float]:
    n = len(values)
    mu = sum(values) / n
    var = sum((v - mu) ** 2 for v in values) / max(n - 1, 1)
    sd = math.sqrt(var)
    if sd < 1e-12:
        return [0.0] * n
    return [max(-2.0, min(2.0, (v - mu) / sd)) for v in values]


def _heat_color(z: float) -> tuple[int, int, int]:
    # -2 blue, 0 white, +2 red
    t = (z + 2.0) / 4.0
    if t < 0.5:
        u = t / 0.5
        return (int(37 + (255 - 37) * u), int(99 + (255 - 99) * u), int(235 + (255 - 235) * u))
    u = (t - 0.5) / 0.5
    return (255, int(255 + (80 - 255) * u), int(255 + (60 - 255) * u))


def write_heatmap(
    out_svg: Path,
    out_png: Path,
    genes: list[str],
    samples: list[str],
    groups: list[str],
    matrix: list[list[float]],
) -> None:
    if not genes:
        out_svg.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120"><text x="16" y="48" font-family="sans-serif">没有可绘制的基因</text></svg>\n',
            encoding="utf-8",
        )
        _png(out_png, 64, 64, bytearray([255]) * (64 * 64 * 3))
        return
    zrows = [_row_z(row) for row in matrix]
    cell = 36
    left = 140
    top = 108
    width = left + cell * len(samples) + 40
    height = top + cell * len(genes) + 40
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        '<text x="16" y="28" font-family="sans-serif" font-size="18" fill="#0f172a">DE heatmap</text>',
    ]
    j = 0
    while j < len(samples):
        k = j + 1
        while k < len(groups) and groups[k] == groups[j]:
            k += 1
        x = left + j * cell
        parts.append(
            f'<text x="{x + 2}" y="48" font-family="sans-serif" font-size="12" fill="#64748b">{_xml(groups[j])}</text>'
        )
        j = k
    for j, sample in enumerate(samples):
        x = left + j * cell + 10
        parts.append(
            f'<text x="{x}" y="96" font-family="sans-serif" font-size="11" transform="rotate(-55 {x} 96)" fill="#334155">{_xml(sample)}</text>'
        )
    for i, gene in enumerate(genes):
        y = top + i * cell
        parts.append(f'<text x="8" y="{y + 18}" font-family="sans-serif" font-size="12" fill="#0f172a">{_xml(gene)}</text>')
        for j, z in enumerate(zrows[i]):
            r, g, b = _heat_color(z)
            parts.append(
                f'<rect x="{left + j * cell}" y="{y}" width="{cell - 2}" height="{cell - 2}" fill="rgb({r},{g},{b})"/>'
            )
    parts.append("</svg>")
    out_svg.write_text("\n".join(parts) + "\n", encoding="utf-8")

    buf = bytearray([255]) * (width * height * 3)
    for i, row in enumerate(zrows):
        for j, z in enumerate(row):
            color = _heat_color(z)
            x0 = left + j * cell
            y0 = top + i * cell
            for y in range(y0, y0 + cell - 2):
                for x in range(x0, x0 + cell - 2):
                    _px(buf, width, height, x, y, color)
    _png(out_png, width, height, buf)


def write_venn(out_svg: Path, sets: list[tuple[str, set[str]]]) -> dict[str, list[str]]:
    """2 or 3 sets. Returns region label -> gene ids."""
    names = [name for name, _ in sets]
    regions: dict[str, list[str]] = {}
    if len(sets) == 2:
        a, b = sets[0][1], sets[1][1]
        regions[f"only_{names[0]}"] = sorted(a - b)
        regions[f"only_{names[1]}"] = sorted(b - a)
        regions["both"] = sorted(a & b)
        only_a, only_b, both = len(regions[f"only_{names[0]}"]), len(regions[f"only_{names[1]}"]), len(regions["both"])
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="24" y="36" font-family="sans-serif" font-size="18" fill="#0f172a">DEG Venn</text>
<circle cx="280" cy="220" r="120" fill="rgba(15,118,110,0.25)" stroke="#0f766e"/>
<circle cx="420" cy="220" r="120" fill="rgba(180,83,9,0.25)" stroke="#b45309"/>
<text x="200" y="220" font-family="sans-serif" font-size="20" fill="#0f172a">{only_a}</text>
<text x="400" y="220" font-family="sans-serif" font-size="20" fill="#0f172a">{both}</text>
<text x="500" y="220" font-family="sans-serif" font-size="20" fill="#0f172a">{only_b}</text>
<text x="160" y="80" font-family="sans-serif" font-size="14" fill="#0f766e">{_xml(names[0])}</text>
<text x="460" y="80" font-family="sans-serif" font-size="14" fill="#b45309">{_xml(names[1])}</text>
</svg>
'''
    elif len(sets) == 3:
        a, b, c = (s[1] for s in sets)
        regions[f"only_{names[0]}"] = sorted(a - b - c)
        regions[f"only_{names[1]}"] = sorted(b - a - c)
        regions[f"only_{names[2]}"] = sorted(c - a - b)
        regions[f"{names[0]}_and_{names[1]}"] = sorted((a & b) - c)
        regions[f"{names[0]}_and_{names[2]}"] = sorted((a & c) - b)
        regions[f"{names[1]}_and_{names[2]}"] = sorted((b & c) - a)
        regions["all_three"] = sorted(a & b & c)
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="24" y="36" font-family="sans-serif" font-size="18">DEG Venn</text>
<circle cx="300" cy="190" r="110" fill="rgba(15,118,110,0.2)" stroke="#0f766e"/>
<circle cx="420" cy="190" r="110" fill="rgba(180,83,9,0.2)" stroke="#b45309"/>
<circle cx="360" cy="300" r="110" fill="rgba(30,64,175,0.2)" stroke="#1e40af"/>
<text x="250" y="180" font-family="sans-serif">{len(regions[f"only_{names[0]}"])}</text>
<text x="450" y="180" font-family="sans-serif">{len(regions[f"only_{names[1]}"])}</text>
<text x="345" y="340" font-family="sans-serif">{len(regions[f"only_{names[2]}"])}</text>
<text x="345" y="230" font-family="sans-serif">{len(regions["all_three"])}</text>
<text x="24" y="460" font-family="sans-serif" font-size="13">{_xml(" · ".join(names))}</text>
</svg>
'''
    else:
        raise ValueError("韦恩图目前支持 2 或 3 个比较")
    out_svg.write_text(svg, encoding="utf-8")
    return regions


def write_bubble(out_svg: Path, title: str, rows: list[dict]) -> None:
    if not rows:
        out_svg.write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="80"><text x="16" y="40" font-family="sans-serif">{_xml(title)}：没有显著条目</text></svg>\n',
            encoding="utf-8",
        )
        return
    height = 80 + 36 * len(rows)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="860" height="{height}" viewBox="0 0 860 {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        f'<text x="16" y="32" font-family="sans-serif" font-size="18">{_xml(title)}</text>',
    ]
    max_hits = max(int(row["hits"]) for row in rows) or 1
    for i, row in enumerate(rows):
        y = 70 + i * 36
        radius = 6 + 14 * (int(row["hits"]) / max_hits)
        parts.append(f'<text x="16" y="{y}" font-family="sans-serif" font-size="13">{_xml(row["term"])}</text>')
        parts.append(f'<circle cx="620" cy="{y - 4}" r="{radius:.1f}" fill="rgba(15,118,110,0.75)"/>')
        parts.append(
            f'<text x="660" y="{y}" font-family="sans-serif" font-size="12" fill="#334155">hits {row["hits"]} padj {float(row["padj"]):.3g}</text>'
        )
    parts.append("</svg>")
    out_svg.write_text("\n".join(parts) + "\n", encoding="utf-8")
