import { Subject } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

import { draggable, percent, scrollPosition, type DragOffset } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

/** More rows than the list is tall, so there is something to pan. */
const NOTES = ['Kettle', 'Ledger', 'Almanac', 'Compass', 'Beacon', 'Lantern', 'Anchor', 'Sextant'] as const;

/** Where a tile has been moved to, as the readout under it prints it. */
function offsetText(offset: Subject<DragOffset>) {
  return offset.pipe(
    map(where => `${Math.round(where.x)}, ${Math.round(where.y)}`),
    startWith('0, 0')
  );
}

/**
 * What one press turns into.
 *
 * A tap, a pan, a long press and a drag all come from the same press
 * sequence, and the readouts are written by ordinary handlers, so what
 * the reader sees is the recognizer's own answer rather than a
 * description of it.
 */
export function GestureSurface(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const gesture = internalState('nothing yet');
  const at = internalState(0);
  const panned = new Subject<DragOffset>();
  const held = new Subject<DragOffset>();

  // #region pad
  /**
   * One box, four handlers, and at most one of them fires per press.
   *
   * The recognizer resolves each press into a single gesture. A press
   * that moves more than eight pixels (twelve from a finger) before the
   * hold time is a **Pan**; one that holds still for 500 ms is a
   * **LongPress**, and moving after that makes it a **Drag**. A tap
   * claims no gesture at all, which is why `onClick` is the one that
   * fires for it.
   */
  const pad = (
    <box
      padding={12}
      borderRadius={8}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface"
      cursor="pointer"
      modifiers={[HOVER_CONTROL]}
      onClick={() => (gesture.value = 'a tap: a Click, and no gesture')}
      onPanStart={() => (gesture.value = 'a pan: it moved before the hold time')}
      onLongPress={() => (gesture.value = 'a long press: it held still for 500 ms')}
      onDragStart={() => (gesture.value = 'a drag: a long press, then a move')}>
      <text text="Tap, drag, or hold me" fontSize={12} color="text" />
    </box>
  );
  // #endregion pad

  // #region tiles
  /**
   * Two tiles, and the difference between them is one option.
   *
   * `draggable()` listens for a Pan, so the first tile follows the
   * pointer from the moment it moves. `start: 'longPress'` listens for
   * a Drag instead, so the second one sits still until the press has
   * been held, which is the behaviour a list that reorders on a long
   * press wants and the wrong one for a card.
   *
   * Both modifiers are built in the component body, which runs once, so
   * their arguments keep their identity across every later frame. The
   * modifiers page says what happens when they do not.
   */
  const panTile = draggable({ offset: panned, dragging: { opacity: 0.85 } });
  const holdTile = draggable({ start: 'longPress', offset: held, dragging: { opacity: 0.85 } });

  const tile = (label: string, movement: ReturnType<typeof draggable>) => (
    <box
      width={104}
      height={44}
      x="center"
      y="center"
      borderRadius={8}
      borderWidth={1}
      borderColor="border"
      backgroundColor="controlBackground"
      cursor="grab"
      modifiers={[movement, HOVER_CONTROL]}>
      <text text={label} fontSize={12} color="text" />
    </box>
  );
  // #endregion tiles

  // #region list
  /**
   * A finger pans this; a mouse does not.
   *
   * Nothing here asks for that. The list is an ordinary scroll
   * container, and the runtime's touch scroller listens for pans at the
   * root: a pan from a `touch` pointer that nothing on the way up
   * claimed scrolls whatever container it is over. A mouse drag inside
   * a scroll container is how text is selected, so it is left alone.
   */
  const list = (
    <scrollview
      height={116}
      width={percent(100)}
      gap={4}
      padding={8}
      scrollY={at}
      modifiers={[scrollPosition({ onChange: offset => (at.value = offset.y) })]}
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface"
      role="list"
      label="Notes">
      {NOTES.map(name => (
        <row key={name} height={28} paddingLeft={10} y="center" borderRadius={6}>
          <text text={name} fontSize={12} color="text" />
        </row>
      ))}
    </scrollview>
  );
  // #endregion list

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      <row gap={12} y="center">
        {pad}
        {tile('Pan me', panTile)}
        {tile('Hold, then drag', holdTile)}
      </row>
      {list}
      <column gap={4}>
        <text text={gesture.pipe(map(what => `that press was ${what}`))} fontSize={12} color="textMuted" />
        <text text={offsetText(panned).pipe(map(where => `pan tile at ${where}`))} fontSize={12} color="textMuted" />
        <text text={offsetText(held).pipe(map(where => `hold tile at ${where}`))} fontSize={12} color="textMuted" />
        <text
          text={at.pipe(map(offset => `list ${Math.round(offset)} px from the top`))}
          fontSize={12}
          color="textMuted"
        />
      </column>
    </column>
  );
}
