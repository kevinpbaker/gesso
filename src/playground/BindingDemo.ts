import { BehaviorSubject } from 'rxjs';

import { Box, Column, Row, ScrollView, Text } from '../ui/composition';
import type { UiElement } from '../ui/composition';

const SCROLL_ITEM_COUNT = 100;

const MESSAGES = ['Binding 0', 'Binding 1', 'Binding 2', 'Binding 3', 'Binding 4'];
const COLORS = ['#1f6feb', '#6f42c1', '#10b981', '#f59e0b', '#ef4444'];
const BAR_WIDTHS = [40, 80, 120, 160, 200];
const BAR_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

/**
 * Reactive data driving the binding demo. Every field is a
 * BehaviorSubject: UiGraph bindings subscribe to these and arm the
 * scheduler, so mutating them on a timer is enough to make layout
 * and paint re-run with no rebuilds.
 */
export class BindingDemoState {
  readonly message$ = new BehaviorSubject(MESSAGES[0]);
  readonly color$ = new BehaviorSubject(COLORS[0]);
  readonly barWidth$ = new BehaviorSubject(BAR_WIDTHS[0]);
  readonly barColor$ = new BehaviorSubject(BAR_COLORS[0]);
  readonly flexGrow$ = new BehaviorSubject(0);
  readonly scrollY$ = new BehaviorSubject(0);
}

/**
 * Advances every binding to its `step`-th value. Covers all four
 * binding effects: content (text), layout (width/flexGrow), paint
 * (colors) and transform (scrollY).
 */
export function advance(state: BindingDemoState, step: number): void {
  state.message$.next(MESSAGES[step % MESSAGES.length]);
  state.color$.next(COLORS[step % COLORS.length]);
  state.barWidth$.next(BAR_WIDTHS[step % BAR_WIDTHS.length]);
  state.barColor$.next(BAR_COLORS[step % BAR_COLORS.length]);
  state.flexGrow$.next(step % 2);
  state.scrollY$.next((step * 20) % 60);
}

function scrollItems(): UiElement[] {
  const items: UiElement[] = [];
  for (let i = 1; i <= SCROLL_ITEM_COUNT; i++) {
    items.push(Text({ text: `Scroll item ${i}`, color: '#d1d5db' }));
  }
  return items;
}

/**
 * A deliberately minimal scene: a bound header, a flex row with a
 * growing bar, and a scrollable list. Everything changes through
 * bindings; nothing is rebuilt while it runs.
 */
export function createBindingDefinition(state: BindingDemoState): UiElement {
  return Column(
    { padding: 24, gap: 16 },
    Text({ text: state.message$, color: state.color$, fontSize: 20 }),
    Row(
      { gap: 12, alignSelf: 'stretch' },
      Box({ width: 60, height: 40, backgroundColor: '#1f6feb', borderRadius: 4 }),
      Box({ width: state.barWidth$, height: 40, backgroundColor: state.barColor$, borderRadius: 4 }),
      Box({ flexGrow: state.flexGrow$, height: 40, backgroundColor: '#6f42c1', borderRadius: 4 })
    ),
    ScrollView(
      {
        width: 480,
        height: 120,
        scrollY: state.scrollY$,
        gap: 6,
        backgroundColor: 'rgba(16,185,129,0.06)',
        borderColor: '#10b981',
        borderWidth: 1,
        borderRadius: 6
      },
      ...scrollItems()
    )
  );
}
