/**
 * What a resize costs: re-wrapping every paragraph on a screen while a
 * window edge is dragged.
 *
 * `bench-frame.ts` measures a full layout pass once, at one width. This
 * measures the pass a window resize actually runs, many times over, at
 * widths that change by a few pixels a frame the way a dragged edge
 * does. The tree is a scrolling column of cards, each a title, a body
 * paragraph of a length drawn from a fixed distribution, and a row of
 * two short captions, so that what is re-wrapped is prose of every
 * length a real screen has rather than one paragraph repeated.
 *
 * Each step does exactly what `GessoRuntime.resize` does: one full
 * `engine.layout(root, Constraints.loose(width, height))`. The sweep
 * runs the width up and back down, and then repeats the whole sweep,
 * because a return leg and a second pass are where a cache keyed on
 * the request (see `decisions/0065`) could answer from memory. What is
 * reported for each sweep is the distribution of the step times, the
 * share of each step spent inside the text measurer (which is the
 * re-wrap itself, key build and cache lookup included), how many
 * paragraph layouts the cache answered, and how many steps went over
 * the budget.
 *
 * The budget is 16 ms a step, the frame the profiler in
 * `decisions/0046` scales to. L7's budgets are counts with a timing
 * ceiling an order of magnitude over the reading, and none of them
 * resizes a paragraph, so there is no closer convention to borrow.
 *
 *   pnpm bench:rewrap
 *   BENCH_PARAGRAPHS=50 pnpm bench:rewrap
 *   BENCH_STEP=1 BENCH_SWEEPS=2 pnpm bench:rewrap
 *
 * Text is measured in the Ahem metrics the conformance fixtures use
 * (every glyph one em wide), so this runs under Node with no browser
 * and the widths are the ones the layout specs already agree with
 * Chrome on. What it cannot measure is `measureText` itself; see the
 * decision record for what that leaves out.
 *
 * Numbers are wall-clock milliseconds on the machine that runs it, so
 * they compare a change against its own baseline, not against another
 * machine's.
 */
import { CharacterCountTextMeasurer } from '../packages/core/src/layout/TextMeasurer.ts';
import type { FontMetrics, ParagraphLayout, TextMeasureRequest } from '../packages/core/src/layout/TextMeasurer.ts';
import { Constraints } from '../packages/core/src/layout/LayoutTypes.ts';
import { LayoutEngine } from '../packages/core/src/layout/LayoutEngine.ts';
import { UiGraph } from '../packages/core/src/graph/UiGraph.ts';
import { UiNodeType } from '../packages/core/src/graph/UiNodeType.ts';
import { lightTheme } from '../packages/core/src/environment/UiTheme.ts';
import type { UiNode } from '../packages/core/src/graph/UiNode.ts';

const PARAGRAPH_COUNTS =
  process.env.BENCH_PARAGRAPHS === undefined ? [50, 500] : [Number(process.env.BENCH_PARAGRAPHS)];
const FROM = Number(process.env.BENCH_FROM ?? '320');
const TO = Number(process.env.BENCH_TO ?? '1280');
const STEP = Number(process.env.BENCH_STEP ?? '8');
const SWEEPS = Number(process.env.BENCH_SWEEPS ?? '3');
const BUDGET_MS = Number(process.env.BENCH_BUDGET_MS ?? '16');
const VIEWPORT_HEIGHT = 800;

// ---------------------------------------------------------------------------
// The measurer, instrumented
// ---------------------------------------------------------------------------

/**
 * The fixture measurer, counting and timing its paragraph layouts.
 *
 * `layout` is the whole of what the engine asks for a text node, so
 * its time is the time the pass spends on text. A miss is counted from
 * `fontMetrics`, which `layoutParagraph` calls exactly once for a
 * paragraph without runs and the cache never calls at all, so the
 * counters come from the measurer as shipped rather than from a
 * counter added to it.
 */
class TimedMeasurer extends CharacterCountTextMeasurer {
  calls = 0;
  misses = 0;
  ms = 0;

  constructor() {
    // Ahem: every glyph one em wide, which is the font the layout and
    // text conformance fixtures were rendered by Chrome in.
    super({ glyphWidth: 1 });
  }

  override layout(request: TextMeasureRequest): ParagraphLayout {
    const start = performance.now();
    const paragraph = super.layout(request);
    this.ms += performance.now() - start;
    this.calls++;
    return paragraph;
  }

  override fontMetrics(request: TextMeasureRequest): FontMetrics {
    this.misses++;
    return super.fontMetrics(request);
  }

  reset(): void {
    this.calls = 0;
    this.misses = 0;
    this.ms = 0;
  }
}

// ---------------------------------------------------------------------------
// The prose
// ---------------------------------------------------------------------------

/** A small deterministic generator, so every run wraps the same text. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = (
  'the a of and to in that it was for on are with as his they be at one have this from or had by ' +
  'word but not what all were we when your can said there use an each which she do how their if will ' +
  'up other about out many then them these so some her would make like him into time has look two more ' +
  'write go see number no way could people my than first water been call who oil its now find long down ' +
  'day did get come made may part paragraph layout window measure column width resize edge drag frame'
).split(' ');

interface Prose {
  title: string;
  body: string;
  author: string;
  date: string;
}

/**
 * Prose of the lengths a screen of cards actually has: two in five are
 * a sentence, two in five a short paragraph, and one in five runs to
 * several paragraphs with hard breaks between them.
 */
function prose(random: () => number, index: number): Prose {
  const word = (): string => WORDS[Math.floor(random() * WORDS.length)];
  const sentence = (): string => {
    const length = 6 + Math.floor(random() * 9);
    const words: string[] = [];
    for (let i = 0; i < length; i++) {
      words.push(word());
    }
    words[0] = words[0][0].toUpperCase() + words[0].slice(1);
    return `${words.join(' ')}.`;
  };
  const paragraph = (sentences: number): string => {
    const out: string[] = [];
    for (let i = 0; i < sentences; i++) {
      out.push(sentence());
    }
    return out.join(' ');
  };
  const shape = random();
  let body: string;
  if (shape < 0.4) {
    body = sentence();
  } else if (shape < 0.8) {
    body = paragraph(2 + Math.floor(random() * 3));
  } else {
    const paragraphs: string[] = [];
    const count = 2 + Math.floor(random() * 2);
    for (let i = 0; i < count; i++) {
      paragraphs.push(paragraph(3 + Math.floor(random() * 4)));
    }
    body = paragraphs.join('\n');
  }
  return {
    title: `${word()} ${word()} ${word()} ${word()} ${index}`,
    body,
    author: `${word()} ${word()}`,
    date: `${1 + Math.floor(random() * 28)} September`
  };
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

interface Screen {
  root: UiNode;
  nodes: number;
  texts: number;
  characters: number;
}

/**
 * A page holding a scroller of cards. The root has no size of its own,
 * so it takes the loose viewport it is laid out in, which is what a
 * real application's root does and why a resize reaches every card.
 */
function buildScreen(paragraphs: number): Screen {
  const graph = new UiGraph();
  const random = seeded(0x5eed + paragraphs);
  const root = graph.createNode('page', UiNodeType.Column);
  root.setProperty('theme', lightTheme);
  const list = graph.createNode('feed', UiNodeType.ScrollView);
  list.setProperty('flex', 1);
  graph.appendChild(root, list);
  let nodes = 2;
  let texts = 0;
  let characters = 0;
  for (let i = 0; i < paragraphs; i++) {
    const text = prose(random, i);
    const card = graph.createNode(`card-${i}`, UiNodeType.Column);
    card.setProperty('padding', 16);
    card.setProperty('gap', 8);
    card.setProperty('backgroundColor', '#ffffff');
    card.setProperty('borderRadius', 12);
    graph.appendChild(list, card);

    const title = graph.createNode(`title-${i}`, UiNodeType.Text);
    title.setProperty('text', text.title);
    title.setProperty('fontSize', 18);
    title.setProperty('lineHeight', 24);
    title.setProperty('maxLines', 1);
    title.setProperty('textOverflow', 'ellipsis');
    title.setProperty('color', '#16181d');
    graph.appendChild(card, title);

    const body = graph.createNode(`body-${i}`, UiNodeType.Text);
    body.setProperty('text', text.body);
    body.setProperty('fontSize', 14);
    body.setProperty('lineHeight', 20);
    body.setProperty('color', '#3a3f48');
    graph.appendChild(card, body);

    const meta = graph.createNode(`meta-${i}`, UiNodeType.Row);
    meta.setProperty('gap', 12);
    graph.appendChild(card, meta);
    const author = graph.createNode(`author-${i}`, UiNodeType.Text);
    author.setProperty('text', text.author);
    author.setProperty('fontSize', 12);
    author.setProperty('color', '#6f675c');
    graph.appendChild(meta, author);
    const date = graph.createNode(`date-${i}`, UiNodeType.Text);
    date.setProperty('text', text.date);
    date.setProperty('fontSize', 12);
    date.setProperty('color', '#6f675c');
    graph.appendChild(meta, date);

    nodes += 6;
    texts += 4;
    characters += text.title.length + text.body.length + text.author.length + text.date.length;
  }
  graph.propagateEnvironment(root);
  return { root, nodes, texts, characters };
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

/** The widths a drag from FROM to TO and back visits, in order. */
function widths(): number[] {
  const out: number[] = [];
  for (let w = FROM; w <= TO; w += STEP) {
    out.push(w);
  }
  for (let w = TO - STEP; w >= FROM; w -= STEP) {
    out.push(w);
  }
  return out;
}

interface StepReading {
  width: number;
  ms: number;
  paragraphMs: number;
  calls: number;
  misses: number;
  measured: number;
}

interface SweepSummary {
  steps: number;
  median: number;
  p95: number;
  max: number;
  mean: number;
  paragraphShare: number;
  hitRate: number;
  callsPerStep: number;
  measuredPerStep: number;
  overBudget: number;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.min(sorted.length - 1, low + 1);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function summarise(readings: readonly StepReading[]): SweepSummary {
  const times = readings.map(r => r.ms).sort((a, b) => a - b);
  let total = 0;
  let paragraph = 0;
  let calls = 0;
  let misses = 0;
  let measured = 0;
  let overBudget = 0;
  for (const reading of readings) {
    total += reading.ms;
    paragraph += reading.paragraphMs;
    calls += reading.calls;
    misses += reading.misses;
    measured += reading.measured;
    if (reading.ms > BUDGET_MS) {
      overBudget++;
    }
  }
  return {
    steps: readings.length,
    median: quantile(times, 0.5),
    p95: quantile(times, 0.95),
    max: times[times.length - 1] ?? 0,
    mean: total / readings.length,
    paragraphShare: total === 0 ? 0 : paragraph / total,
    hitRate: calls === 0 ? 0 : (calls - misses) / calls,
    callsPerStep: calls / readings.length,
    measuredPerStep: measured / readings.length,
    overBudget
  };
}

/** One sweep: every width in order, one full layout at each. */
function sweep(
  engine: LayoutEngine,
  measurer: TimedMeasurer,
  root: UiNode,
  sequence: readonly number[]
): StepReading[] {
  const readings: StepReading[] = [];
  for (const width of sequence) {
    measurer.reset();
    const start = performance.now();
    engine.layout(root, Constraints.loose(width, VIEWPORT_HEIGHT));
    const ms = performance.now() - start;
    readings.push({
      width,
      ms,
      paragraphMs: measurer.ms,
      calls: measurer.calls,
      misses: measurer.misses,
      measured: engine.stats.measured
    });
  }
  return readings;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function ms(value: number): string {
  return `${value.toFixed(2)} ms`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function row(cells: readonly string[], widthsOf: readonly number[]): string {
  return '  ' + cells.map((cell, i) => (i === 0 ? cell.padEnd(widthsOf[i]) : cell.padStart(widthsOf[i]))).join('  ');
}

const COLUMNS = [12, 10, 10, 10, 10, 11, 10, 11, 9, 8];
const HEADER = ['sweep', 'median', 'p95', 'max', 'mean', 'paragraph', 'cache', 'layout()', 'measured', 'over'];

function report(paragraphs: number): boolean {
  const screen = buildScreen(paragraphs);
  const measurer = new TimedMeasurer();
  const engine = new LayoutEngine(measurer);
  const sequence = widths();
  console.log(
    `\n${paragraphs} paragraphs: ${screen.nodes} nodes, ${screen.texts} text nodes, ${screen.characters} characters; ` +
      `${FROM} to ${TO} px and back in ${STEP} px steps, ${sequence.length} steps a sweep; budget ${BUDGET_MS} ms a step\n`
  );
  console.log(row(HEADER, COLUMNS));
  console.log(
    row(
      ['', 'per step', 'per step', 'per step', 'per step', 'share', 'hit rate', 'per step', 'per step', 'budget'],
      COLUMNS
    )
  );
  // The first layout at the first width is a mount, not a resize; it
  // also lets the JIT see every shape before anything is timed.
  engine.layout(screen.root, Constraints.loose(FROM, VIEWPORT_HEIGHT));
  let worst = 0;
  const legs: string[] = [];
  for (let i = 0; i < SWEEPS; i++) {
    const readings = sweep(engine, measurer, screen.root, sequence);
    const half = Math.ceil(sequence.length / 2);
    const whole = summarise(readings);
    const out = summarise(readings.slice(0, half));
    const back = summarise(readings.slice(half));
    worst = Math.max(worst, whole.max);
    const label = i === 0 ? '1 (cold)' : `${i + 1}`;
    console.log(
      row(
        [
          label,
          ms(whole.median),
          ms(whole.p95),
          ms(whole.max),
          ms(whole.mean),
          percent(whole.paragraphShare),
          percent(whole.hitRate),
          whole.callsPerStep.toFixed(0),
          whole.measuredPerStep.toFixed(0),
          `${whole.overBudget}/${whole.steps}`
        ],
        COLUMNS
      )
    );
    legs.push(
      `  sweep ${i + 1}: widening ${ms(out.median)} median, cache ${percent(out.hitRate)}; ` +
        `narrowing ${ms(back.median)} median, cache ${percent(back.hitRate)}`
    );
  }
  console.log('');
  for (const leg of legs) {
    console.log(leg);
  }
  console.log(`  paragraphs remembered by the measurer at the end: ${measurer.cachedParagraphs}`);
  const verdict = worst <= BUDGET_MS ? 'within' : 'over';
  console.log(`  worst step ${ms(worst)}: ${verdict} the ${BUDGET_MS} ms budget`);
  return worst <= BUDGET_MS;
}

console.log(`\nre-wrap benchmarks: a resize sweep over a screen of cards, ${SWEEPS} sweeps each`);
let allWithin = true;
for (const paragraphs of PARAGRAPH_COUNTS) {
  allWithin = report(paragraphs) && allWithin;
}
console.log('');
if (!allWithin) {
  console.log(`at least one step went over ${BUDGET_MS} ms; see the tables above\n`);
}
