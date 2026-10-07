#!/usr/bin/env python3
"""
Crop a DXF to wall-ish geometry and emit a dark SVG underlay + segment JSON.

Requires: pip install ezdxf

Usage:
  python scripts/cad/dxf-to-underlay.py <input.dxf> [outDir]
  python scripts/cad/dxf-to-underlay.py --apt54

Outputs (beside the DXF or in outDir):
  <stem>.underlay.svg   — cropped, dark strokes, suitable for plan <image> underlay
  <stem>.walls.json     — LINE/LWPOLYLINE segments (drawing units + meters guess)

Drawing units for Apt 54 plans appear to be centimeters (room dims ~cm labels).
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

try:
    import ezdxf
except ImportError:
    print("Missing ezdxf. Install with: pip install ezdxf", file=sys.stderr)
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_IMPORTS = REPO_ROOT / "public" / "imports" / "cad-apt54"

# Architectural wall / opening layers seen in דירה 54 שינויים
WALL_LAYER_EXACT = {
    "A-WL",
    "A-WLB",
    "A-WLBH",
    "A-WLG",
    "A-WIN",
    "A-WIN1",
    "A-DOR",
    "A-HID",
    "A-MS",
}
WALL_LAYER_PREFIXES = ("A-WL", "A-WIN", "A-DOR")

# Also include Hebrew layer names that often carry shell geometry
WALL_LAYER_HEBREW_SUBSTR = (
    "קיר",  # wall
)


def is_wall_layer(name: str) -> bool:
    if name in WALL_LAYER_EXACT:
        return True
    upper = name.upper()
    if any(upper.startswith(p) for p in WALL_LAYER_PREFIXES):
        return True
    return any(s in name for s in WALL_LAYER_HEBREW_SUBSTR)


def safe_stem(path: Path) -> str:
    stem = path.stem
    stem = re.sub(r"[^\w\u0590-\u05FF.-]+", "-", stem)
    stem = re.sub(r"-+", "-", stem).strip("-")
    return stem or "drawing"


def iter_segments(msp, wall_only: bool):
    for e in msp:
        layer = e.dxf.layer
        if wall_only and not is_wall_layer(layer):
            continue
        t = e.dxftype()
        try:
            if t == "LINE":
                yield {
                    "type": "LINE",
                    "layer": layer,
                    "x1": float(e.dxf.start.x),
                    "y1": float(e.dxf.start.y),
                    "x2": float(e.dxf.end.x),
                    "y2": float(e.dxf.end.y),
                }
            elif t == "LWPOLYLINE":
                pts = [(float(x), float(y)) for x, y, *_ in e.get_points("xy")]
                closed = bool(e.closed)
                for i in range(len(pts) - 1):
                    yield {
                        "type": "LWPOLYLINE",
                        "layer": layer,
                        "x1": pts[i][0],
                        "y1": pts[i][1],
                        "x2": pts[i + 1][0],
                        "y2": pts[i + 1][1],
                    }
                if closed and len(pts) >= 2:
                    yield {
                        "type": "LWPOLYLINE",
                        "layer": layer,
                        "x1": pts[-1][0],
                        "y1": pts[-1][1],
                        "x2": pts[0][0],
                        "y2": pts[0][1],
                    }
        except Exception:
            continue


def extents_of(segments: list[dict]) -> tuple[float, float, float, float] | None:
    if not segments:
        return None
    xs = [s["x1"] for s in segments] + [s["x2"] for s in segments]
    ys = [s["y1"] for s in segments] + [s["y2"] for s in segments]
    return min(xs), min(ys), max(xs), max(ys)


def pad_extents(
    ext: tuple[float, float, float, float], pad_frac: float = 0.03
) -> tuple[float, float, float, float]:
    min_x, min_y, max_x, max_y = ext
    w = max(max_x - min_x, 1.0)
    h = max(max_y - min_y, 1.0)
    px, py = w * pad_frac, h * pad_frac
    return min_x - px, min_y - py, max_x + px, max_y + py


def guess_unit_to_meters(width: float, height: float) -> float:
    """Heuristic: Apt 54 footprint ~10–20 m. Drawing ~1500 units → cm."""
    diag = math.hypot(width, height)
    if 800 <= diag <= 4000:
        return 0.01  # centimeters
    if 8 <= diag <= 40:
        return 1.0  # already meters
    if 8000 <= diag <= 40000:
        return 0.001  # millimeters
    return 0.01


def write_svg(
    segments: list[dict],
    ext: tuple[float, float, float, float],
    out_path: Path,
    stroke: str = "#1a1a1a",
    stroke_width: float | None = None,
) -> None:
    min_x, min_y, max_x, max_y = ext
    w = max_x - min_x
    h = max_y - min_y
    # CAD Y-up → SVG Y-down via transform
    sw = stroke_width if stroke_width is not None else max(w, h) * 0.0015
    lines: list[str] = []
    for s in segments:
        lines.append(
            f'<line x1="{s["x1"]:.4f}" y1="{s["y1"]:.4f}" '
            f'x2="{s["x2"]:.4f}" y2="{s["y2"]:.4f}" '
            f'data-layer="{xml_escape(s["layer"])}" />'
        )
    # Flip Y so plan matches typical floor-plan orientation in the underlay image.
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.4f} {h:.4f}"
     width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <rect width="100%" height="100%" fill="#f7f7f5"/>
  <g fill="none" stroke="{stroke}" stroke-width="{sw:.4f}"
     stroke-linecap="round" stroke-linejoin="round"
     transform="translate({-min_x:.4f},{max_y:.4f}) scale(1,-1)">
    {"".join(lines)}
  </g>
</svg>
"""
    out_path.write_text(svg, encoding="utf-8")


def xml_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def convert(dxf_path: Path, out_dir: Path, include_all: bool = False) -> dict:
    doc = ezdxf.readfile(str(dxf_path))
    msp = doc.modelspace()
    wall_segs = list(iter_segments(msp, wall_only=True))
    all_segs = list(iter_segments(msp, wall_only=False)) if include_all else wall_segs

    ext = extents_of(wall_segs) or extents_of(all_segs)
    if not ext:
        raise SystemExit(f"No LINE/LWPOLYLINE geometry in {dxf_path}")

    ext = pad_extents(ext)
    min_x, min_y, max_x, max_y = ext
    width, height = max_x - min_x, max_y - min_y
    unit_to_m = guess_unit_to_meters(width, height)

    stem = safe_stem(dxf_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    svg_path = out_dir / f"{stem}.underlay.svg"
    json_path = out_dir / f"{stem}.walls.json"

    segs_for_svg = wall_segs if wall_segs else all_segs
    write_svg(segs_for_svg, ext, svg_path)

    layer_counts = Counter(s["layer"] for s in segs_for_svg)
    payload = {
        "source": str(dxf_path.resolve()),
        "stem": stem,
        "drawing_units_guess": "centimeters" if unit_to_m == 0.01 else "unknown",
        "unit_to_meters": unit_to_m,
        "extents_drawing": {
            "min_x": min_x,
            "min_y": min_y,
            "max_x": max_x,
            "max_y": max_y,
            "width": width,
            "height": height,
        },
        "extents_meters": {
            "width": width * unit_to_m,
            "height": height * unit_to_m,
        },
        "layer_counts": dict(layer_counts.most_common()),
        "segment_count": len(segs_for_svg),
        "segments": [
            {
                **s,
                "x1_m": s["x1"] * unit_to_m,
                "y1_m": s["y1"] * unit_to_m,
                "x2_m": s["x2"] * unit_to_m,
                "y2_m": s["y2"] * unit_to_m,
            }
            for s in segs_for_svg
        ],
        "note": "Segments are absolute drawing coords (not room-local). Use underlay.svg for visual calibration; do not auto-import walls without alignment.",
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = {
        "dxf": str(dxf_path),
        "underlay_svg": str(svg_path),
        "walls_json": str(json_path),
        "segments": len(segs_for_svg),
        "extents_m": payload["extents_meters"],
        "layers": list(layer_counts.keys())[:20],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return summary


def find_apt54_dxf(imports_dir: Path) -> Path:
    candidates = sorted(imports_dir.glob("*.dxf"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not candidates:
        raise SystemExit(
            f"No DXF in {imports_dir}. Run: node scripts/cad/dwg-to-underlay.mjs --apt54"
        )
    preferred = [p for p in candidates if "שינויים" in p.name or "shinuyim" in p.name.lower()]
    return preferred[0] if preferred else candidates[0]


def main() -> None:
    parser = argparse.ArgumentParser(description="DXF → cropped SVG underlay + walls JSON")
    parser.add_argument("dxf", nargs="?", help="Input DXF path")
    parser.add_argument("out_dir", nargs="?", help="Output directory")
    parser.add_argument("--apt54", action="store_true", help="Use latest DXF under public/imports/cad-apt54")
    parser.add_argument("--all-layers", action="store_true", help="Include non-wall layers in SVG")
    args = parser.parse_args()

    if args.apt54:
        dxf_path = find_apt54_dxf(DEFAULT_IMPORTS)
        out_dir = DEFAULT_IMPORTS
    else:
        if not args.dxf:
            parser.print_help()
            sys.exit(1)
        dxf_path = Path(args.dxf)
        out_dir = Path(args.out_dir) if args.out_dir else dxf_path.parent

    if not dxf_path.is_file():
        raise SystemExit(f"DXF not found: {dxf_path}")

    convert(dxf_path, out_dir, include_all=args.all_layers)


if __name__ == "__main__":
    main()
