import { map } from 'rxjs/operators';
import { combineLatest } from 'rxjs';

import type { UiChild } from 'gesso-core';
import { InspectorRow, InspectorSection, SegmentedControl, UnitField, sharedValue } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

/**
 * An inspector for two rectangles. Choose one or both: with both, the
 * fields whose values differ say Mixed, and a scrub or an arrow on one
 * of them moves each rectangle from its own value.
 */

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly weight: number;
}

type Key = keyof Rect;

// #region inspector
export function RectInspector(_inputs: Inputs<object>, _ctx: ComponentContext): UiChild {
  const rects = internalState<readonly Rect[]>([
    { x: 20, y: 40, w: 300, h: 200, weight: 1 },
    { x: 20, y: 300, w: 300, h: 120, weight: 1 }
  ]);
  const chosen = internalState<readonly number[]>([0]);

  const values = (key: Key) =>
    combineLatest([rects, chosen]).pipe(map(([all, picked]) => sharedValue(picked.map(i => all[i][key]))));
  const write = (key: Key, next: (old: number) => number) => {
    rects.value = rects.value.map((rect, i) => (chosen.value.includes(i) ? { ...rect, [key]: next(rect[key]) } : rect));
  };

  /** A field for one property: typed values set each chosen rectangle, nudges move each from its own. */
  const field = (key: Key, label: string, short: string, unit = 'mm') => {
    const shared = values(key);
    return (
      <UnitField
        label={label}
        short={short}
        unit={unit}
        units={unit === 'mm' ? { cm: 10, in: 25.4 } : undefined}
        min={key === 'w' || key === 'h' || key === 'weight' ? 0 : undefined}
        step={key === 'weight' ? 0.25 : 1}
        value={shared.pipe(map(s => s.value ?? 0))}
        mixed={shared.pipe(map(s => s.mixed))}
        flexGrow={1}
        flexBasis={0}
        onCommit={(value: number) => write(key, () => value)}
        onNudge={(delta: number) =>
          write(key, old => Math.max(key === 'x' || key === 'y' ? -Infinity : 0, old + delta))
        }
      />
    );
  };

  return (
    <column gap={16} padding={16} width={320}>
      <SegmentedControl
        label="Chosen"
        options={[
          { value: '0', label: 'Top' },
          { value: '1', label: 'Bottom' },
          { value: 'both', label: 'Both' }
        ]}
        defaultValue="0"
        onChange={(value: string) => (chosen.value = value === 'both' ? [0, 1] : [Number(value)])}
      />
      <InspectorSection title="Position and size">
        <column gap={6}>
          <InspectorRow label="Position">
            <row gap={8} flexGrow={1}>
              {field('x', 'X', 'X')}
              {field('y', 'Y', 'Y')}
            </row>
          </InspectorRow>
          <InspectorRow label="Size">
            <row gap={8} flexGrow={1}>
              {field('w', 'Width', 'W')}
              {field('h', 'Height', 'H')}
            </row>
          </InspectorRow>
        </column>
      </InspectorSection>
      <InspectorSection title="Style">
        <InspectorRow label="Line">{field('weight', 'Line weight', '≡', 'pt')}</InspectorRow>
      </InspectorSection>
    </column>
  );
}
// #endregion inspector
