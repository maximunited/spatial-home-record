/**
 * Procedural PNG frame sequences for HA Picture Elements overlays.
 * Naming matches ha-blinds-frame-card / ha-fan-loop-card: `{prefix}{000}.png`.
 *
 * Blind frames: index 0 = fully open (raised), last = fully closed — matches
 * ha-blinds-frame-card mapping `frame = (100 - current_position) * (n-1) / 100`.
 * Fan frames: full rotation loop; playback rate comes from fan percentage.
 */

import { deflateSync } from "node:zlib";

export const BLIND_FRAME_COUNT = 11;
export const FAN_FRAME_COUNT = 8;

export const ANIMATION_LOCAL_ROOT = "/local/spatial-home-record/animations";

export type AnimationAssetFile = {
  /** Path inside the export ZIP (forward slashes). */
  path: string;
  content: Uint8Array;
};

export type AnimationBundle = {
  files: AnimationAssetFile[];
  blind: {
    frameCount: number;
    pngPathPrefix: string;
    /** Key frames for stock picture-elements state_image fallback. */
    stateImages: {
      open: string;
      closed: string;
      opening: string;
      closing: string;
    };
  };
  fan: {
    frameCount: number;
    pngPathPrefix: string;
    stateImages: {
      on: string;
      off: string;
    };
    playMap: Array<[number, number]>;
  };
  readme: string;
};

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const len = data.length;
  const out = new Uint8Array(12 + len);
  const view = new DataView(out.buffer);
  view.setUint32(0, len, false);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcBuf = new Uint8Array(4 + len);
  crcBuf.set(typeBytes, 0);
  crcBuf.set(data, 4);
  view.setUint32(8 + len, crc32(crcBuf), false);
  return out;
}

/** Encode an RGBA buffer as a PNG (filter 0, zlib). */
export function encodeRgbaPng(
  width: number,
  height: number,
  rgba: Uint8Array,
): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error("RGBA length mismatch");
  }
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), rowStart + 1);
  }
  const compressed = deflateSync(raw, { level: 9 });

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const parts = [
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function setPixel(
  rgba: Uint8Array,
  w: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (x < 0 || y < 0 || x >= w || y >= rgba.length / (w * 4)) return;
  const i = (y * w + x) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = a;
}

function fillRect(
  rgba: Uint8Array,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(w - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(rgba.length / (w * 4) - 1, Math.max(y0, y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      setPixel(rgba, w, x, y, r, g, b, a);
    }
  }
}

function strokeRect(
  rgba: Uint8Array,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  fillRect(rgba, w, x0, y0, x1, y0, r, g, b, a);
  fillRect(rgba, w, x0, y1, x1, y1, r, g, b, a);
  fillRect(rgba, w, x0, y0, x0, y1, r, g, b, a);
  fillRect(rgba, w, x1, y0, x1, y1, r, g, b, a);
}

/**
 * Blind overlay: isometric-adjacent window frame with descending shade.
 * closedAmount 0 = open (raised), 1 = fully closed.
 */
export function renderBlindFrame(
  closedAmount: number,
  width = 96,
  height = 128,
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const t = Math.min(1, Math.max(0, closedAmount));

  // Soft window frame (matches SVG zinc palette)
  strokeRect(rgba, width, 18, 12, 77, 110, 82, 82, 91, 230);
  strokeRect(rgba, width, 20, 14, 75, 108, 113, 113, 122, 200);
  // Glass
  fillRect(rgba, width, 22, 16, 73, 106, 186, 230, 253, 90);

  const shadeTop = 16;
  const shadeBottom = 106;
  const shadeH = Math.round((shadeBottom - shadeTop) * t);
  if (shadeH > 0) {
    fillRect(
      rgba,
      width,
      22,
      shadeTop,
      73,
      shadeTop + shadeH,
      251,
      146,
      60,
      210,
    );
    // Slats
    for (let y = shadeTop; y < shadeTop + shadeH; y += 4) {
      fillRect(rgba, width, 22, y, 73, y, 194, 65, 12, 180);
    }
  }
  // Pull bar
  const barY = shadeTop + shadeH;
  fillRect(rgba, width, 22, barY, 73, barY + 2, 120, 53, 15, 240);

  return encodeRgbaPng(width, height, rgba);
}

/** Fan overlay: three blades at angleRadians. */
export function renderFanFrame(
  angleRadians: number,
  width = 96,
  height = 96,
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const hubR = 6;
  const bladeLen = 34;
  const bladeHalfW = 7;

  // Hub
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= hubR * hubR) {
        setPixel(rgba, width, x, y, 71, 85, 105, 240);
      }
    }
  }

  for (let b = 0; b < 3; b++) {
    const a = angleRadians + (b * Math.PI * 2) / 3;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const px = -sin;
    const py = cos;
    for (let t = 4; t <= bladeLen; t++) {
      for (let s = -bladeHalfW; s <= bladeHalfW; s++) {
        const x = Math.round(cx + cos * t + px * s * (1 - t / bladeLen));
        const y = Math.round(cy + sin * t + py * s * (1 - t / bladeLen));
        const fade = 200 - Math.abs(s) * 12;
        setPixel(rgba, width, x, y, 148, 163, 184, Math.max(80, fade));
      }
    }
  }

  return encodeRgbaPng(width, height, rgba);
}

function frameName(prefix: string, index: number): string {
  return `${prefix}_${String(index).padStart(3, "0")}.png`;
}

function localUrl(fileName: string): string {
  return `${ANIMATION_LOCAL_ROOT}/${fileName}`;
}

export function buildAnimationBundle(): AnimationBundle {
  const files: AnimationAssetFile[] = [];

  for (let i = 0; i < BLIND_FRAME_COUNT; i++) {
    // Frame 0 open … last closed (see module doc).
    const closedAmount = i / (BLIND_FRAME_COUNT - 1);
    const name = frameName("blind", i);
    files.push({
      path: `animations/${name}`,
      content: renderBlindFrame(closedAmount),
    });
  }

  for (let i = 0; i < FAN_FRAME_COUNT; i++) {
    const angle = (i / FAN_FRAME_COUNT) * Math.PI * 2;
    const name = frameName("fan", i);
    files.push({
      path: `animations/${name}`,
      content: renderFanFrame(angle),
    });
  }

  const midBlind = Math.floor((BLIND_FRAME_COUNT - 1) / 2);
  const readme = `# Animation assets

PNG sequences for living-room blind (position) and ceiling fan (speed loop).
Framing matches the isometric export markers (zinc / orange / slate palette).

## Install into Home Assistant

1. Copy this \`animations/\` folder to \`/config/www/spatial-home-record/animations/\`
   (served as \`${ANIMATION_LOCAL_ROOT}/…\`).
2. Copy \`assets/isometric.svg\` to \`/config/www/spatial-home-record/isometric.svg\`.
3. For continuous position/speed overlays, install
   [HA-isometric-animated-picture-card](https://github.com/tikel1/HA-isometric-animated-picture-card)
   (\`ha-blinds-frame-card\` + \`ha-fan-loop-card\`) and add Lovelace resources.
4. Optional WebM (desktop custom cards prefer \`src\`): from this folder run
   \`ffmpeg -y -framerate 12 -i blind_%03d.png -c:v libvpx-vp9 -pix_fmt yuva420p blind.webm\`
   and the same for \`fan_%03d.png\` → \`fan.webm\`.

## Stock picture-elements (no custom card)

Use \`image\` elements with \`state_image\` pointing at key frames
(\`blind_000\` open, \`blind_${String(BLIND_FRAME_COUNT - 1).padStart(3, "0")}\` closed,
\`fan_000\` off). Continuous position/speed needs the custom cards above.

Credentials are never included in this package.
`;

  files.push({
    path: "animations/README.md",
    content: new TextEncoder().encode(readme),
  });

  return {
    files,
    blind: {
      frameCount: BLIND_FRAME_COUNT,
      pngPathPrefix: `${ANIMATION_LOCAL_ROOT}/blind_`,
      stateImages: {
        open: localUrl(frameName("blind", 0)),
        closed: localUrl(frameName("blind", BLIND_FRAME_COUNT - 1)),
        opening: localUrl(frameName("blind", midBlind)),
        closing: localUrl(frameName("blind", midBlind)),
      },
    },
    fan: {
      frameCount: FAN_FRAME_COUNT,
      pngPathPrefix: `${ANIMATION_LOCAL_ROOT}/fan_`,
      stateImages: {
        on: localUrl(frameName("fan", 2)),
        off: localUrl(frameName("fan", 0)),
      },
      playMap: [
        [0, 0],
        [25, 0.5],
        [50, 1.0],
        [75, 1.5],
        [100, 2.0],
      ],
    },
    readme,
  };
}
