#!/usr/bin/env python3
"""
Regenerates `motion-loop.mp4`, the video the transitions example plays.

The loop is seamless by construction rather than by crossfade: each ring
advances exactly one slot per cycle, so frame N maps onto frame 0. The
rings fade in near the centre and out near the edge, which is what hides
the moment a ring wraps around.

    python3 motion-loop.py && \
    ffmpeg -y -framerate 24 -i frames/f%04d.png -c:v libx264 \
      -pix_fmt yuv420p -profile:v baseline -movflags +faststart -crf 28 \
      ../motion-loop.mp4

Baseline profile, yuv420p and a non-fragmented container, because the
render worker's demuxer reads progressive MP4 and nothing else.
"""

import math
import pathlib
import subprocess

W, H, N = 1280, 992, 120
RINGS, RMAX = 7, 980.0
CX, CY = 300.0, 760.0
COLOURS = ["#2fb89a", "#33a0b5", "#3f7fbf", "#4d63c4", "#5b4bc0", "#7a46a8", "#a8437f"]

out = pathlib.Path(__file__).parent / "frames"
out.mkdir(exist_ok=True)

for f in range(N):
    phase = f / N
    parts = []
    for i in range(RINGS):
        frac = ((i / RINGS) + phase) % 1.0
        r = RMAX * frac
        if r < 8:
            continue
        opacity = min(frac / 0.12, 1.0) * max(0.0, 1.0 - (frac - 0.55) / 0.45)
        if opacity <= 0.01:
            continue
        width = 12.0 * (1.0 - frac) + 2.0
        parts.append(
            f'<circle cx="{CX:.1f}" cy="{CY:.1f}" r="{r:.1f}" fill="none" '
            f'stroke="{COLOURS[i % len(COLOURS)]}" stroke-width="{width:.1f}" '
            f'opacity="{opacity:.3f}"/>'
        )

    angle = phase * 2 * math.pi
    dx, dy = 980 + 46 * math.cos(angle), 250 + 46 * math.sin(angle)

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0%" stop-color="#0c1216"/><stop offset="100%" stop-color="#121d26"/>
  </linearGradient></defs>
  <rect width="{W}" height="{H}" fill="url(#g)"/>
  {''.join(parts)}
  <path d="M{W} 0 L{W} {H} L{W - 360} {H} Z" fill="#e8615f" opacity="0.9"/>
  <circle cx="{dx:.1f}" cy="{dy:.1f}" r="58" fill="#0c1216"/>
  <circle cx="{dx:.1f}" cy="{dy:.1f}" r="58" fill="none" stroke="#f0ede6" stroke-width="4"/>
  <circle cx="{dx:.1f}" cy="{dy:.1f}" r="10" fill="#f0ede6"/>
</svg>'''

    svg_path = out / f"f{f:04d}.svg"
    svg_path.write_text(svg)
    subprocess.run(
        ["rsvg-convert", "-w", str(W), "-h", str(H), str(svg_path), "-o", str(out / f"f{f:04d}.png")],
        check=True,
    )
    svg_path.unlink()

print(f"wrote {N} frames to {out}")
