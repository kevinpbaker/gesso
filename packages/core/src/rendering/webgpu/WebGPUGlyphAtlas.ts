/**
 * The glyph atlas: one texture holding many glyphs, in place of one
 * texture per text run.
 *
 * A run-per-texture cache is bounded by the number of distinct runs,
 * which for a document view is the number of distinct lines — it has
 * no ceiling. A glyph cache is bounded by the number of distinct
 * glyphs a font is drawn at, which is a few hundred. The atlas is
 * what makes text memory a property of the fonts in use rather than
 * of how much text there is.
 *
 * Two halves, split so the packing is testable without a GPU:
 *
 * - **This file is pure CPU.** It packs cells into pages and hands
 *   back a slot with the page index and the UV rectangle. Nothing
 *   here touches a device, a canvas or a texture, so the render-list
 *   builder can ask for slots inside vitest.
 * - **`WebGPUGlyphPages`** owns the GPU textures. It drains
 *   `takePending()` after each build and rasterises those glyphs into
 *   their cells.
 *
 * Cells are rasterised **in the run's colour**, not white-and-tinted.
 * Tinting would key the atlas on the glyph alone, but it also flattens
 * a colour emoji into a silhouette and forces a premultiplication
 * decision the rest of the pipeline does not make. Colour is instead
 * part of the key: an application draws text in a handful of colours,
 * so this multiplies the entry count by a small constant and keeps
 * the sampled pixels exactly what Canvas2D would have drawn.
 */

/**
 * Horizontal subpixel positions a glyph is rasterised at.
 *
 * A cell maps one-to-one onto physical pixels, so its left edge has to
 * land on a whole pixel; the fraction of a pixel the pen actually sits
 * at is baked into the raster instead. Three phases keep the spacing
 * error under a third of a physical pixel, which at any device pixel
 * ratio is below what the eye resolves in a line of text. One phase
 * (plain rounding) is visibly uneven at dpr 1.
 */
export const GLYPH_SUBPIXEL_PHASES = 3;

/**
 * Cell extents around the pen, in em.
 *
 * Generous rather than measured: the tight ink box of a glyph is only
 * known once it is rasterised, and allocation happens a step earlier,
 * in the builder. These cover the ascenders, descenders and side
 * bearings of any UI font — Chrome reports roughly 0.97 em of ascent
 * and 0.24 em of descent for the default system font — at the cost of
 * some empty space per cell. Tightening them needs font metrics at
 * allocation time; see the decision record.
 */
const GLYPH_ASCENT_EM = 1.1;
const GLYPH_DESCENT_EM = 0.4;
const GLYPH_SIDE_EM = 0.2;

/** Physical-pixel edge of one atlas page. */
const DEFAULT_PAGE_SIZE = 1024;

/**
 * Pages kept before the least recently used is cleared. Eight pages of
 * 1024² RGBA is 32 MB, half what the run-texture cache budgeted.
 */
const DEFAULT_MAX_PAGES = 8;

/**
 * One font, colour and device pixel ratio, with the cells already
 * allocated for it.
 *
 * A run resolves its style once and then looks each cluster up by
 * string in this map. Keying the atlas on a single composite string
 * instead would build one key per glyph per frame — the frame loop's
 * largest allocation, for a value that is constant across a run.
 */
export interface GlyphStyle {
  readonly font: string;
  readonly color: string;
  readonly fontSize: number;
  readonly dpr: number;
  /** Cluster to its cell per subpixel phase; null where it cannot be packed. */
  readonly cells: Map<string, (GlyphSlot | null)[]>;
}

/** A cell in a page, and where the glyph sits inside it. */
export interface GlyphSlot {
  page: number;
  /** UV rectangle of the cell within its page. */
  u: number;
  v: number;
  uw: number;
  vh: number;
  /** Cell size in logical pixels; physical is this × dpr. */
  width: number;
  height: number;
  /** Cell top-left relative to the pen (left edge, baseline), logical. */
  offsetX: number;
  offsetY: number;
}

/** A newly allocated cell, waiting for its pixels. */
export interface GlyphUpload {
  slot: GlyphSlot;
  cluster: string;
  font: string;
  color: string;
  dpr: number;
  /** Cell origin in the page, physical pixels. */
  pageX: number;
  pageY: number;
  /** Cell size in physical pixels. */
  pixelWidth: number;
  pixelHeight: number;
  /** Pen position inside the cell, physical pixels; the phase is in it. */
  penX: number;
  penY: number;
}

interface Page {
  /** Next free x on the current shelf. */
  penX: number;
  /** Top of the current shelf. */
  shelfY: number;
  /** Height of the current shelf. */
  shelfHeight: number;
  /** Frame this page was last drawn from. */
  lastUsed: number;
}

export interface GlyphAtlasOptions {
  /** Physical-pixel edge of a page. Default 1024. */
  pageSize?: number;
  /** Pages kept before the least recently used is cleared. Default 8. */
  maxPages?: number;
}

/**
 * Shelf-packed glyph cells across a small number of fixed-size pages.
 *
 * Shelf packing — fill a row left to right, start a new row when the
 * widest cell in the current one is passed — wastes a little height
 * per row and is right for glyphs, which arrive in a narrow range of
 * heights. A page that fills opens the next one; when every page is
 * full the least recently used is cleared wholesale and re-filled on
 * demand, which is cheap because the glyphs still on screen are
 * re-rasterised within a frame or two and everything else was cold.
 */
export class WebGPUGlyphAtlas {
  private readonly styles = new Map<string, GlyphStyle>();
  private readonly pages: Page[] = [];
  private pending: GlyphUpload[] = [];
  private frame = 0;
  private cells = 0;
  /** Pages cleared since the last drain, so the GPU side can zero them. */
  private clearedPages: number[] = [];
  readonly pageSize: number;
  readonly maxPages: number;

  constructor(options: GlyphAtlasOptions = {}) {
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Cells allocated across every style and page. */
  get glyphCount(): number {
    return this.cells;
  }

  /** Marks the start of a frame, for page use tracking. */
  beginFrame(): void {
    this.frame++;
  }

  /** The style handle a run looks its clusters up in; created on first sight. */
  styleFor(font: string, color: string, fontSize: number, dpr: number): GlyphStyle {
    const key = `${font}\0${color}\0${dpr}`;
    let style = this.styles.get(key);
    if (style === undefined) {
      style = { font, color, fontSize, dpr, cells: new Map() };
      this.styles.set(key, style);
    }
    return style;
  }

  /**
   * The cell for one glyph, allocating and queueing it for upload on
   * first sight. Null when the cluster cannot fit a page at all.
   */
  slotFor(style: GlyphStyle, cluster: string, advance: number, phase: number): GlyphSlot | null {
    let phases = style.cells.get(cluster);
    if (phases === undefined) {
      phases = Array.from<GlyphSlot | null>({ length: GLYPH_SUBPIXEL_PHASES }).fill(null);
      style.cells.set(cluster, phases);
    } else {
      const existing = phases[phase];
      if (existing !== null) {
        this.pages[existing.page].lastUsed = this.frame;
        return existing;
      }
    }

    const dpr = style.dpr;
    // Padding is a whole number of physical pixels so that the cell's
    // left edge stays on a pixel when the pen does.
    const sidePx = Math.max(1, Math.ceil(style.fontSize * GLYPH_SIDE_EM * dpr));
    const ascentPx = Math.max(1, Math.ceil(style.fontSize * GLYPH_ASCENT_EM * dpr));
    const descentPx = Math.max(1, Math.ceil(style.fontSize * GLYPH_DESCENT_EM * dpr));
    const pixelWidth = Math.ceil(advance * dpr) + 2 * sidePx;
    const pixelHeight = ascentPx + descentPx;
    if (pixelWidth > this.pageSize || pixelHeight > this.pageSize) {
      return null;
    }

    const placed = this.place(pixelWidth, pixelHeight);
    if (placed === null) {
      return null;
    }
    const slot: GlyphSlot = {
      page: placed.page,
      u: placed.x / this.pageSize,
      v: placed.y / this.pageSize,
      uw: pixelWidth / this.pageSize,
      vh: pixelHeight / this.pageSize,
      width: pixelWidth / dpr,
      height: pixelHeight / dpr,
      offsetX: -sidePx / dpr,
      offsetY: -ascentPx / dpr
    };
    phases[phase] = slot;
    this.cells++;
    this.pending.push({
      slot,
      cluster,
      font: style.font,
      color: style.color,
      dpr,
      pageX: placed.x,
      pageY: placed.y,
      pixelWidth,
      pixelHeight,
      penX: sidePx + phase / GLYPH_SUBPIXEL_PHASES,
      penY: ascentPx
    });
    return slot;
  }

  /** Cells allocated since the last call, for the GPU side to fill. */
  takePending(): GlyphUpload[] {
    if (this.pending.length === 0) {
      return [];
    }
    const pending = this.pending;
    this.pending = [];
    return pending;
  }

  /** Pages cleared since the last call, whose textures must be zeroed. */
  takeCleared(): number[] {
    if (this.clearedPages.length === 0) {
      return [];
    }
    const cleared = this.clearedPages;
    this.clearedPages = [];
    return cleared;
  }

  /** Drops every glyph and every page. */
  reset(): void {
    this.styles.clear();
    this.pages.length = 0;
    this.pending = [];
    this.clearedPages = [];
    this.cells = 0;
  }

  /**
   * Finds room for a cell: on the current shelf of an existing page,
   * on a new shelf, on a new page, or — when every page is full — on
   * the least recently used page after clearing it.
   */
  private place(width: number, height: number): { page: number; x: number; y: number } | null {
    for (let index = 0; index < this.pages.length; index++) {
      const spot = this.tryPlace(index, width, height);
      if (spot !== null) {
        return spot;
      }
    }
    if (this.pages.length < this.maxPages) {
      this.pages.push({ penX: 0, shelfY: 0, shelfHeight: 0, lastUsed: this.frame });
      return this.tryPlace(this.pages.length - 1, width, height);
    }
    const victim = this.leastRecentlyUsedPage();
    this.clearPage(victim);
    return this.tryPlace(victim, width, height);
  }

  private tryPlace(index: number, width: number, height: number): { page: number; x: number; y: number } | null {
    const page = this.pages[index];
    if (page.penX + width <= this.pageSize && height <= page.shelfHeight) {
      const x = page.penX;
      page.penX += width;
      page.lastUsed = this.frame;
      return { page: index, x, y: page.shelfY };
    }
    // A new shelf, either because the row is full or because this cell
    // is taller than the row was sized for.
    const shelfY = page.shelfY + page.shelfHeight;
    if (shelfY + height > this.pageSize) {
      return null;
    }
    page.shelfY = shelfY;
    page.shelfHeight = height;
    page.penX = width;
    page.lastUsed = this.frame;
    return { page: index, x: 0, y: shelfY };
  }

  private leastRecentlyUsedPage(): number {
    let victim = 0;
    for (let index = 1; index < this.pages.length; index++) {
      if (this.pages[index].lastUsed < this.pages[victim].lastUsed) {
        victim = index;
      }
    }
    return victim;
  }

  private clearPage(index: number): void {
    for (const style of this.styles.values()) {
      for (const phases of style.cells.values()) {
        for (let phase = 0; phase < phases.length; phase++) {
          if (phases[phase]?.page === index) {
            phases[phase] = null;
            this.cells--;
          }
        }
      }
    }
    this.pending = this.pending.filter(upload => upload.slot.page !== index);
    this.pages[index] = { penX: 0, shelfY: 0, shelfHeight: 0, lastUsed: this.frame };
    this.clearedPages.push(index);
  }
}

/**
 * The subpixel phase for a pen sitting `fraction` of a physical pixel
 * past a whole one.
 */
export function phaseFor(fraction: number): number {
  const phase = Math.floor(fraction * GLYPH_SUBPIXEL_PHASES);
  return Math.min(GLYPH_SUBPIXEL_PHASES - 1, Math.max(0, phase));
}
