import { Subject } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

import { defineModifier, focusRing, interactive, measure, percent, type LayoutBox, type UiModifier } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

// #region shared
/**
 * One value, declared once, shared by every element that wants it.
 *
 * `interactive` publishes `hovered` and `pressed` as `visualState` and
 * writes the property values in its `hovered` and `pressed` maps while
 * those states last. The writes go through the override cascade, so
 * leaving restores exactly what the element declared, including nothing
 * at all.
 *
 * Colours are palette names, resolved at paint against whatever theme
 * the node inherits, so this works in light and dark without naming
 * either.
 */
const SURFACE_INTERACTION: UiModifier = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: 'controlBackgroundHovered' },
  pressed: { backgroundColor: 'controlBackgroundPressed' }
});

/** The ring, from the same file. With no options it is one shared value too. */
const RING = focusRing();
// #endregion shared

// #region counter
/**
 * A modifier that does nothing but say how often it has attached.
 *
 * There is no `update`, which makes it honest about a kind that cannot
 * describe a change: any change of arguments is a detach followed by an
 * attach. That is what the two boxes below are measuring.
 */
const attachments = defineModifier<{ readonly seen: () => void }>({
  name: 'attachments',
  attach(_host, args) {
    args.seen();
  }
});
// #endregion counter

/**
 * What a modifier writes, and what it costs to build one per render.
 */
export function ModifierSurface(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const renders = internalState(0);
  const kept = internalState(0);
  const equal = internalState(0);
  const rebuilt = internalState(0);
  const size = new Subject<LayoutBox>();

  /**
   * The component body runs once, so this object is made once and the
   * comparison below matches it without looking inside. The handler
   * beside it is made once for the same reason, and is what lets the
   * second box build a fresh object every render and still be holding
   * the same argument.
   */
  const keptArgs = { seen: () => kept.value++ };
  const countEqual = (): void => {
    equal.value++;
  };

  // #region cascade
  /**
   * Three modifiers on one element, and none of them wraps it.
   *
   * `interactive` writes the background while the pointer is over it or
   * down on it. `focusRing()` draws a ring around it while it holds
   * focus, clipped and transformed with the node rather than floating
   * over the scene. `measure` reports the node's own box whenever it
   * moves, which is the `ResizeObserver` a canvas does not have.
   *
   * Writes go through an override cascade rather than onto the node:
   * the last modifier in the list wins, and when one stops writing, the
   * next one down or the element's own declared value comes back with
   * the property's dirty flags. That is why leaving this box restores
   * `controlBackground` without the modifier having recorded it.
   */
  const box = (
    <box
      focusable
      width={160}
      height={56}
      x="center"
      y="center"
      borderRadius={8}
      borderWidth={1}
      borderColor="border"
      backgroundColor="controlBackground"
      cursor="pointer"
      modifiers={[SURFACE_INTERACTION, RING, measure(size)]}>
      <text text="Hover, press, or Tab to me" fontSize={12} color="text" />
    </box>
  );
  // #endregion cascade

  // #region identity
  /**
   * The same modifier three times, and only one of them is rebuilt.
   *
   * A modifier's arguments are compared by value. The first box passes
   * an object made once, and the comparison matches it without looking
   * inside. The second builds an equal object inside the render, and
   * because its one field holds the same handler the comparison finds
   * nothing different, so that modifier is left alone as well. The
   * third writes its handler as an arrow function in the render, which
   * is a new function every time and so a genuinely new argument: a
   * kind with no `update` answers that with a detach and an attach, its
   * listeners dropped and re-registered, its overrides taken off the
   * node, and any state it was keeping gone.
   *
   * Press the button and watch two counters stay at one.
   */
  const pair = renders.pipe(
    map(() => (
      <row gap={12} y="center" flexWrap="wrap">
        <box padding={10} borderRadius={8} borderWidth={1} borderColor="border" modifiers={[attachments(keptArgs)]}>
          <text text="one shared value" fontSize={12} color="text" />
        </box>
        <box
          padding={10}
          borderRadius={8}
          borderWidth={1}
          borderColor="border"
          modifiers={[attachments({ seen: countEqual })]}>
          <text text="an equal object" fontSize={12} color="text" />
        </box>
        <box
          padding={10}
          borderRadius={8}
          borderWidth={1}
          borderColor="border"
          modifiers={[attachments({ seen: () => rebuilt.value++ })]}>
          <text text="a new callback" fontSize={12} color="text" />
        </box>
      </row>
    ))
  );
  // #endregion identity

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      {box}
      {pair}
      <button
        label="Render again"
        onClick={() => renders.value++}
        padding={8}
        borderRadius={6}
        borderWidth={1}
        borderColor="border"
        backgroundColor="background"
        cursor="pointer"
        modifiers={[HOVER_CONTROL]}>
        <text text="Render again" fontSize={12} color="text" />
      </button>
      <column gap={4}>
        <text
          text={size.pipe(
            map(box => `measured ${Math.round(box.width)} x ${Math.round(box.height)}`),
            startWith('not laid out yet')
          )}
          fontSize={12}
          color="textMuted"
        />
        <text text={kept.pipe(map(count => `shared value: attached ${count}`))} fontSize={12} color="textMuted" />
        <text text={equal.pipe(map(count => `equal object: attached ${count}`))} fontSize={12} color="textMuted" />
        <text text={rebuilt.pipe(map(count => `new callback: attached ${count}`))} fontSize={12} color="textMuted" />
      </column>
    </column>
  );
}
