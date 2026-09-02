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
export function ModifierSurface(_props: Inputs<{}>, _ctx: ComponentContext) {
  const renders = internalState(0);
  const kept = internalState(0);
  const rebuilt = internalState(0);
  const size = new Subject<LayoutBox>();

  /**
   * The component body runs once, so this object is made once and its
   * identity holds for the life of the tree. The modifier below it is
   * built inside the render, so it is a new object every time.
   */
  const keptArgs = { seen: () => kept.value++ };

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
   * The same modifier twice, and only one of them survives a render.
   *
   * A modifier's arguments are compared by identity, exactly as a
   * property's value is. The left box passes an object made once, so
   * every later render matches it and nothing happens. The right box
   * builds its arguments inside the render, so every render is a fresh
   * object, and a kind with no `update` answers that with a detach and
   * an attach: its listeners are dropped and re-registered, its
   * overrides are taken off the node, and any state it was keeping is
   * gone.
   *
   * Press the button and watch one counter stay at one.
   */
  const pair = renders.pipe(
    map(() => (
      <row gap={12} y="center">
        <box padding={10} borderRadius={8} borderWidth={1} borderColor="border" modifiers={[attachments(keptArgs)]}>
          <text text="one shared value" fontSize={12} color="text" />
        </box>
        <box
          padding={10}
          borderRadius={8}
          borderWidth={1}
          borderColor="border"
          modifiers={[attachments({ seen: () => rebuilt.value++ })]}>
          <text text="built in the render" fontSize={12} color="text" />
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
        <text
          text={rebuilt.pipe(map(count => `built in the render: attached ${count}`))}
          fontSize={12}
          color="textMuted"
        />
      </column>
    </column>
  );
}
