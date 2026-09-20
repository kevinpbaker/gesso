import { BehaviorSubject, map } from 'rxjs';

import {
  Responsive,
  UiInsetRegistry,
  auto,
  breakpoint,
  focusRing,
  insetPadding,
  interactive,
  percent,
  publishInset,
  type Size,
  type UiChild,
  type UiSemanticStates,
  type UiTextStyle,
  type UiTheme
} from '@gesso/core';
import type { ComponentContext, Inputs } from '@gesso/framework';
import { gessoTheme } from './brand';
import { masonry } from './layout/masonry';

/**
 * Layout an application can shape: four things on one page.
 *
 * Each panel is the smallest thing that shows one of them working, and
 * the four are on one page because they are one workstream: the wall
 * is arranged by a protocol the application wrote, the panel above it
 * changes shape with the room it has rather than with the window, the
 * bar across the bottom publishes the space it takes instead of every
 * panel adding it, and the whole page mirrors when the reading does.
 *
 * Two of them are best seen by dragging the window narrower:
 *
 *   - **The wall drops a column** rather than squeezing three of them,
 *     because `masonry.ts` decides its own track count from the width
 *     it is handed. Nothing declares a breakpoint for it.
 *   - **The panel above it becomes a single stack** at 820 px of its
 *     own content box, through `Responsive`. Note that it is the
 *     *panel's* width that decides, not the window's: the panel is
 *     inset from the page, so the two numbers differ, and a media
 *     query would have switched at the wrong moment.
 *
 * Turn on "Inspect layout" and hover the wall to see the protocol's
 * own `explain`: how many columns it settled on, how many items landed
 * in each, and which column is carrying the height. The engine cannot
 * work any of that out, because the engine did not do the arranging.
 */

// ---------------------------------------------------------------------------
// The wall
// ---------------------------------------------------------------------------

/**
 * Tiles of assorted heights, so the columns end up genuinely unequal.
 *
 * The height is content, not a number: each tile wraps as many lines as
 * it has room for, which is the case a masonry has to get right and the
 * case absolute positioning could not, since the arrangement depends on
 * a size that is only known once the text has been laid out.
 */
const TILES: readonly { readonly title: string; readonly lines: number; readonly stripe: string }[] = [
  { title: 'Gesso', lines: 3, stripe: 'primary' },
  { title: 'Chalk ground', lines: 6, stripe: 'secondary' },
  { title: 'Raw linen', lines: 2, stripe: 'primary' },
  { title: 'Ultramarine', lines: 8, stripe: 'primary' },
  { title: 'Ink', lines: 4, stripe: 'secondary' },
  { title: 'Sizing', lines: 5, stripe: 'primary' },
  { title: 'Underpainting', lines: 3, stripe: 'secondary' },
  { title: 'Scumbling', lines: 7, stripe: 'primary' },
  { title: 'Glaze', lines: 2, stripe: 'secondary' },
  { title: 'Impasto', lines: 4, stripe: 'primary' },
  { title: 'Varnish', lines: 6, stripe: 'secondary' },
  { title: 'Craquelure', lines: 3, stripe: 'primary' }
];

const TILE_LINE = 'Paint dries from the surface inwards, which is why a thick layer cracks.';

const CARD = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: 'controlBackgroundHovered' },
  pressed: { backgroundColor: 'controlBackgroundPressed' }
});

const RING = focusRing();

function Tile(inputs: Inputs<{ title: string; lines: number; stripe: string }>): UiChild {
  const title = inputs.title.value;
  const lines = inputs.lines.value;
  return (
    <column
      width={percent(100)}
      backgroundColor="controlBackground"
      borderRadius={12}
      paddingStart={14}
      paddingEnd={14}
      paddingY={12}
      gap={6}
      focusable
      cursor="pointer"
      role="listitem"
      label={title}
      modifiers={[CARD, RING]}>
      <row width={percent(100)} gap={8} y="center">
        <box width={4} height={14} borderRadius={2} backgroundColor={inputs.stripe.value} />
        <text textStyle="label" color="text" selectable={false}>
          {title}
        </text>
      </row>
      <text textStyle="bodySmall" color="textMuted" textWrap="word">
        {Array.from({ length: lines }, () => TILE_LINE).join(' ')}
      </text>
    </column>
  );
}

/**
 * The wall itself: an ordinary box carrying a `layout` property.
 *
 * There is no `<Masonry>` component, and that is the point. A custom
 * layout is a value, so a container becomes a masonry the way it
 * becomes a scroller: by naming the behaviour it should have.
 */
function Wall(): UiChild {
  return (
    <box
      width={percent(100)}
      role="list"
      label="Notes on paint"
      layout={masonry({ columns: 3, gap: 16, minColumnWidth: 220 })}>
      {TILES.map(tile => (
        <Tile key={tile.title} title={tile.title} lines={tile.lines} stripe={tile.stripe} />
      ))}
    </box>
  );
}

// ---------------------------------------------------------------------------
// The panel that changes shape with the room it has
// ---------------------------------------------------------------------------

function Panel(inputs: Inputs<{ title: string; body: string }>): UiChild {
  return (
    <column
      flex={1}
      minWidth={0}
      backgroundColor="controlBackground"
      borderRadius={12}
      paddingX={16}
      paddingY={14}
      gap={6}>
      <text textStyle="label" color="text">
        {inputs.title}
      </text>
      <text textStyle="bodySmall" color="textMuted" textWrap="word">
        {inputs.body}
      </text>
    </column>
  );
}

/**
 * Two panels side by side when there is room for two, and stacked when
 * there is not.
 *
 * The `at` list is what makes this cheap. `build` runs once per band
 * entered rather than once per width, so dragging the window from
 * 900 px to 1400 px rebuilds nothing at all; only crossing 820
 * does. The width it is given is this container's content box, which
 * is the whole difference between a container query and a media query.
 */
function Shape(): UiChild {
  return Responsive({ at: [820], width: percent(100), gap: 12 }, (size: Size) => {
    const wide = size.width >= 820;
    const panels = [
      <Panel
        key="what"
        title="A container query"
        body={
          'This panel asks how much room it has, not how wide the window is. Drag the window edge and watch it ' +
          'split and rejoin at 820 px of its own content box, which is not 820 px of window.'
        }
      />,
      <Panel
        key="cost"
        title="What it costs"
        body={
          'One layout pass when a band is crossed, and nothing at all for a resize inside one. The budget spec ' +
          'that pins that is packages/core/src/layout/ContainerQuery.budget.spec.ts.'
        }
      />
    ];
    return wide
      ? [
          <row key="wide" width={percent(100)} gap={12} y="stretch">
            {panels}
          </row>
        ]
      : [
          <column key="narrow" width={percent(100)} gap={12} x="stretch">
            {panels}
          </column>
        ];
  });
}

// ---------------------------------------------------------------------------
// Logical insets, and the mirror
// ---------------------------------------------------------------------------

/**
 * A row whose leading edge is stated logically.
 *
 * `paddingStart` is the left one while the page reads left to right
 * and the right one when it does not, so the accent stripe and the
 * text stay on the side the eye starts at. Written as `paddingLeft` it
 * would be on the wrong side of the mirrored page, and nothing would
 * mark it as the thing that should have moved.
 */
function Logical(): UiChild {
  return (
    <column width={percent(100)} gap={8}>
      {['Start with the ground', 'Then the underpainting', 'Then the glazes'].map((label, index) => (
        <row
          key={label}
          width={percent(100)}
          backgroundColor="controlBackground"
          borderRadius={10}
          paddingStart={16 + index * 20}
          paddingEnd={12}
          paddingY={10}
          gap={10}
          y="center">
          <box width={4} height={18} borderRadius={2} backgroundColor="primary" />
          <text textStyle="body" color="text">
            {label}
          </text>
          <text textStyle="bodySmall" color="textMuted" marginStart={auto} selectable={false}>
            {`paddingStart ${16 + index * 20}`}
          </text>
        </row>
      ))}
    </column>
  );
}

// ---------------------------------------------------------------------------
// The bar, and the room it takes
// ---------------------------------------------------------------------------

/**
 * A floating bar that says how much room it is taking.
 *
 * It knows its own height and nothing else knows it. The page below
 * carries `insetPadding`, which is forty pixels plus whatever is
 * published, so hiding the bar gives the room back without either side
 * being edited.
 */
function Bar(inputs: Inputs<{ onDismiss: () => void }>): UiChild {
  const onDismiss = inputs.onDismiss.value;
  return (
    <row
      position="absolute"
      left={0}
      right={0}
      bottom={0}
      height={72}
      paddingX={20}
      gap={16}
      y="center"
      backgroundColor="surface"
      role="region"
      label="A bar over the content"
      modifiers={[publishInset({ edge: 'bottom' })]}>
      <box width={8} height={8} borderRadius={4} backgroundColor="primary" />
      <column flex={1} minWidth={0} gap={2}>
        <text textStyle="label" color="text" selectable={false}>
          This bar publishes 72 px at the bottom
        </text>
        <text textStyle="bodySmall" color="textMuted" selectable={false}>
          Nothing above it knows the number. Hide it and the page takes the room back.
        </text>
      </column>
      <box
        paddingX={14}
        paddingY={8}
        borderRadius={8}
        backgroundColor="controlBackground"
        focusable
        cursor="pointer"
        role="button"
        label="Hide the bar"
        onClick={onDismiss}
        modifiers={[CARD, RING]}>
        <text textStyle="bodySmall" color="text" selectable={false}>
          Hide
        </text>
      </box>
    </row>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function Heading(inputs: Inputs<{ title: string; body: string }>): UiChild {
  return (
    <column width={percent(100)} gap={4} paddingTop={10}>
      <text textStyle="headline" color="text">
        {inputs.title}
      </text>
      <text textStyle="bodySmall" color="textMuted" textWrap="word" maxWidth={640}>
        {inputs.body}
      </text>
    </column>
  );
}

function Toggle(inputs: Inputs<{ label: string; on: boolean; onToggle: () => void }>): UiChild {
  const onToggle = inputs.onToggle.value;
  return (
    <row
      paddingX={12}
      paddingY={7}
      gap={8}
      borderRadius={8}
      y="center"
      backgroundColor={inputs.on.pipe(map(on => (on ? 'primary' : 'controlBackground')))}
      focusable
      cursor="pointer"
      role="switch"
      label={inputs.label}
      states={inputs.on.pipe(map((on): UiSemanticStates => (on ? ['checked'] : [])))}
      onClick={onToggle}
      modifiers={[CARD, RING]}>
      <text textStyle="bodySmall" color={inputs.on.pipe(map(on => (on ? 'background' : 'text')))} selectable={false}>
        {inputs.label}
      </text>
    </row>
  );
}

/**
 * The same theme, read the other way round.
 *
 * A `UiTheme` carries its direction on each typography role, so
 * mirroring a page is one derived value rather than a flag threaded
 * through it. Built once per press and held by the cell, so nothing
 * below is rebuilt while the direction is unchanged.
 */
function readingRightToLeft(theme: UiTheme): UiTheme {
  const typography = Object.fromEntries(
    Object.entries(theme.typography).map(([role, style]) => [
      role,
      { ...(style as UiTextStyle), textDirection: 'rtl' as const }
    ])
  ) as unknown as UiTheme['typography'];
  return { ...theme, typography };
}

export function LayoutExampleApp(_inputs: Inputs<Record<string, never>>, _ctx: ComponentContext): UiChild {
  /**
   * One registry for the page, provided at the root.
   *
   * Per application rather than per module: an inset is "what is in
   * the way in this window", and a runtime with two windows in it
   * provides one registry per window.
   */
  const insets = new UiInsetRegistry();
  const barShown = new BehaviorSubject(true);
  const mirrored = new BehaviorSubject(false);

  /**
   * Right-to-left reaches a subtree through the theme, because the
   * direction is a field of a text style and a text style is what the
   * theme's typography is made of.
   *
   * Every role, not only the one the root provides: an element that
   * names a role — `textStyle="headline"` — takes that role's style
   * whole, direction included, so a theme whose body reads one way and
   * whose headings read the other would mirror a page in pieces. One
   * value at the root, and every box under it mirrors.
   */
  const theme = mirrored.pipe(map(rtl => (rtl ? readingRightToLeft(gessoTheme) : gessoTheme)));

  return (
    <box
      width={percent(100)}
      height={percent(100)}
      theme={theme}
      textStyle={theme.pipe(map(current => current.typography.body))}
      insets={insets}
      backgroundColor="background">
      <scrollview width={percent(100)} height={percent(100)}>
        <column
          width={percent(100)}
          maxWidth={1100}
          selfX="center"
          paddingX={24}
          paddingTop={20}
          gap={18}
          x="stretch"
          modifiers={[
            insetPadding({ bottom: 40 }),
            // The page's own gutter widens once there is room for it,
            // which is `breakpoint` doing the small half of the same
            // job `Responsive` does for the panels above.
            breakpoint({ at: [1000], props: { 0: { paddingX: 16 }, 1000: { paddingX: 40 } } })
          ]}>
          <row width={percent(100)} gap={10} y="center">
            <column flex={1} minWidth={0} gap={4}>
              <text textStyle="title" color="text">
                Layout an application can shape
              </text>
              <text textStyle="bodySmall" color="textMuted" textWrap="word">
                A custom layout protocol, container queries, insets, and logical padding. Drag the window narrower.
              </text>
            </column>
            <Toggle label="Mirror" on={mirrored} onToggle={() => mirrored.next(!mirrored.value)} />
            <Toggle label="Bar" on={barShown} onToggle={() => barShown.next(!barShown.value)} />
          </row>

          <Heading
            title="A custom layout"
            body={
              'The wall below is a plain box carrying a layout property. Its protocol measures each tile once at ' +
              'the column width and drops it into the shortest column, and it decides its own column count, so it ' +
              'goes from three columns to one without a breakpoint. Source: examples/layout/masonry.ts.'
            }
          />
          <Wall />

          <Heading
            title="A container query"
            body="Two panels, or one stack, decided by the room this column has rather than by the window."
          />
          <Shape />

          <Heading
            title="Logical padding"
            body={
              'Each row is inset from the edge the reading starts at. Press Mirror: the indents move to the other ' +
              'side, the scrollbar moves with them, and nothing here was written twice.'
            }
          />
          <Logical />
        </column>
      </scrollview>
      {barShown.pipe(map(shown => (shown ? [<Bar key="bar" onDismiss={() => barShown.next(false)} />] : [])))}
    </box>
  );
}
