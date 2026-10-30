"""Generates the original illustrated artwork for the Task 11 redesign (frontend/src/assets/art).

Everything is drawn here from simple shapes -- gradients, arcs, waves, petals, bokeh -- with a
fixed random seed, so running it again gives the same files. No people, faces, logos, brand names
or copied artwork. Each file is registered, with a description, in frontend/src/design/art.ts.

Run from the repository root:  python scripts/generate_art.py
"""

from __future__ import annotations

import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "assets" / "art"
W, H = 1600, 1000


def f(x: float) -> str:
    """Short numbers keep the files small."""
    return f"{x:.1f}".rstrip("0").rstrip(".")


def svg(body: str, defs: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'preserveAspectRatio="xMidYMid slice" role="img" aria-label="{title}">'
        f"<defs>{defs}</defs>{body}</svg>\n"
    )


def linear(id_: str, stops: list[tuple[float, str, float]], x2="0", y2="1") -> str:
    s = "".join(
        f'<stop offset="{o}" stop-color="{c}"{"" if a == 1 else f" stop-opacity=\"{a}\""}/>'
        for o, c, a in stops
    )
    return f'<linearGradient id="{id_}" x1="0" y1="0" x2="{x2}" y2="{y2}">{s}</linearGradient>'


def radial(id_: str, color: str, opacity: float) -> str:
    return (
        f'<radialGradient id="{id_}"><stop offset="0" stop-color="{color}" '
        f'stop-opacity="{opacity}"/><stop offset="1" stop-color="{color}" stop-opacity="0"/>'
        f"</radialGradient>"
    )


def glow(id_: str, cx, cy, rx, ry=None) -> str:
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry or rx)}" fill="url(#{id_})"/>'


def sparkle(x, y, r, color, opacity) -> str:
    k = r * 0.22
    d = (
        f"M{f(x)} {f(y - r)}Q{f(x + k)} {f(y - k)} {f(x + r)} {f(y)}"
        f"Q{f(x + k)} {f(y + k)} {f(x)} {f(y + r)}Q{f(x - k)} {f(y + k)} {f(x - r)} {f(y)}"
        f"Q{f(x - k)} {f(y - k)} {f(x)} {f(y - r)}Z"
    )
    return f'<path d="{d}" fill="{color}" opacity="{opacity}"/>'


# --------------------------------------------------------------------------- Salon


def salon(dark: bool) -> str:
    """Midnight Studio: an empty styling studio at night -- arched mirrors, pendant lamps, light
    beams and an art-deco fan, in navy with gold and copper."""
    rnd = random.Random(11)
    if dark:
        bg = [(0, "#0A0E1C", 1), (0.55, "#121A31", 1), (1, "#070A15", 1)]
        gold, copper, line_op, beam_op, glow_op = "#D4A853", "#D98A5A", 0.35, 0.10, 0.30
        mirror_fill = "#141C33"
    else:
        bg = [(0, "#F7F2E8", 1), (0.55, "#EFE5D3", 1), (1, "#F9F6EF", 1)]
        gold, copper, line_op, beam_op, glow_op = "#B8893A", "#C77D4E", 0.45, 0.16, 0.35
        mirror_fill = "#FBF8F2"
    defs = (
        linear("bg", bg, x2="1", y2="1")
        + radial("g1", gold, glow_op)
        + radial("g2", copper, glow_op * 0.8)
        + linear("beam", [(0, gold, beam_op), (1, gold, 0)])
    )
    parts = [f'<rect width="{W}" height="{H}" fill="url(#bg)"/>']
    parts.append(glow("g1", 260, 120, 520, 360))
    parts.append(glow("g2", 1380, 900, 560, 380))
    # Light beams from the lamps.
    for x in (420, 760, 1100):
        parts.append(
            f'<polygon points="{x - 18},150 {x + 18},150 {x + 190},1000 {x - 190},1000" '
            f'fill="url(#beam)"/>'
        )
    # Pendant lamps.
    for x in (420, 760, 1100):
        parts.append(
            f'<line x1="{x}" y1="0" x2="{x}" y2="118" stroke="{gold}" stroke-width="2" '
            f'opacity="{line_op}"/>'
        )
        parts.append(
            f'<path d="M{x - 34} 150Q{x} 96 {x + 34} 150Z" fill="{gold}" opacity="{line_op + 0.25}"/>'
        )
        parts.append(glow("g1", x, 156, 70, 40))
    # Arched mirrors on the back wall.
    for x0 in (200, 1260):
        w, top, bottom = 220, 300, 760
        r = w / 2
        d = (
            f"M{x0} {bottom}V{top + r}A{f(r)} {f(r)} 0 0 1 {x0 + w} {top + r}V{bottom}Z"
        )
        parts.append(
            f'<path d="{d}" fill="{mirror_fill}" opacity="0.55" stroke="{gold}" '
            f'stroke-width="3" stroke-opacity="{line_op + 0.15}"/>'
        )
        parts.append(
            f'<path d="M{x0 + 40} {bottom - 60}L{x0 + 120} {top + 90}" stroke="{gold}" '
            f'stroke-width="2" opacity="{line_op * 0.6}"/>'
        )
    # Art-deco fan rising from the floor.
    cx, cy = 800, 1040
    for i in range(19):
        a = math.pi * (0.12 + 0.76 * i / 18)
        parts.append(
            f'<line x1="{cx}" y1="{cy}" x2="{f(cx - math.cos(a) * 520)}" '
            f'y2="{f(cy - math.sin(a) * 520)}" stroke="{gold}" stroke-width="1.5" '
            f'opacity="{line_op * 0.45}"/>'
        )
    for rr in (240, 360, 480):
        parts.append(
            f'<path d="M{cx - rr} {cy}A{rr} {rr} 0 0 1 {cx + rr} {cy}" fill="none" '
            f'stroke="{copper}" stroke-width="2" opacity="{line_op * 0.55}"/>'
        )
    # Floor line and sparkles.
    parts.append(
        f'<line x1="0" y1="820" x2="{W}" y2="820" stroke="{gold}" stroke-width="1.5" '
        f'opacity="{line_op * 0.5}"/>'
    )
    for _ in range(26):
        parts.append(
            sparkle(
                rnd.uniform(40, W - 40),
                rnd.uniform(40, 760),
                rnd.uniform(4, 11),
                gold,
                round(rnd.uniform(0.25, 0.6), 2),
            )
        )
    title = "Abstract night studio with arched mirrors and warm lamp light"
    return svg("".join(parts), defs, title)


# --------------------------------------------------------------------------- Spa


def spa(dark: bool) -> str:
    """Sage Calm: still water with ripples, a lotus outline, stacked stones and soft waves in sage
    and warm sand."""
    rnd = random.Random(23)
    if dark:
        bg = [(0, "#0C1511", 1), (0.6, "#13211A", 1), (1, "#09110D", 1)]
        sage, sand, deep, op = "#7FA285", "#D8C29C", "#1B2E23", 0.30
        wave = ["#13241B", "#17291F", "#1C3125"]
    else:
        bg = [(0, "#F6F2E8", 1), (0.6, "#ECF1E6", 1), (1, "#F3EEE2", 1)]
        sage, sand, deep, op = "#7FA285", "#C9AE7E", "#DCE7D7", 0.45
        wave = ["#E4ECDF", "#D9E5D3", "#CFDDC8"]
    defs = linear("bg", bg) + radial("mist", sand, op * 0.8) + radial("leaf", sage, op)
    parts = [f'<rect width="{W}" height="{H}" fill="url(#bg)"/>']
    parts.append(glow("mist", 1180, 220, 600, 340))
    parts.append(glow("leaf", 300, 700, 520, 300))
    # Soft layered waves.
    for i, color in enumerate(wave):
        y = 700 + i * 90
        d = f"M0 {y}"
        for k in range(5):
            x = k * 400
            d += f"C{x + 130} {y - 60 + 20 * i} {x + 270} {y + 60 - 20 * i} {x + 400} {y}"
        d += f"V{H}H0Z"
        parts.append(f'<path d="{d}" fill="{color}" opacity="0.9"/>')
    # Ripples on still water.
    for k, rx in enumerate((90, 170, 250, 330)):
        parts.append(
            f'<ellipse cx="560" cy="640" rx="{rx}" ry="{f(rx * 0.22)}" fill="none" '
            f'stroke="{sage}" stroke-width="2" opacity="{f(op * (1 - k * 0.2))}"/>'
        )
    # A large lotus outline.
    cx, cy, s = 1170, 560, 1.0
    petals = [
        f"M{cx} {cy - 220}C{cx + 70} {cy - 120} {cx + 70} {cy - 30} {cx} {cy + 40}"
        f"C{cx - 70} {cy - 30} {cx - 70} {cy - 120} {cx} {cy - 220}Z",
        f"M{cx} {cy + 40}C{cx - 110} {cy + 20} {cx - 190} {cy - 70} {cx - 200} {cy - 160}"
        f"C{cx - 110} {cy - 140} {cx - 20} {cy - 70} {cx} {cy + 40}Z",
        f"M{cx} {cy + 40}C{cx + 110} {cy + 20} {cx + 190} {cy - 70} {cx + 200} {cy - 160}"
        f"C{cx + 110} {cy - 140} {cx + 20} {cy - 70} {cx} {cy + 40}Z",
        f"M{cx} {cy + 50}C{cx - 150} {cy + 70} {cx - 280} {cy + 20} {cx - 320} {cy - 60}"
        f"C{cx - 200} {cy - 70} {cx - 70} {cy - 10} {cx} {cy + 50}Z",
        f"M{cx} {cy + 50}C{cx + 150} {cy + 70} {cx + 280} {cy + 20} {cx + 320} {cy - 60}"
        f"C{cx + 200} {cy - 70} {cx + 70} {cy - 10} {cx} {cy + 50}Z",
    ]
    for d in petals:
        parts.append(
            f'<path d="{d}" fill="{sage}" fill-opacity="{f(op * 0.35)}" stroke="{sage}" '
            f'stroke-width="2.5" stroke-opacity="{f(op * 1.6)}"/>'
        )
    # Stacked stones.
    stones = [(250, 560, 120, 46), (262, 486, 92, 36), (250, 428, 66, 26), (258, 386, 44, 18)]
    for x, y, rx, ry in stones:
        parts.append(
            f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{deep}" stroke="{sand}" '
            f'stroke-width="2" stroke-opacity="{f(op * 1.4)}"/>'
        )
    # Drifting leaves.
    for _ in range(14):
        x, y, a = rnd.uniform(60, W - 60), rnd.uniform(60, 600), rnd.uniform(0, 180)
        parts.append(
            f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rnd.uniform(10, 22))}" ry="5" '
            f'fill="{sage}" opacity="{f(op * 0.9)}" transform="rotate({f(a)} {f(x)} {f(y)})"/>'
        )
    title = "Abstract calm water with ripples, a lotus outline and stacked stones"
    return svg("".join(parts), defs, title)


# --------------------------------------------------------------------------- Beauty Parlor


def parlor(dark: bool) -> str:
    """Rose Glow: soft petals, champagne bokeh, a sweeping brush stroke and sparkles in blush,
    rose and champagne gold."""
    rnd = random.Random(37)
    if dark:
        bg = [(0, "#1A0C13", 1), (0.6, "#2A1420", 1), (1, "#12080D", 1)]
        rose, blush, gold, op = "#B04A6D", "#F2A7BB", "#E3C88F", 0.28
    else:
        bg = [(0, "#FEF6F7", 1), (0.6, "#FBE6EC", 1), (1, "#FDF2F0", 1)]
        rose, blush, gold, op = "#D9779A", "#F4B9CA", "#D7B26A", 0.4
    defs = (
        linear("bg", bg, x2="1", y2="1")
        + radial("bk", gold, 0.55)
        + radial("rg", rose, op)
        + linear("stroke", [(0, gold, 0), (0.5, gold, op * 1.4), (1, gold, 0)], x2="1", y2="0")
    )
    parts = [f'<rect width="{W}" height="{H}" fill="url(#bg)"/>']
    parts.append(glow("rg", 1250, 300, 560, 420))
    parts.append(glow("rg", 250, 850, 520, 340))

    def petal(x, y, size, angle, color, opacity):
        d = (
            f"M0 0C{f(size * 0.55)} {f(-size * 0.35)} {f(size * 0.6)} {f(-size)} 0 {f(-size * 1.25)}"
            f"C{f(-size * 0.6)} {f(-size)} {f(-size * 0.55)} {f(-size * 0.35)} 0 0Z"
        )
        return (
            f'<path d="{d}" fill="{color}" opacity="{f(opacity)}" '
            f'transform="translate({f(x)} {f(y)}) rotate({f(angle)})"/>'
        )

    # Large petals drifting.
    for _ in range(16):
        parts.append(
            petal(
                rnd.uniform(0, W),
                rnd.uniform(80, H),
                rnd.uniform(50, 150),
                rnd.uniform(0, 360),
                rnd.choice([rose, blush]),
                rnd.uniform(op * 0.4, op * 1.1),
            )
        )
    # A five-petal flower, top left.
    for k in range(5):
        parts.append(petal(330, 300, 120, k * 72, blush, op * 1.2))
    parts.append(f'<circle cx="330" cy="300" r="22" fill="{gold}" opacity="{f(op * 1.6)}"/>')
    # A sweeping brush stroke.
    parts.append(
        '<path d="M120 760C420 600 760 860 1080 700S1420 520 1540 560" fill="none" '
        'stroke="url(#stroke)" stroke-width="46" stroke-linecap="round"/>'
    )
    # Champagne bokeh.
    for _ in range(22):
        r = rnd.uniform(12, 60)
        parts.append(glow("bk", rnd.uniform(0, W), rnd.uniform(0, H), r))
    for _ in range(20):
        parts.append(
            sparkle(
                rnd.uniform(40, W - 40),
                rnd.uniform(40, H - 40),
                rnd.uniform(4, 10),
                gold,
                round(rnd.uniform(0.3, 0.7), 2),
            )
        )
    title = "Abstract soft petals, champagne light and a sweeping brush stroke"
    return svg("".join(parts), defs, title)


ART = {
    "salon-studio": salon,
    "spa-calm": spa,
    "parlor-glow": parlor,
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, draw in ART.items():
        for mode in ("light", "dark"):
            path = OUT / f"{name}-{mode}.svg"
            path.write_text(draw(mode == "dark"), encoding="utf-8")
            print(f"{path.relative_to(OUT.parent.parent.parent.parent)}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
