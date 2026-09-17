import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  autoFocus,
  clickOutside,
  darkTheme,
  draggable,
  focusRing,
  interactive,
  measure,
  percent,
  transform,
  withThemeExtension,
  type DragOffset,
  type DraggableOptions,
  type LayoutBox,
  type UiChild,
  type UiModifier,
  type UiNode
} from '@gesso/core';
import { Card, Checkbox, Slider, SplitPane, Switch, TextInput, tooltip } from '@gesso/components';
import { createComponent, internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { holdToConfirm, holdToConfirmTokens, type HoldToConfirmArgs } from '../modifiers/holdToConfirm';

/**
 * Every modifier the library ships, one card each.
 *
 * `MODIFIERS_ROADMAP.md` B4 asks for a single page that answers "does
 * the modifier system work", so the browser check is one route rather
 * than seven hunts through the framework playground. Each card holds
 * the smallest thing that shows its modifier doing its job, and a
 * caption saying what to try.
 *
 * Two rules run through the whole file, and they are the two a reader
 * writing their own modifier has to know:
 *
 *   - **Arguments are compared by identity.** A modifier's options are
 *     `Object.is`-compared against the previous render's, so an object
 *     literal rebuilt in a render body detaches and re-attaches the
 *     modifier every frame. Every options object here is either a
 *     module constant or built once in a component body, which runs
 *     once. `focusRing()` and `autoFocus()` with no arguments return a
 *     shared instance for the same reason, so calling them repeatedly
 *     is free.
 *   - **A modifier list is static per element.** Attaching or
 *     detaching one means rendering a different element, which is what
 *     the observable children in the autoFocus and clickOutside cards
 *     are doing.
 *
 * The page is written in JSX, like the rest of the examples. Intrinsic
 * tags are the core elements in lowercase; the capitalised tags are
 * `@gesso/components`.
 */

/** Wide enough for a caption at 12px without a card being a column of single words. */
const CARD_WIDTH = 320;
const ZERO_OFFSET: DragOffset = Object.freeze({ x: 0, y: 0 });

/**
 * One card, through the factory rather than as a JSX tag.
 *
 * `Card` takes its content as a `children` *prop*, and the JSX runtime
 * refuses `children` on a component tag whether it was nested between
 * tags or written as an attribute: `jsx()` pulls `children` out of the
 * props object and throws on it before it ever reaches the component.
 * So `<Card children={…} />` is a runtime error, and the factory is
 * how a component with a children prop is called from JSX today.
 */
function card(title: string, children: UiChild): UiChild {
  return createComponent(Card, { width: CARD_WIDTH, title, children });
}

// ---------------------------------------------------------------------------
// Shared modifier arguments
// ---------------------------------------------------------------------------

/**
 * Hover and press for the plain buttons on this page.
 *
 * One shared value rather than one per button: see the note above on
 * identity. Colours are palette names, resolved at paint against the
 * theme the node inherits, so nothing here says what dark blue is.
 */
const BUTTON_HOVER: UiModifier = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: 'controlBackgroundHovered' },
  pressed: { backgroundColor: 'controlBackgroundPressed' }
});

/**
 * The same, for a button already painted in the accent.
 *
 * The palette has hover and press tokens for a control and none for an
 * accent fill, because there is no darker accent to name; dimming it
 * reads as a press on either appearance.
 */
const ACCENT_HOVER: UiModifier = interactive({
  hover: true,
  press: true,
  hovered: { opacity: 0.88 },
  pressed: { opacity: 0.74 }
});

/** A button that shows hover, press and the focus ring. */
const BUTTON_MODIFIERS: readonly UiModifier[] = Object.freeze([BUTTON_HOVER, focusRing()]);

/** The accent-filled variety of the same. */
const ACCENT_MODIFIERS: readonly UiModifier[] = Object.freeze([ACCENT_HOVER, focusRing()]);

/** The ring alone, for the card that is about the ring. */
const RING_ONLY: readonly UiModifier[] = Object.freeze([focusRing()]);

/**
 * The tile in the hover card is 240 wide and 56 tall, and a transform
 * scales about its pivot, so the pivot is its middle. `{ x, y }` is
 * where the pivot sits inside the node and is not a translation.
 */
const TILE_WIDTH = 240;
const TILE_HEIGHT = 56;
const HOVER_SCALE = transform({ x: TILE_WIDTH / 2, y: TILE_HEIGHT / 2, scaleX: 1.04, scaleY: 1.04 });
const PRESS_SCALE = transform({ x: TILE_WIDTH / 2, y: TILE_HEIGHT / 2, scaleX: 0.97, scaleY: 0.97 });

const TILE_INTERACTION: readonly UiModifier[] = Object.freeze([
  interactive({
    hover: true,
    press: true,
    hovered: { backgroundColor: 'controlBackgroundHovered', borderColor: 'controlAccent', transform: HOVER_SCALE },
    pressed: { backgroundColor: 'controlBackgroundPressed', transform: PRESS_SCALE }
  })
]);

/** What a dragged card writes on itself while it is in the air. */
const DRAG_LIFT = Object.freeze({ opacity: 0.85, zIndex: 10 });

// ---------------------------------------------------------------------------
// 1. hover and press
// ---------------------------------------------------------------------------

/**
 * `interactive` writing a background and a scale.
 *
 * The modifier publishes `visualState` for whoever reads it and writes
 * the `hovered` and `pressed` property maps through the override
 * cascade, so leaving restores exactly what the element declared,
 * including the absence of a transform.
 */
function HoverPressCard(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return card(
    '1 · hover and press',
    <column gap={10}>
      <text fontSize={12} color="textMuted">
        Point at the tile, then hold the pointer down on it: one modifier writes the background, the border and the
        scale, and moving away puts all three back.
      </text>
      <box
        modifiers={TILE_INTERACTION}
        width={TILE_WIDTH}
        height={TILE_HEIGHT}
        selfX="center"
        x="center"
        y="center"
        cursor="pointer"
        backgroundColor="controlBackground"
        borderColor="controlBorder"
        borderWidth={1}
        borderRadius={8}>
        <text fontSize={13} color="controlForeground" selectable={false}>
          interactive()
        </text>
      </box>
    </column>
  );
}

// ---------------------------------------------------------------------------
// 2. focus ring
// ---------------------------------------------------------------------------

/**
 * `focusRing` as a decoration, painted in the node's own paint pass.
 *
 * The third button lives in a small scroller, so half-scrolling it out
 * cuts its ring off at the scroller's edge. That is the argument for
 * decorations existing at all: an overlay drawn over the finished
 * frame would float past the edge.
 */
function FocusRingCard(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return card(
    '2 · focus ring',
    <column gap={10}>
      <text fontSize={12} color="textMuted">
        Press one of these and then press Tab: the ring follows the focus. Scroll the third one half out of its box and
        the ring is cut off with it.
      </text>
      <row gap={8} y="center">
        {ringButton('First')}
        {ringButton('Second')}
      </row>
      <scrollview height={72} gap={6} padding={6} backgroundColor="controlBackground" borderRadius={6}>
        {ringButton('Third', 'row-1')}
        {ringButton('Fourth', 'row-2')}
        {ringButton('Fifth', 'row-3')}
      </scrollview>
    </column>
  );
}

function ringButton(label: string, key?: string) {
  return (
    <button
      key={key}
      label={label}
      modifiers={RING_ONLY}
      flexShrink={0}
      padding={8}
      borderRadius={6}
      cursor="pointer"
      backgroundColor="controlBackground"
      borderColor="controlBorder"
      borderWidth={1}
      color="controlForeground"
      fontSize={12}
      textAlign="center"
      verticalAlign="middle">
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 3. measure
// ---------------------------------------------------------------------------

/**
 * `measure` reporting a box that nothing sets the size of.
 *
 * The width comes from the split pane's divider and the height from
 * the slider, so the number under the box is the layout engine's
 * answer rather than an echo of a value the card already had. The
 * readout sits outside the measured box, and the card is a fixed
 * width, so nothing here can feed back into what it measures.
 */
function MeasureCard(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const size = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  // Built once, not in the render body: the subject is the argument,
  // and a fresh one every render would be a fresh modifier.
  const measured: readonly UiModifier[] = [measure(size)];
  const split = internalState(0.55);
  const height = internalState(48);

  return card(
    '3 · measure',
    <column gap={10}>
      <text fontSize={12} color="textMuted">
        Drag the divider and the slider: the blue box reports its own laid-out box, the way a ResizeObserver would on a
        page.
      </text>
      <box height={96} borderRadius={6} borderWidth={1} borderColor="border" overflow="hidden">
        <SplitPane
          split={split}
          min={0.2}
          max={0.85}
          onSplitChange={next => (split.value = next)}
          first={
            // The wrapper takes the pane's whole box, because a Box
            // sizes to its content by default and a child asking for
            // 100% of a parent that is 100% of its child measures
            // nothing at all.
            <box padding={8} width={percent(100)} height={percent(100)} y="center">
              <box
                modifiers={measured}
                width={percent(100)}
                height={height}
                backgroundColor="controlAccent"
                borderRadius={4}
              />
            </box>
          }
          second={
            <box padding={8}>
              <text fontSize={11} color="textMuted">
                Drag this divider
              </text>
            </box>
          }
        />
      </box>
      <Slider label="Box height" min={16} max={72} step={1} value={height} onChange={next => (height.value = next)} />
      <text fontSize={12} color="text">
        {size.pipe(map(box => `measure() reports ${Math.round(box.width)} × ${Math.round(box.height)}`))}
      </text>
    </column>
  );
}

// ---------------------------------------------------------------------------
// 4. autoFocus
// ---------------------------------------------------------------------------

/** `autoFocus()` and the ring, so the focus it takes is visible. */
const AUTO_FOCUS_MODIFIERS: readonly UiModifier[] = Object.freeze([autoFocus(), BUTTON_HOVER, focusRing()]);

/**
 * `autoFocus` firing on the first layout of a fresh mount, and never
 * again.
 *
 * The checkbox drives an observable child list, so unticking it
 * removes the button from the tree and ticking it puts a new one
 * there. The new one takes focus; the old one, once focus has been
 * moved off it by hand, does not take it back on the next frame,
 * because an autofocus that did that would be a focus trap.
 */
function AutoFocusCard(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const mounted = internalState(true);
  const note = internalState('');

  return card(
    '4 · autoFocus',
    <column gap={10}>
      <text fontSize={12} color="textMuted">
        The button below has focus already. Click into the field to take focus off it, and nothing gives it back; untick
        and retick the box and the fresh button takes focus again.
      </text>
      <Checkbox label="Button mounted" checked={mounted} onChange={next => (mounted.value = next)} />
      {mounted.pipe(
        map(on =>
          on
            ? [
                <button
                  key="autofocused"
                  label="Autofocused"
                  modifiers={AUTO_FOCUS_MODIFIERS}
                  padding={8}
                  borderRadius={6}
                  cursor="pointer"
                  backgroundColor="controlBackground"
                  borderColor="controlBorder"
                  borderWidth={1}
                  color="controlForeground"
                  fontSize={12}
                  selfX="start"
                  textAlign="center"
                  verticalAlign="middle"
                  onClick={() => (note.value = 'Pressed. Focus is still here.')}>
                  Autofocused
                </button>
              ]
            : []
        )
      )}
      <TextInput
        label="Somewhere else to put the caret"
        placeholder="click here"
        defaultValue=""
        onChange={() => (note.value = 'The button did not take the focus back.')}
      />
      <text fontSize={11} color="textMuted">
        {note}
      </text>
    </column>
  );
}

// ---------------------------------------------------------------------------
// 5. draggable
// ---------------------------------------------------------------------------

/**
 * `draggable` writing a translation on `transform`.
 *
 * Three tiles: one that stays where it is dropped, one that springs
 * back because `keepOffset` is false, and one inside a scroll view.
 * The third is the interesting one. `UiTouchScroller` listens for pans
 * at the root, so a modifier that did not stop the gesture would drag
 * the tile and scroll its container in the same movement.
 *
 * Nothing here changes the cursor. That is a message to the shell, and
 * a node's own `cursor` property already sends it, so the tiles say
 * `cursor="grab"` and the modifier stays inside the render thread.
 */
function DraggableCard(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const kept = new BehaviorSubject(ZERO_OFFSET);
  const sprung = new BehaviorSubject(ZERO_OFFSET);
  const dropped = internalState('nothing dropped yet');

  // Built once, in the component body, which runs once. A literal in
  // the render body below would be a new set of arguments per frame.
  const keepOptions: DraggableOptions = {
    offset: kept,
    dragging: DRAG_LIFT,
    onEnd: offset => (dropped.value = `dropped at ${Math.round(offset.x)}, ${Math.round(offset.y)}`)
  };
  const springOptions: DraggableOptions = {
    offset: sprung,
    dragging: DRAG_LIFT,
    keepOffset: false
  };
  const scrollerOptions: DraggableOptions = { dragging: DRAG_LIFT };

  const keeps: readonly UiModifier[] = [draggable(keepOptions)];
  const springs: readonly UiModifier[] = [draggable(springOptions)];
  const inScroller: readonly UiModifier[] = [draggable(scrollerOptions)];

  return card(
    '5 · draggable',
    <column gap={10}>
      <text fontSize={12} color="textMuted">
        Pick each tile up with the pointer. The first stays where it is dropped, the second springs back, and the third
        moves without scrolling the list it is in.
      </text>
      <row gap={8} y="center">
        {dragTile('Keeps', keeps, 'controlAccent')}
        {dragTile('Springs back', springs, 'controlBackground')}
      </row>
      <text fontSize={11} color="text">
        {kept.pipe(map(offset => `offset ${Math.round(offset.x)}, ${Math.round(offset.y)}`))}
      </text>
      <text fontSize={11} color="textMuted">
        {dropped}
      </text>
      <text fontSize={11} color="textMuted">
        {sprung.pipe(map(offset => `springing tile: ${Math.round(offset.x)}, ${Math.round(offset.y)}`))}
      </text>
      <scrollview height={92} gap={6} padding={6} backgroundColor="controlBackground" borderRadius={6}>
        {filler('above')}
        {dragTile('Drag me, do not scroll', inScroller, 'controlAccent', 'in-scroller')}
        {filler('below')}
        {filler('and below')}
        {filler('and below again')}
      </scrollview>
    </column>
  );
}

function dragTile(label: string, modifiers: readonly UiModifier[], background: string, key?: string) {
  return (
    <box
      key={key}
      modifiers={modifiers}
      width={132}
      height={44}
      flexShrink={0}
      x="center"
      y="center"
      cursor="grab"
      backgroundColor={background}
      borderColor="controlBorder"
      borderWidth={1}
      borderRadius={6}>
      <text fontSize={11} color="controlForeground" textAlign="center" selectable={false}>
        {label}
      </text>
    </box>
  );
}

function filler(label: string) {
  return (
    <box key={label} height={22} flexShrink={0} y="center" paddingLeft={6} borderRadius={4} backgroundColor="surface">
      <text fontSize={11} color="textMuted" selectable={false}>
        {label}
      </text>
    </box>
  );
}

// ---------------------------------------------------------------------------
// 6. clickOutside
// ---------------------------------------------------------------------------

/**
 * `clickOutside` on a panel, with the opener excused.
 *
 * The listener is at the root in the capture phase, because the event
 * this cares about is the one that never arrives at the panel. Capture
 * is also why the switch below both closes the panel and toggles on
 * the same press: the modifier hears the press and lets it through
 * rather than swallowing it the way a backdrop would.
 */
function ClickOutsideCard(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const notify = internalState(false);
  let opener: UiNode | null = null;

  const outside: readonly UiModifier[] = [
    clickOutside({
      onOutside: () => (open.value = false),
      // Without this the press that opens the panel closes it again in
      // the same gesture, because the opener is not inside the panel.
      except: () => [opener]
    })
  ];

  return card(
    '6 · clickOutside',
    <column gap={10}>
      <text fontSize={12} color="textMuted">
        Open the panel and then press anywhere else on the page. Pressing the opener closes it once rather than closing
        and reopening it.
      </text>
      <button
        ref={(node: UiNode | null) => (opener = node)}
        label="Toggle panel"
        modifiers={BUTTON_MODIFIERS}
        selfX="start"
        padding={8}
        borderRadius={6}
        cursor="pointer"
        backgroundColor="controlBackground"
        borderColor="controlBorder"
        borderWidth={1}
        color="controlForeground"
        fontSize={12}
        textAlign="center"
        verticalAlign="middle"
        onClick={() => (open.value = !open.value)}>
        Toggle panel
      </button>
      {open.pipe(
        map(on =>
          on
            ? [
                <column
                  key="panel"
                  modifiers={outside}
                  gap={6}
                  padding={10}
                  backgroundColor="controlBackground"
                  borderColor="controlAccent"
                  borderWidth={1}
                  borderRadius={6}>
                  <text fontSize={12} color="controlForeground">
                    A panel that closes itself
                  </text>
                  <text fontSize={11} color="textMuted">
                    Pressing inside here leaves it open.
                  </text>
                </column>
              ]
            : []
        )
      )}
      <Switch label="A switch outside the panel" checked={notify} onChange={next => (notify.value = next)} />
    </column>
  );
}

// ---------------------------------------------------------------------------
// 7. tooltip
// ---------------------------------------------------------------------------

/**
 * `tooltip`, the one modifier that is not in `@gesso/core`.
 *
 * A modifier has no component of its own to inject into and the
 * overlay service is per runtime, so the component that renders the
 * element hands over its own overlay entry. That is why the context is
 * the first argument, and it is also what closes an open tooltip when
 * this card unmounts.
 *
 * The tooltip at the bottom edge of the page is elsewhere, in
 * `BottomEdgeTooltip`, so that it is genuinely against the edge
 * however far the page is scrolled.
 */
function TooltipCard(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const above: readonly UiModifier[] = [
    tooltip(ctx, { text: 'Placed above, after the default 400 ms pause.' }),
    ...BUTTON_MODIFIERS
  ];
  const beside: readonly UiModifier[] = [
    tooltip(ctx, { text: 'Placed to the right, after 150 ms.', placement: 'right', delay: 150 }),
    ...BUTTON_MODIFIERS
  ];
  const below: readonly UiModifier[] = [
    tooltip(ctx, { text: 'Placed below, and it follows its anchor when the page scrolls.', placement: 'bottom' }),
    ...BUTTON_MODIFIERS
  ];

  return card(
    '7 · tooltip',
    <column gap={10}>
      <text fontSize={12} color="textMuted">
        Rest the pointer on each chip, or Tab to it. The modifier adds no node to the tree: it listens to the chip
        itself and opens an anchored overlay.
      </text>
      <row gap={8} y="center" flexWrap="wrap">
        {chip('Above', above)}
        {chip('Right', beside)}
        {chip('Below', below)}
      </row>
    </column>
  );
}

function chip(label: string, modifiers: readonly UiModifier[]) {
  return (
    <button
      key={label}
      label={label}
      modifiers={modifiers}
      padding={8}
      flexShrink={0}
      borderRadius={14}
      cursor="pointer"
      backgroundColor="controlBackground"
      borderColor="controlBorder"
      borderWidth={1}
      color="controlForeground"
      fontSize={12}
      textAlign="center"
      verticalAlign="middle">
      {label}
    </button>
  );
}

/**
 * A chip pinned to the bottom edge of the viewport, asking for a
 * tooltip below it.
 *
 * There is no room below, so the placement engine flips it above. The
 * chip is a sibling of the scroller rather than a card in it, because
 * a card scrolls and the point of this one is where it sits on screen.
 */
function BottomEdgeTooltip(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const flips: readonly UiModifier[] = [
    tooltip(ctx, {
      text: 'Asked for below, given above: an anchored overlay flips when it would leave the viewport.',
      placement: 'bottom',
      delay: 150
    }),
    ...ACCENT_MODIFIERS
  ];

  return (
    <row
      position="absolute"
      right={16}
      bottom={12}
      zIndex={5}
      gap={8}
      y="center"
      padding={8}
      backgroundColor="surface"
      borderColor="border"
      borderWidth={1}
      borderRadius={8}>
      <button
        label="At the bottom edge"
        modifiers={flips}
        padding={8}
        borderRadius={6}
        cursor="pointer"
        backgroundColor="controlAccent"
        color="controlBackground"
        fontSize={12}
        textAlign="center"
        verticalAlign="middle">
        At the bottom edge
      </button>
      <text fontSize={11} color="textMuted">
        asks for a tooltip below itself
      </text>
    </row>
  );
}

// ---------------------------------------------------------------------------
// 8. holdToConfirm, from outside
// ---------------------------------------------------------------------------

/**
 * A theme with the modifier's tokens changed, for the second tile.
 *
 * This is the environment route for configuring a modifier from
 * outside the framework: no new property, no registry change. The
 * tokens ride on the theme, so everything under this box holds for
 * a quarter of a second and fills in the accent.
 */
const QUICK_HOLD_THEME = withThemeExtension(darkTheme, holdToConfirmTokens, {
  duration: 250,
  fill: 'controlAccent'
});

/**
 * `holdToConfirm`, the one modifier on this page that is not the
 * library's.
 *
 * `MODIFIERS_ROADMAP.md` B6: written in `../modifiers/holdToConfirm.ts`
 * against `@gesso/core`'s entry point alone, and held to that by the
 * lint configuration. The card is the browser check that a modifier
 * from outside runs in the same host as the seven above it.
 *
 * The modifier sits after `interactive` in the list on purpose: both
 * write `borderColor`, and later in the list wins, so the hold's fill
 * colour takes the border over the hover's while the pointer is down
 * and hands it back to the hover on release.
 */
function HoldToConfirmCard(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const deleted = internalState(0);
  const note = internalState('nothing deleted yet');

  // Built once, in the component body, which runs once.
  const holdArgs: HoldToConfirmArgs = {
    onConfirm: () => {
      deleted.value++;
      note.value = `deleted ${deleted.value} ${deleted.value === 1 ? 'time' : 'times'}`;
    },
    onCancel: () => (note.value = 'let go early, nothing deleted')
  };
  const holds: readonly UiModifier[] = [
    interactive({
      hover: true,
      press: false,
      hovered: { backgroundColor: 'controlBackgroundHovered', borderColor: 'controlAccent' }
    }),
    holdToConfirm(holdArgs)
  ];

  return card(
    '8 · holdToConfirm, from outside',
    <column gap={10}>
      <text fontSize={12} color="textMuted">
        Hold the pointer down on a tile until it fills: the first takes 600 ms and fills in the danger colour, the
        second sits under a theme that says 250 ms and the accent. Let go early and nothing happens.
      </text>
      <row gap={8} y="center">
        {holdTile('Hold to delete', holds)}
        <box theme={QUICK_HOLD_THEME}>{holdTile('Quick hold', holds)}</box>
      </row>
      <text fontSize={11} color="textMuted">
        {note}
      </text>
    </column>
  );
}

function holdTile(label: string, modifiers: readonly UiModifier[]) {
  return (
    <box
      modifiers={modifiers}
      width={132}
      height={44}
      flexShrink={0}
      x="center"
      y="center"
      cursor="pointer"
      backgroundColor="controlBackground"
      borderColor="controlBorder"
      borderWidth={1}
      borderRadius={6}>
      <text fontSize={11} color="controlForeground" textAlign="center" selectable={false}>
        {label}
      </text>
    </box>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function ModifiersApp(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <box theme={darkTheme} width={percent(100)} height={percent(100)} position="relative" backgroundColor="background">
      <scrollview width={percent(100)} height={percent(100)} padding={16} paddingBottom={56} gap={12}>
        <text fontSize={18} fontWeight={600} color="text">
          Modifiers
        </text>
        <text fontSize={12} color="textMuted">
          Behaviour attached to an element without wrapping it. Every card below is one modifier and the smallest thing
          that shows it working; the last is written outside the framework, against its public exports alone.
        </text>
        <row flexWrap="wrap" gap={12} y="start" alignContent="start">
          <HoverPressCard />
          <FocusRingCard />
          <MeasureCard />
          <AutoFocusCard />
          <DraggableCard />
          <ClickOutsideCard />
          <TooltipCard />
          <HoldToConfirmCard />
        </row>
      </scrollview>
      <BottomEdgeTooltip />
    </box>
  );
}
