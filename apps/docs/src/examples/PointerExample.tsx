import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

/**
 * Where a press, a hover and a key each end up.
 *
 * Every readout on this screen is written by an ordinary event
 * handler, so what the reader sees is the routing itself rather than a
 * description of it.
 */
export function PointerSurface(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const press = internalState('nothing yet');
  const hover = internalState('nothing');
  const focus = internalState('nothing');
  const key = internalState('none');
  const steps = internalState(0);

  // #region targets
  /**
   * One handler, on the panel, and two children that answer to the hit
   * tester differently.
   *
   * The panel reports whether the press landed on the panel itself or
   * on something inside it, which is the difference between
   * `event.target` (the node the hit test found) and
   * `event.currentTarget` (the node whose listener is running). A press
   * on the first chip lands on the label inside it and bubbles up to
   * here. A press on the second lands on the panel, because
   * `pointerEvents="none"` takes that box and everything under it out
   * of hit testing entirely, and the panel is the next thing under the
   * point.
   *
   * `onPointerEnter` and `onPointerLeave` are target-only, as the DOM's
   * are: they fire on the boundary of the panel's subtree, so moving
   * between the two chips does not leave and re-enter it.
   */
  const panel = (
    <row
      gap={10}
      padding={12}
      y="center"
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface"
      onPointerEnter={() => (hover.value = 'the panel')}
      onPointerLeave={() => (hover.value = 'nothing')}
      onPointerDown={event => {
        const what = event.target === event.currentTarget ? 'the panel' : 'a child of it';
        press.value = `${what} at ${Math.round(event.x)}, ${Math.round(event.y)}`;
      }}>
      <box padding={8} borderRadius={6} backgroundColor="controlBackground">
        <text text="a chip" fontSize={12} color="text" />
      </box>
      <box padding={8} borderRadius={6} backgroundColor="controlBackground" pointerEvents="none">
        <text text="pointerEvents none" fontSize={12} color="textMuted" />
      </box>
    </row>
  );
  // #endregion targets

  // #region stops
  /**
   * Three tab stops, in the order they are written.
   *
   * The two buttons are focusable because a `<button>` is; the box is
   * focusable because it says so. Nothing else here is a tab stop, and
   * the panel above takes presses without ever taking focus.
   *
   * The arrow keys are handled on the box, which only ever sees them
   * while it holds focus: a key is dispatched to the focused node and
   * bubbles from there, so the button beside it hears the same press
   * and the box does not.
   */
  const stops = (
    <row gap={10} y="center">
      <button
        label="First"
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}
        onFocus={() => (focus.value = 'First')}
        onBlur={() => (focus.value = 'nothing')}>
        <text text="First" fontSize={12} color="text" />
      </button>
      <button
        label="Second"
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}
        onFocus={() => (focus.value = 'Second')}
        onBlur={() => (focus.value = 'nothing')}>
        <text text="Second" fontSize={12} color="text" />
      </button>
      <box
        focusable
        cursor="pointer"
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        onFocus={() => (focus.value = 'the stepper')}
        onBlur={() => (focus.value = 'nothing')}
        onKeyDown={event => {
          if (event.key === 'ArrowRight') {
            steps.value++;
          } else if (event.key === 'ArrowLeft') {
            steps.value--;
          }
        }}>
        <text text={steps.pipe(map(count => `steps: ${count}`))} fontSize={12} color="text" />
      </box>
    </row>
  );
  // #endregion stops

  return (
    <column
      gap={12}
      padding={20}
      width={percent(100)}
      height={percent(100)}
      // Keys bubble, so one listener up here hears whatever the focused
      // node did not stop.
      onKeyDown={event => (key.value = event.key)}>
      {panel}
      {stops}
      <column gap={4}>
        <text text={press.pipe(map(what => `pressed ${what}`))} fontSize={12} color="textMuted" />
        <text text={hover.pipe(map(what => `hovering ${what}`))} fontSize={12} color="textMuted" />
        <text text={focus.pipe(map(what => `focus is on ${what}`))} fontSize={12} color="textMuted" />
        <text text={key.pipe(map(name => `last key: ${name}`))} fontSize={12} color="textMuted" />
      </column>
    </column>
  );
}
