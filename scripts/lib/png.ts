/**
 * Just enough PNG decoding to read a browser's screenshot.
 *
 * The Chrome scripts never decode a PNG in Node: they hand the bytes back
 * to the page, which has `createImageBitmap`. That does not work here.
 * A screenshot from a browser driven over WebDriver has to be judged by
 * the script, because the page cannot read its own canvas once the
 * render worker owns it. Browsers write 8-bit, non-interlaced RGB or
 * RGBA, so that is all this reads, and it says so when it meets
 * anything else rather than returning wrong pixels.
 */
import { inflateSync } from 'node:zlib';

export interface Pixels {
  readonly width: number;
  readonly height: number;
  /** RGBA, four bytes a pixel, rows top to bottom. */
  readonly data: Uint8Array;
}

export function decodePng(png: Uint8Array): Pixels {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  for (let at = 8; at < png.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      const bodyView = new DataView(body.buffer, body.byteOffset, body.byteLength);
      width = bodyView.getUint32(0);
      height = bodyView.getUint32(4);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      channels = colour === 6 ? 4 : colour === 2 ? 3 : 0;
      if (depth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error(`Unsupported PNG: bit depth ${depth}, colour type ${colour}, interlace ${interlace}.`);
      }
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? rows.subarray((y - 1) * stride, y * stride) : undefined;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels]! : 0;
      const b = up ? up[x]! : 0;
      const c = up && x >= channels ? up[x - channels]! : 0;
      let value = line[x]!;
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = value & 0xff;
    }
  }
  if (channels === 4) {
    return { width, height, data: rows };
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < rows.length; i += 3, j += 4) {
    data[j] = rows[i]!;
    data[j + 1] = rows[i + 1]!;
    data[j + 2] = rows[i + 2]!;
    data[j + 3] = 255;
  }
  return { width, height, data };
}

export interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * How much of a region is painted with something other than its most
 * common colour, as a fraction of its pixels.
 *
 * "Not blank" has to survive a route whose whole frame is one dark
 * background with a little text on it, and has to fail a canvas that
 * was cleared and never drawn into. The most common colour is the
 * background whatever it is; what differs from it by more than an
 * antialiasing step is something that was drawn.
 */
export function paintedFraction(pixels: Pixels, region: Region): number {
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(pixels.width, Math.ceil(region.x + region.width));
  const y1 = Math.min(pixels.height, Math.ceil(region.y + region.height));
  if (x1 <= x0 || y1 <= y0) {
    return 0;
  }
  const counts = new Map<number, number>();
  const { data, width } = pixels;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      // Quantised, so the antialiased edge of a fill does not split the background in two.
      const key = ((data[i]! >> 3) << 10) | ((data[i + 1]! >> 3) << 5) | (data[i + 2]! >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let background = 0;
  let most = 0;
  for (const [key, count] of counts) {
    if (count > most) {
      most = count;
      background = key;
    }
  }
  const br = (background >> 10) << 3;
  const bg = ((background >> 5) & 31) << 3;
  const bb = (background & 31) << 3;
  let painted = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (Math.abs(data[i]! - br) + Math.abs(data[i + 1]! - bg) + Math.abs(data[i + 2]! - bb) > 48) {
        painted++;
      }
    }
  }
  return painted / ((x1 - x0) * (y1 - y0));
}
