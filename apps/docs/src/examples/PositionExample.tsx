import { map } from 'rxjs/operators';

import { percent, scrollPosition, type UiNode } from 'gesso-core';
import { useOverlay } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { HOVER_CONTROL } from './interaction';

/** Enough rows that the list scrolls, with the anchor part way down. */
const ROWS = 16;
const ANCHOR_ROW = 8;

/**
 * The two offsets the page talks about.
 *
 * Scrolling the list down carries the anchor up the screen, so the
 * buttons are named for what happens to the anchor rather than for
 * what happens to the list.
 */
const ANCHOR_HIGH = 220;
const ANCHOR_LOW = 120;

/** The notice at the top of the list, collapsed and expanded. */
const NOTICE_SMALL = 28;
const NOTICE_LARGE = 96;

// #region anchored
/**
 * A panel anchored to a button, and a button the reader can send to
 * the bottom edge.
 *
 * Two ideas are on screen at once.
 *
 *  - **The panel is not a child of the list.** It is an overlay entry,
 *    rendered by the layer the runtime mounts above the whole app, and
 *    it is placed by naming the button's node as its `anchor`.
 *  - **The engine, not the component, decides which side it goes on.**
 *    `bottom-start` is a request. With no room under the button the
 *    panel flips above it, and it is shifted along the button so that
 *    it stays inside the viewport rather than hanging off the right
 *    edge.
 *
 * The button can be moved two ways, and the panel follows both: the
 * list scrolls under it, or the notice above it grows and pushes it
 * down the list. Nothing in the component re-places the panel; the
 * engine does it on the frame the button's box changed.
 *
 * The anchor is a `UiNode`, taken from the button's `ref` and read
 * inside `show()` rather than captured earlier: a ref fires after the
 * component's body has run, so anything reading it sooner reads null.
 * Passing the same node as `environment` is what keeps the panel in
 * this example's theme, since the layer it renders in is nowhere near
 * the tree that opened it.
 */
export function Anchored(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const panel = useOverlay(ctx, 'docs-position');
  const at = internalState(ANCHOR_HIGH);
  const notice = internalState(NOTICE_SMALL);
  let anchor: UiNode | null = null;

  const show = (): void => {
    panel.show(
      <column
        role="group"
        label="Panel"
        width={240}
        height={72}
        gap={6}
        padding={12}
        borderRadius={8}
        borderWidth={1}
        borderColor="border"
        backgroundColor="surface">
        <text text="Placed by the engine" fontSize={13} fontWeight={600} color="text" />
        <text text="bottom-start, 8 px off the button" fontSize={12} color="textMuted" />
      </column>,
      { anchor, placement: 'bottom-start', offset: 8, environment: anchor }
    );
  };
  ctx.onMount(show);

  const toggle = (): void => {
    if (panel.isOpen()) {
      panel.hide();
    } else {
      show();
    }
  };

  return (
    <column width={percent(100)} height={percent(100)} padding={16} gap={10}>
      <row height={32} gap={8} y="center">
        <Step label="Move the button down" onPress={() => (at.value = ANCHOR_LOW)} />
        <Step label="Move the button up" onPress={() => (at.value = ANCHOR_HIGH)} />
        <Step
          label={notice.pipe(map(height => (height === NOTICE_SMALL ? 'Expand the notice' : 'Collapse the notice')))}
          onPress={() => (notice.value = notice.value === NOTICE_SMALL ? NOTICE_LARGE : NOTICE_SMALL)}
        />
      </row>
      <scrollview
        flex={1}
        width={percent(100)}
        padding={8}
        gap={6}
        scrollY={at}
        modifiers={[scrollPosition({ onChange: offset => (at.value = offset.y) })]}
        borderWidth={1}
        borderColor="border"
        borderRadius={8}
        backgroundColor="surface">
        <column
          key="notice"
          width={percent(100)}
          height={notice}
          padding={6}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background">
          <text text="A notice that expands" fontSize={12} color="textMuted" />
        </column>
        {Array.from({ length: ROWS }, (_unused, index) =>
          index === ANCHOR_ROW ? (
            <row key="anchor" height={32} x="end" y="center">
              <button
                ref={node => {
                  anchor = node;
                }}
                label="Details"
                onClick={toggle}
                width={120}
                height={24}
                x="center"
                y="center"
                borderRadius={6}
                borderWidth={1}
                borderColor="border"
                backgroundColor="background"
                cursor="pointer"
                modifiers={[HOVER_CONTROL]}>
                <text text="Details" fontSize={12} color="text" />
              </button>
            </row>
          ) : (
            <row key={`row-${index}`} height={32} paddingLeft={10} y="center">
              <text text={`Row ${index + 1}`} fontSize={12} color="textMuted" />
            </row>
          )
        )}
      </scrollview>
    </column>
  );
}
// #endregion anchored

/** One of the two controls, so the hover and the padding are written once. */
function Step(inputs: Inputs<{ label: string; onPress: () => void }>, _ctx: ComponentContext) {
  return (
    <button
      label={inputs.label}
      onClick={() => inputs.onPress.value()}
      padding={8}
      borderRadius={6}
      borderWidth={1}
      borderColor="border"
      backgroundColor="background"
      cursor="pointer"
      modifiers={[HOVER_CONTROL]}>
      <text text={inputs.label} fontSize={12} color="text" />
    </button>
  );
}
