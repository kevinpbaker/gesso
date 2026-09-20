/**
 * Just enough WebVTT to put words under a picture.
 *
 * Here for the reason `Mp4Demuxer` is: the alternative is a dependency
 * that brings a renderer, a positioning model and a CSS cascade with
 * it, and `gesso-core` has one dependency. What a caption track is,
 * stripped of the parts that only mean something in a document, is a
 * sorted list of (start, end, text) — and that is a parse of about two
 * hundred lines rather than a library.
 *
 * **What it reads.** The `WEBVTT` header and anything on that line, an
 * optional cue identifier, a timing line with `-->` and the two
 * timestamps around it, cue settings after the timings, and the
 * payload lines until a blank one. `NOTE` blocks and `STYLE` blocks
 * are skipped. Timestamps in both the `mm:ss.mmm` and `hh:mm:ss.mmm`
 * spellings, because both are written.
 *
 * **What it does not.** Cue settings are parsed and kept but nothing
 * here acts on them: `line`, `position`, `align`, `size` and `vertical`
 * describe a placement against a video box, and placement is the
 * caller's. They are carried rather than dropped so that a caller who
 * wants them is not made to parse the file again. Inline markup —
 * `<i>`, `<b>`, `<v Speaker>`, `<00:01.000>` — is **stripped to its
 * text**, which is a decision rather than an omission: this framework
 * draws a string, a voice span would have to become a style run, and a
 * caption that showed its own angle brackets would be worse than one
 * that lost its italics. `REGION` blocks are skipped for the same
 * reason the settings are inert.
 *
 * **Errors are not thrown.** A caption file is content, usually
 * someone else's, and a single malformed cue in a hundred is not a
 * reason to show none of them. A block that cannot be read is skipped
 * and counted; `VttTrack.skipped` is how a caller finds out. That is
 * the opposite of the demuxer's rule, and deliberately so: a video
 * that will not play is a failure worth reporting, and a caption that
 * is missing a line is not.
 */

/** One caption: when it is on screen, and what it says. */
export interface VttCue {
  /** The cue's identifier, when it had one. Not required to be unique. */
  readonly id?: string;
  /** Seconds. */
  readonly start: number;
  readonly end: number;
  /** The payload with its markup stripped; newlines are kept as newlines. */
  readonly text: string;
  /**
   * The cue settings, unparsed beyond being split into pairs — `line`,
   * `position`, `align`, `size`, `vertical`. Empty for most cues.
   */
  readonly settings: Readonly<Record<string, string>>;
}

export interface VttTrack {
  /** Cues in the order they are shown, which is not always the order they were written. */
  readonly cues: readonly VttCue[];
  /** Anything after `WEBVTT` on the first line; encoders put a title or a tool name there. */
  readonly header: string;
  /** How many blocks could not be read. Zero for a well-formed file. */
  readonly skipped: number;
}

const EMPTY_SETTINGS: Readonly<Record<string, string>> = Object.freeze({});

/**
 * Reads a `.vtt` file.
 *
 * Returns an empty track rather than throwing for a file that is not
 * WebVTT at all, for the reason the docblock gives: a caption track is
 * an enhancement, and an application that has to guard every one of
 * these with a `try` will end up not showing captions at all.
 */
export function parseWebVtt(source: string): VttTrack {
  // A byte order mark survives a `fetch().text()` and would otherwise
  // sit in front of the magic word and fail the check below.
  const text = source.replace(/^﻿/, '');
  const lines = text.split(/\r\n|\r|\n/);
  const first = lines[0] ?? '';
  if (!first.startsWith('WEBVTT')) {
    return { cues: [], header: '', skipped: 0 };
  }
  const header = first.slice('WEBVTT'.length).trim();

  const cues: VttCue[] = [];
  let skipped = 0;
  let at = 1;

  while (at < lines.length) {
    // Blank lines between blocks, however many.
    while (at < lines.length && (lines[at] ?? '').trim() === '') {
      at++;
    }
    if (at >= lines.length) {
      break;
    }
    const blockStart = at;
    const block: string[] = [];
    while (at < lines.length && (lines[at] ?? '').trim() !== '') {
      block.push(lines[at]!);
      at++;
    }
    const cue = readBlock(block);
    if (cue === null) {
      // `NOTE`, `STYLE` and `REGION` are not failures — they are
      // blocks this deliberately ignores — so they must not be counted
      // against a file's health.
      if (!isIgnorableBlock(block)) {
        skipped++;
      }
    } else {
      cues.push(cue);
    }
    if (at === blockStart) {
      // A block that consumed nothing would spin here forever.
      at++;
    }
  }

  // WebVTT does not require cues to be written in order, and a file
  // that interleaves them is legal. Sorting once here means every
  // lookup afterwards can assume order — see `cueAt`.
  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return { cues, header, skipped };
}

function isIgnorableBlock(block: readonly string[]): boolean {
  const first = (block[0] ?? '').trim();
  return first === 'NOTE' || first.startsWith('NOTE ') || first === 'STYLE' || first === 'REGION';
}

function readBlock(block: readonly string[]): VttCue | null {
  if (block.length === 0 || isIgnorableBlock(block)) {
    return null;
  }
  // The timing line is either the first or the second: a cue may carry
  // an identifier above it.
  const timingIndex = block.findIndex(line => line.includes('-->'));
  if (timingIndex === -1 || timingIndex > 1) {
    return null;
  }
  const id = timingIndex === 1 ? block[0]!.trim() : undefined;
  const timing = block[timingIndex]!;
  const arrow = timing.indexOf('-->');
  const start = parseTimestamp(timing.slice(0, arrow));
  const rest = timing.slice(arrow + 3).trim();
  // The end timestamp runs to the first space; whatever follows is
  // settings.
  const space = rest.search(/\s/);
  const end = parseTimestamp(space === -1 ? rest : rest.slice(0, space));
  if (start === null || end === null || end < start) {
    return null;
  }
  const settings = space === -1 ? EMPTY_SETTINGS : parseSettings(rest.slice(space + 1));
  const payload = block.slice(timingIndex + 1);
  if (payload.length === 0) {
    return null;
  }
  return { id, start, end, text: stripMarkup(payload.join('\n')), settings };
}

/**
 * `hh:mm:ss.mmm` or `mm:ss.mmm`, into seconds.
 *
 * Null rather than NaN for anything else, so a caller cannot
 * accidentally propagate a number that compares false against
 * everything.
 */
function parseTimestamp(text: string): number | null {
  const match = /^\s*(?:(\d+):)?([0-5]\d):([0-5]\d)[.,](\d{1,3})\s*$/.exec(text);
  if (match === null) {
    return null;
  }
  const hours = match[1] === undefined ? 0 : Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  // One or two digits after the point mean tenths and hundredths, not
  // thousandths: `00:01.5` is a second and a half.
  const fraction = Number(match[4]!.padEnd(3, '0')) / 1000;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function parseSettings(text: string): Readonly<Record<string, string>> {
  const settings: Record<string, string> = {};
  for (const pair of text.split(/\s+/)) {
    const colon = pair.indexOf(':');
    if (colon <= 0) {
      continue;
    }
    settings[pair.slice(0, colon)] = pair.slice(colon + 1);
  }
  return Object.keys(settings).length === 0 ? EMPTY_SETTINGS : settings;
}

/**
 * Takes the tags out and leaves the words.
 *
 * Entities are decoded for the five WebVTT names only. There is no
 * general entity table here on purpose: the full set belongs to HTML,
 * a caption file that carries one is relying on a document context
 * this has none of, and the five below are the ones a caption actually
 * needs — a stray `<` in dialogue has to be escaped, and `&nbsp;` is
 * written by tools that think they are writing HTML.
 */
function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&lrm;|&rlm;/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * The cue to show at a position, or null between cues.
 *
 * A linear scan from a hint rather than a binary search, and that is
 * the right shape here rather than a concession: this is called once
 * per frame with a position that has almost always moved by one frame,
 * so the answer is nearly always the cue it was last time or the one
 * after it. `from` is that hint — pass back the index this returned —
 * and the scan is then O(1) for playback and O(n) only for a scrub,
 * where a caption is not what is costing anything.
 *
 * **Overlapping cues.** WebVTT permits them and a transcript of two
 * people talking over each other has them. This answers the one that
 * *starts* latest among those covering the position, which is what a
 * single-line caption should show: the newest thing said.
 */
export function cueAt(cues: readonly VttCue[], seconds: number, from = 0): { cue: VttCue | null; index: number } {
  if (cues.length === 0) {
    return { cue: null, index: 0 };
  }
  // Walk back if the position went backwards — a seek, or a loop.
  let index = Math.min(Math.max(0, from), cues.length - 1);
  while (index > 0 && cues[index]!.start > seconds) {
    index--;
  }
  let best: VttCue | null = null;
  let bestIndex = index;
  for (let n = index; n < cues.length; n++) {
    const cue = cues[n]!;
    if (cue.start > seconds) {
      break;
    }
    if (cue.end > seconds) {
      best = cue;
      bestIndex = n;
    }
  }
  // Nothing covers the position: keep the scan's starting point as the
  // hint, so the next call resumes from there rather than from zero.
  return { cue: best, index: best === null ? index : bestIndex };
}
