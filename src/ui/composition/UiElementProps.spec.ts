import { BehaviorSubject } from 'rxjs';

import { describe, expect, expectTypeOf, it } from 'vitest';

import type { UiKeyboardEvent, UiPointerEvent } from '../input/UiInputEvent';
import { percent } from '../layout/UiLength';
import { Box, Button, Column, Grid, Row, ScrollView, Stack, Text } from './UiComponents';
import type { RowProps, TextProps } from './UiElementProps';

/**
 * The authoring types. Most of this file is checked by `tsc`, not by
 * vitest: each `@ts-expect-error` line is a compile error the types
 * must keep producing, and `pnpm build` fails if one of them stops
 * erroring. The runtime assertions only confirm that typed calls still
 * build the same elements.
 */
describe('element prop types', () => {
  it('accepts every registered property with its declared type', () => {
    const width$ = new BehaviorSubject(120);
    const element = Row(
      {
        width: width$,
        height: percent(50),
        padding: 8,
        gap: 4,
        x: 'space-between',
        y: 'center',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'primary',
        borderColor: '#333',
        color: { r: 1, g: 1, b: 1, a: 1 },
        fontWeight: '500',
        transform: { rotation: 0.2 },
        onClick: event => {
          expectTypeOf(event).toEqualTypeOf<UiPointerEvent>();
        },
        onKeyDown: event => {
          expectTypeOf(event).toEqualTypeOf<UiKeyboardEvent>();
        }
      },
      Text({ text: 'hi', maxLines: 2, textOverflow: 'ellipsis' })
    );
    expect(element.props.width).toBe(width$);
    expect(element.props.x).toBe('space-between');
  });

  it('rejects a misspelled prop', () => {
    // @ts-expect-error 'widht' is not a prop
    Row({ widht: 100 });
    // @ts-expect-error CSS's name; Nodal spells it `y`
    Column({ alignItems: 'center' });
    // @ts-expect-error a Text has no `columns`
    Text({ columns: [1] });
    // @ts-expect-error 'colour' is not a prop
    Box({ colour: 'red' });
  });

  it('rejects a value outside a property vocabulary', () => {
    // @ts-expect-error not an alignment word
    Row({ x: 'middle' });
    // @ts-expect-error not a position
    Box({ position: 'fixed' });
    // @ts-expect-error string lengths are never accepted
    Box({ width: '100%' });
    // @ts-expect-error an Observable of the wrong type
    Text({ text: new BehaviorSubject(3) });
  });

  it('rejects a wrong event handler signature', () => {
    // @ts-expect-error a click delivers a pointer event, not a keyboard event
    Button({ onClick: (event: UiKeyboardEvent) => event.key });
    // @ts-expect-error handlers must be functions
    Button({ onClick: 'save' });
    // @ts-expect-error 'onClicked' is not an event
    Box({ onClicked: () => {} });
  });

  it('types each element by what the runtime honours', () => {
    Grid({ columns: [1, percent(50)], autoFlow: 'column', justifyContent: 'space-evenly' });
    ScrollView({ direction: 'horizontal', scrollX: 20 });
    Stack({ x: 'center', y: 'end' });
    // @ts-expect-error a Row has no grid tracks
    Row({ columns: [1] });
    // @ts-expect-error `text` belongs to Text and Button
    Row({ text: 'no' });
    const props: TextProps = { text: 'ok', fontSize: 12 };
    const rowProps: RowProps = { gap: 2 };
    expect(props.text).toBe('ok');
    expect(rowProps.gap).toBe(2);
  });
});
