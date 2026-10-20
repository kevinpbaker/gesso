import { BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { Button, LazyList } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

const ROW = 26;

/** A plain row: its number, so a gap, a repeat or a blank is plain to see. */
function numbered(index: number) {
  return (
    <row height={ROW} paddingLeft={10} paddingRight={10} y="center">
      <text fontSize={13}>{`Row ${(index + 1).toLocaleString('en-US')}`}</text>
    </row>
  );
}

function chosenLine(count: number, index: number): string {
  return `${count.toLocaleString('en-US')} rows. Chosen: ${index < 0 ? 'nothing' : `row ${(index + 1).toLocaleString('en-US')}`}`;
}

/** A list of `count` numbered rows, with its choice read back in a line. */
function Numbered(inputs: Inputs<{ count: number; hover?: boolean; flush?: boolean }>, _ctx: ComponentContext) {
  const count = inputs.count.value;
  const chosen = internalState(-1);
  const opened = internalState('nothing');
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <LazyList
        label="Rows"
        count={count}
        item={numbered}
        estimatedItemExtent={ROW}
        flexGrow={1}
        minHeight={0}
        hover={inputs.hover.value}
        flush={inputs.flush.value}
        selectedIndex={chosen}
        onSelect={index => (chosen.value = index)}
        onActivate={index => (opened.value = `row ${index + 1}`)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {chosen.pipe(map(index => chosenLine(count, index)))}
      </text>
      <text textStyle="bodySmall" color="textMuted">
        {opened.pipe(map(row => `Enter opened: ${row}`))}
      </text>
    </column>
  );
}

const PAGE = 50;

/**
 * Rows fetched a page at a time, after a delay. Every `failEvery`th
 * page fails until it is retried. Each row shows a placeholder until its
 * page settles, then its text, in place.
 */
function Paged(inputs: Inputs<{ delayMs: number; failEvery?: number }>, ctx: ComponentContext) {
  const delay = inputs.delayMs.value;
  const failEvery = inputs.failEvery.value ?? 0;
  const pages = new Map<number, BehaviorSubject<'loading' | 'failed' | 'loaded'>>();
  const retried = new Set<number>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  const requests = internalState(0);
  const failed = internalState(0);
  const chosen = internalState(-1);
  ctx.onUnmount(() => timers.forEach(clearTimeout));

  const load = (page: number, subject: BehaviorSubject<'loading' | 'failed' | 'loaded'>): void => {
    subject.next('loading');
    requests.value += 1;
    timers.push(
      setTimeout(() => {
        const fails = failEvery > 0 && page % failEvery === failEvery - 1 && !retried.has(page);
        if (fails) {
          failed.value += 1;
        }
        subject.next(fails ? 'failed' : 'loaded');
      }, delay)
    );
  };
  const pageOf = (page: number) => {
    let subject = pages.get(page);
    if (subject === undefined) {
      subject = new BehaviorSubject<'loading' | 'failed' | 'loaded'>('loading');
      pages.set(page, subject);
      load(page, subject);
    }
    return subject;
  };
  const retry = (): void => {
    pages.forEach((subject, page) => {
      if (subject.value === 'failed') {
        retried.add(page);
        failed.value -= 1;
        load(page, subject);
      }
    });
  };

  const item = (index: number) => {
    const page = Math.floor(index / PAGE);
    const status = pageOf(page);
    return (
      <row height={ROW} paddingLeft={10} paddingRight={10} y="center">
        <text
          fontSize={13}
          color={status.pipe(map(now => (now === 'failed' ? 'danger' : now === 'loading' ? 'textMuted' : 'text')))}>
          {status.pipe(
            map(now =>
              now === 'loaded'
                ? `Row ${index + 1}`
                : now === 'failed'
                  ? `Rows ${page * PAGE + 1}–${(page + 1) * PAGE} failed to load`
                  : 'Loading…'
            )
          )}
        </text>
      </row>
    );
  };

  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <LazyList
        label="Fetched rows"
        count={10000}
        item={item}
        estimatedItemExtent={ROW}
        flexGrow={1}
        minHeight={0}
        selectedIndex={chosen}
        onSelect={index => (chosen.value = index)}
      />
      {failEvery > 0 ? <Button label="Retry failed pages" size="small" variant="outlined" onClick={retry} /> : null}
      <text textStyle="bodySmall" color="textMuted">
        {combineLatest([requests, failed, chosen]).pipe(
          map(
            ([made, failing, index]) =>
              `${made} page requests, ${failing} failed. Chosen: ${index < 0 ? 'nothing' : `row ${index + 1}`}`
          )
        )}
      </text>
    </column>
  );
}

/** Grows by thirty rows each time the last one is reached, up to three hundred. */
function Growing(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const STEP = 30;
  const LIMIT = 300;
  const count = internalState(STEP + 1);
  let loading = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  ctx.onUnmount(() => {
    if (timer !== null) clearTimeout(timer);
  });
  const more = (): void => {
    if (loading) return;
    loading = true;
    timer = setTimeout(() => {
      loading = false;
      const rows = count.value - 1 + STEP;
      // The extra row at the end is the "Loading more" or "The end" line.
      count.value = Math.min(LIMIT, rows) + 1;
    }, 800);
  };
  const item = (index: number) => {
    const last = index === count.value - 1;
    if (last && count.value - 1 < LIMIT) {
      more();
    }
    return (
      <row height={ROW} paddingLeft={10} paddingRight={10} y="center">
        <text fontSize={13} color={last ? 'textMuted' : 'text'}>
          {last ? (count.value - 1 < LIMIT ? 'Loading more…' : 'The end') : `Row ${index + 1}`}
        </text>
      </row>
    );
  };
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <LazyList
        label="Growing"
        count={count}
        revision={count}
        item={item}
        estimatedItemExtent={ROW}
        flexGrow={1}
        minHeight={0}
      />
      <text textStyle="bodySmall" color="textMuted">
        {count.pipe(map(rows => `${rows - 1} rows loaded`))}
      </text>
    </column>
  );
}

const WORDS =
  'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly and a wizard’s job is to vex chumps quickly in fog.'.split(
    ' '
  );

/** Rows of one to five lines, against an estimate of one. */
function Uneven(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const chosen = internalState(-1);
  const item = (index: number) => {
    const words = 4 + ((index * 13) % 5) * 9;
    const text = Array.from({ length: words }, (_, at) => WORDS[(index + at) % WORDS.length]).join(' ');
    return (
      <column paddingLeft={10} paddingRight={10} paddingTop={6} paddingBottom={6} gap={2} x="stretch">
        <text fontSize={12} fontWeight={600}>{`Row ${index + 1}`}</text>
        <text fontSize={12} textWrap="word">
          {text}
        </text>
      </column>
    );
  };
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <LazyList
        label="Uneven rows"
        count={2000}
        item={item}
        estimatedItemExtent={ROW}
        flexGrow={1}
        minHeight={0}
        selectedIndex={chosen}
        onSelect={index => (chosen.value = index)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {chosen.pipe(map(index => chosenLine(2000, index)))}
      </text>
    </column>
  );
}

/** A choice written from outside, followed by a scroll because `revealSelected` is on. */
function Revealing(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const chosen = internalState(-1);
  const reversed = internalState(false);
  const COUNT = 10000;
  const item = (index: number) => (
    <row height={ROW} paddingLeft={10} paddingRight={10} y="center">
      <text fontSize={13}>{`Event ${reversed.value ? COUNT - index : index + 1}`}</text>
    </row>
  );
  return (
    <column gap={8} width={percent(100)} height={percent(100)}>
      <LazyList
        label="Events"
        count={COUNT}
        item={item}
        revision={reversed}
        estimatedItemExtent={ROW}
        flexGrow={1}
        minHeight={0}
        revealSelected
        selectedIndex={chosen}
        onSelect={index => (chosen.value = index)}
      />
      <row gap={6} flexWrap="wrap">
        <Button label="Choose 5,000" size="small" variant="outlined" onClick={() => (chosen.value = 4999)} />
        <Button label="Choose 3" size="small" variant="outlined" onClick={() => (chosen.value = 2)} />
        <Button label="Reverse" size="small" variant="outlined" onClick={() => (reversed.value = !reversed.value)} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {combineLatest([chosen, reversed]).pipe(
          map(
            ([index, back]) =>
              `${back ? 'Newest first' : 'Oldest first'}. Chosen index: ${index < 0 ? 'none' : index.toLocaleString('en-US')}`
          )
        )}
      </text>
    </column>
  );
}

export const lazyListFixture: WorkbenchFixture = {
  id: 'lazy-list',
  name: 'LazyList',
  source: 'packages/components/src/LazyList.ts',
  states: [
    {
      name: '100,000 rows',
      try: 'Fling the wheel and drag the scrollbar end to end. Row numbers always count up by one: no blank rows, no repeats, no row drawn over another. Click a row, then End: row 100,000 is chosen and in view. Page Up moves ten rows.',
      width: 320,
      height: 340,
      stretch: true,
      render: () => <Numbered count={100000} />
    },
    {
      name: 'No rows',
      try: 'An empty framed box. Click it, then press Down, Home, End and Enter: the line stays at "Chosen: nothing" for every key.',
      width: 320,
      height: 200,
      stretch: true,
      render: () => <Numbered count={0} />
    },
    {
      name: 'One row',
      try: 'Down, Up, Page Down, Home and End all leave row 1 chosen; nothing tries to choose a row 2.',
      width: 320,
      height: 200,
      stretch: true,
      render: () => <Numbered count={1} />
    },
    {
      name: 'Slow pages',
      try: 'Rows say Loading… for about a second and then fill in place, fifty at a time. Scroll fast to the middle: placeholders appear immediately, fill in where they are, and the list never jumps when they do. The request count grows only as new pages scroll into view.',
      width: 320,
      height: 340,
      stretch: true,
      render: () => <Paged delayMs={1200} />
    },
    {
      name: 'Failing pages',
      try: 'Every third page of fifty turns red after half a second. Press Retry failed pages: those rows go back to Loading… and then fill in, and the failed count drops to 0. Rows that loaded never flicker.',
      width: 320,
      height: 380,
      stretch: true,
      render: () => <Paged delayMs={500} failEvery={3} />
    },
    {
      name: 'Grows at the end',
      try: 'Scroll to the bottom: a "Loading more…" row shows, then thirty more rows arrive below it without the list jumping back to the top. Keep going until it reads "The end" at 300.',
      width: 320,
      height: 340,
      stretch: true,
      render: () => <Growing />
    },
    {
      name: 'Rows of uneven height',
      try: 'Rows are one to five lines tall against an estimate of one. Scroll fast both ways: rows never overlap or leave gaps, and the scrollbar does not jump wildly. End shows the last row in full, not cut off by the bottom edge.',
      width: 320,
      height: 360,
      stretch: true,
      render: () => <Uneven />
    },
    {
      name: 'Hover, flush',
      try: 'No frame or background of its own. Rows light up under the pointer and go dark when it leaves the list. The chosen row keeps the selection colour while hovered. Tab onto it: the focus ring still shows.',
      width: 320,
      height: 300,
      stretch: true,
      render: () => <Numbered count={200} hover flush />
    },
    {
      name: 'Chosen from outside',
      try: 'Choose 5,000: the list scrolls to Event 5000, highlighted. Choose 3: back up. Reverse: the same position stays highlighted while its label changes, and the list does not scroll by itself.',
      width: 320,
      height: 380,
      stretch: true,
      render: () => <Revealing />
    }
  ]
};
