/**
 * Hand-written notes for the property registry.
 *
 * `packages/core/src/properties/UiProperty.ts` is the source of truth
 * for what a property is called, what it defaults to, whether it
 * inherits, and what changing it invalidates. `pnpm docs:reference`
 * reads all four straight off the registry at runtime, so none of that
 * can be wrong here.
 *
 * What the registry does not carry is a sentence a reader can use. Most
 * properties have no doc comment at all, and the ones that do have a
 * comment written for someone changing the code: `zIndex` spends a
 * paragraph on why it invalidates layout rather than paint, which is
 * the right thing to tell a maintainer and the wrong thing to put in a
 * table cell. So the prose is written here instead, once, by hand.
 *
 * The generator prefers a note from this file. Where there is none it
 * falls back to the first sentence of the doc comment, and refuses to
 * generate at all if that sentence is missing, longer than
 * `MAX_TSDOC_SUMMARY`, or contains an em dash. A property added to the
 * registry therefore either arrives with a short clean summary or stops
 * `pnpm docs:reference:check` until somebody writes it one.
 *
 * `defaultValue` is an override for the rendered default, not for the
 * real one. It exists for the handful of values that serialise badly:
 * the default `color` is an object with four channels in it, and
 * `black` is what a reader needs to know.
 *
 * `group` decides which table the property lands in, and every group
 * must be a title in `PROPERTY_GROUPS`. Within a group the order is the
 * registry order, so it is the source that decides it.
 */

/** The longest doc-comment summary the generator will accept unedited. */
export const MAX_TSDOC_SUMMARY = 160;

/** One property's worth of hand-written documentation. */
export interface PropertyNote {
  /** The table it appears in; must be a title in `PROPERTY_GROUPS`. */
  readonly group: string;
  /** One short line saying what the property does. */
  readonly note?: string;
  /** Overrides the rendered default where the real value reads badly. */
  readonly defaultValue?: string;
}

/** A heading on the generated page, in the order the page reads. */
export interface PropertyGroup {
  readonly title: string;
  readonly blurb: string;
}

export const PROPERTY_GROUPS: readonly PropertyGroup[] = [
  {
    title: 'Size',
    blurb:
      'What a box asks for. Nothing here is a promise: a min or a max, a parent, or the content can all overrule it.'
  },
  {
    title: 'Spacing',
    blurb: 'Space inside the box, space outside it, and space between children.'
  },
  {
    title: 'Flex',
    blurb: 'How a row or a column arranges its children, and how a child answers back.'
  },
  {
    title: 'Grid',
    blurb: 'Track definitions on the container, placement on the item.'
  },
  {
    title: 'Position',
    blurb: 'Taking a box out of flow, and putting it somewhere specific instead.'
  },
  {
    title: 'Overflow and scrolling',
    blurb: 'Clipping, scroll containers, and what a wheel does when it reaches the end.'
  },
  {
    title: 'Paint',
    blurb: 'Fills, borders, shadows and everything else that changes pixels without changing boxes.'
  },
  {
    title: 'Text',
    blurb: 'The text style properties are the inherited ones. Set them on a container and everything below reads them.'
  },
  {
    title: 'Editing',
    blurb: 'The properties an editable node adds. Set by `TextInput` and `TextArea`; usable directly.'
  },
  {
    title: 'Interaction',
    blurb: 'Whether a node can be hit, focused, selected, or used at all.'
  },
  {
    title: 'Semantics',
    blurb: 'What the node publishes to the accessibility mirror, since a canvas has no DOM to read.'
  },
  {
    title: 'Media',
    blurb: 'Bitmaps and video frames, both resolved on the shell thread and drawn inside the box.'
  },
  {
    title: 'Virtualization',
    blurb: 'What a virtualized container writes on its rows so the runtime can reason about the ones it cannot see.'
  },
  {
    title: 'Environment',
    blurb: 'Values provided at one node and inherited by everything under it.'
  }
] as const;

export const PROPERTY_NOTES: Readonly<Record<string, PropertyNote>> = {
  // Size
  width: { group: 'Size', note: 'Requested width, as a number of pixels or a length.' },
  height: { group: 'Size', note: 'Requested height, as a number of pixels or a length.' },
  minWidth: { group: 'Size', note: 'Floor on the width, applied after everything else has had its say.' },
  maxWidth: { group: 'Size', note: 'Ceiling on the width. Beats `width`, loses to `minWidth`.' },
  minHeight: { group: 'Size', note: 'Floor on the height.' },
  maxHeight: { group: 'Size', note: 'Ceiling on the height.' },
  aspectRatio: {
    group: 'Size',
    note: 'Width divided by height. Fills in whichever of the two is not otherwise decided.'
  },

  // Spacing
  padding: { group: 'Spacing', note: 'Space inside the border on all four sides.' },
  paddingTop: { group: 'Spacing', note: 'Overrides `padding` on the top edge.' },
  paddingRight: { group: 'Spacing', note: 'Overrides `padding` on the right edge.' },
  paddingBottom: { group: 'Spacing', note: 'Overrides `padding` on the bottom edge.' },
  paddingLeft: { group: 'Spacing', note: 'Overrides `padding` on the left edge.' },
  margin: { group: 'Spacing', note: 'Space outside the box on all four sides. Margins do not collapse.' },
  marginTop: { group: 'Spacing', note: 'Overrides `margin` on the top edge.' },
  marginRight: { group: 'Spacing', note: 'Overrides `margin` on the right edge.' },
  marginBottom: { group: 'Spacing', note: 'Overrides `margin` on the bottom edge.' },
  marginLeft: { group: 'Spacing', note: 'Overrides `margin` on the left edge.' },
  gap: { group: 'Spacing', note: 'Space between children, on both axes.' },
  rowGap: { group: 'Spacing', note: 'Overrides `gap` between rows.' },
  columnGap: { group: 'Spacing', note: 'Overrides `gap` between columns.' },

  // Flex
  flex: { group: 'Flex', note: 'The CSS shorthand: `flex={n}` is grow n, shrink 1, basis 0.' },
  flexWrap: { group: 'Flex', note: 'Whether children that do not fit start a new line.' },
  alignContent: {
    group: 'Flex',
    note: 'How a wrapping container distributes its lines on the cross axis, and a grid its row tracks.'
  },
  flexGrow: { group: 'Flex', note: 'Share of the space left over that this child takes.' },
  flexShrink: { group: 'Flex', note: 'Share of any shortfall this child gives up. Defaults to 1 in a flex container.' },
  flexBasis: { group: 'Flex', note: 'The size grow and shrink start from, before either applies.' },
  x: {
    group: 'Flex',
    note: 'Alignment of children along the x axis. Axis-relative, so it does not flip with direction.'
  },
  y: {
    group: 'Flex',
    note: 'Alignment of children along the y axis. Axis-relative, so it does not flip with direction.'
  },
  selfX: { group: 'Flex', note: 'One child overriding the x alignment its parent set.' },
  selfY: { group: 'Flex', note: 'One child overriding the y alignment its parent set.' },
  direction: { group: 'Flex', note: 'Which way a flex or scroll container runs.' },

  // Grid
  columns: { group: 'Grid', note: 'The column tracks, as a list of sizes.' },
  rows: { group: 'Grid', note: 'The row tracks, as a list of sizes.' },
  autoColumns: { group: 'Grid', note: 'Size for columns the grid creates beyond the declared ones.' },
  autoRows: { group: 'Grid', note: 'Size for rows the grid creates beyond the declared ones.' },
  subgrid: {
    group: 'Grid',
    note: 'A nested grid taking its column tracks from the span it occupies in its parent. Column axis only.'
  },
  autoFlow: { group: 'Grid', note: 'Which axis unplaced items fill first.' },
  justifyContent: { group: 'Grid', note: 'How the column tracks are distributed when they do not fill the container.' },
  column: { group: 'Grid', note: 'The column line this item starts at, counting from 1.' },
  columnSpan: { group: 'Grid', note: 'How many columns the item covers.' },
  row: { group: 'Grid', note: 'The row line this item starts at, counting from 1.' },
  rowSpan: { group: 'Grid', note: 'How many rows the item covers.' },

  // Position
  position: {
    group: 'Position',
    note: 'One of `static`, `relative`, `absolute`, `sticky`. Anything but `static` makes a containing block.'
  },
  top: { group: 'Position', note: 'Offset from the top edge of the containing block.' },
  right: { group: 'Position', note: 'Offset from the right edge.' },
  bottom: { group: 'Position', note: 'Offset from the bottom edge.' },
  left: { group: 'Position', note: 'Offset from the left edge.' },
  zIndex: { group: 'Position', note: 'Paint and hit-test order among siblings; higher paints later and is hit first.' },
  anchor: {
    group: 'Position',
    note: 'The node an absolute box is placed beside. Flips and shifts to stay inside its containing block.'
  },
  placement: { group: 'Position', note: 'Which side of the anchor to sit on, and how to align along it.' },
  anchorOffset: { group: 'Position', note: 'Gap between the anchor and the anchored box.' },
  inset: { group: 'Position', note: 'Shorthand for top, right, bottom and left at once.' },

  // Overflow and scrolling
  overflow: {
    group: 'Overflow and scrolling',
    note: '`visible`, `hidden`, or `scroll` and `auto`, which make the box a scroll container.'
  },
  scrollX: { group: 'Overflow and scrolling', note: 'Current horizontal scroll offset. Readable and writable.' },
  scrollY: { group: 'Overflow and scrolling', note: 'Current vertical scroll offset. Readable and writable.' },
  scrollBehavior: {
    group: 'Overflow and scrolling',
    note: 'Whether a wheel moves this container at once or animates it. Read by input, not by layout.'
  },
  overscrollBehavior: {
    group: 'Overflow and scrolling',
    note: 'What happens to a wheel delta this node cannot use: chain it to an ancestor, or keep it.'
  },

  // Paint
  backgroundColor: { group: 'Paint', note: 'Fill behind the content. Takes a theme token as well as a colour.' },
  backgroundGradient: {
    group: 'Paint',
    note: 'A gradient over the background colour and under the image. Built with `linearGradient` or `radialGradient`.'
  },
  borderColor: { group: 'Paint', note: 'Colour of the border, drawn inside the box.', defaultValue: 'black' },
  borderWidth: { group: 'Paint', note: 'Thickness of that border, in pixels.' },
  borderRadius: {
    group: 'Paint',
    note: 'Corner rounding, one number or four. Clips the background, the image and `overflow: hidden`.',
    defaultValue: 'no rounding'
  },
  boxShadows: { group: 'Paint', note: 'Shadows behind the box, painted in order.', defaultValue: 'none' },
  opacity: { group: 'Paint', note: 'Applies to the whole subtree, not just this node.' },
  visible: { group: 'Paint', note: 'Hides the box and its subtree without taking it out of layout.' },
  transform: { group: 'Paint', note: 'Translation, scale and rotation applied at paint time. Layout does not see it.' },

  // Text
  color: {
    group: 'Text',
    note: 'Text colour. Inherited, and a theme token resolves against the theme in scope.',
    defaultValue: 'black'
  },
  fontFamily: { group: 'Text', note: 'Font stack, as a CSS family list.' },
  fontSize: { group: 'Text', note: 'Size in pixels.' },
  fontWeight: { group: 'Text', note: 'A number, a numeric string, or a CSS keyword.' },
  lineHeight: { group: 'Text', note: 'Line box height in pixels. The default is 1.2 times the default size.' },
  letterSpacing: { group: 'Text', note: 'Extra space between characters, in pixels.' },
  textAlign: { group: 'Text', note: 'How lines sit within the text box.' },
  textDirection: { group: 'Text', note: 'Base direction for bidirectional text.' },
  verticalAlign: { group: 'Text', note: 'How a text run sits against the baseline of its line.' },
  textWrap: { group: 'Text', note: 'How text breaks into lines: `word`, `char`, or `none`.' },
  maxLines: { group: 'Text', note: 'Lines kept before the rest is dropped. Pairs with `textOverflow`.' },
  textOverflow: { group: 'Text', note: 'What happens to a line that does not fit: `clip` or `ellipsis`.' },
  text: { group: 'Text', note: 'The string a text node draws. Changing it remeasures and relayouts.' },

  // Editing
  value: {
    group: 'Editing',
    note: 'The text of an editable node. Write the reported value back to get a controlled field.'
  },
  placeholder: { group: 'Editing', note: 'Shown while the value is empty.' },
  multiline: { group: 'Editing', note: 'Whether Enter inserts a newline or is left for the app.' },
  readOnly: { group: 'Editing', note: 'Selectable and focusable, but not editable.' },
  caretColor: { group: 'Editing', note: 'Colour of the caret. Falls back to the text colour.' },
  selectionColor: { group: 'Editing', note: 'Fill behind selected text.' },
  matchColor: { group: 'Editing', note: 'Fill behind a find match.' },
  placeholderColor: { group: 'Editing', note: 'Colour of the placeholder text.' },
  editor: { group: 'Editing', note: 'The editable text model backing this node, when the app supplies its own.' },

  // Interaction
  cursor: {
    group: 'Interaction',
    note: 'CSS cursor shown over this node. Resolved on hover and applied to the canvas by the shell.'
  },
  selectable: {
    group: 'Interaction',
    note: 'Whether the pointer may select text in this subtree. Read up the ancestor chain, like `user-select`.'
  },
  pointerEvents: {
    group: 'Interaction',
    note: 'Whether the node takes pointer input, or lets it through to what is behind.'
  },
  focusable: { group: 'Interaction', note: 'Whether focus can land here, by tab or by click.' },
  disabled: { group: 'Interaction', note: 'Blocks input and publishes the disabled state to the mirror.' },
  hitTestable: { group: 'Interaction', note: 'Whether hit testing considers this node at all.' },
  visualState: {
    group: 'Interaction',
    note: 'Hover, press, focus, disabled. Written by `interactive` and read by whatever paints.',
    defaultValue: 'normal'
  },

  // Semantics
  role: {
    group: 'Semantics',
    note: 'What the node is, as far as assistive technology is concerned. Validated on write.'
  },
  label: { group: 'Semantics', note: 'The accessible name.' },
  description: { group: 'Semantics', note: 'Longer detail, read after the name.' },
  live: { group: 'Semantics', note: 'A live region: polite or assertive. Its text is announced when it changes.' },
  states: { group: 'Semantics', note: 'Checked, expanded, busy, and the rest. Validated on write.' },
  valueNow: { group: 'Semantics', note: 'Current value of a range widget.' },
  valueMin: { group: 'Semantics', note: 'Lowest value that range accepts.' },
  valueMax: { group: 'Semantics', note: 'Highest value that range accepts.' },
  valueText: { group: 'Semantics', note: 'A human reading of the value, where the number alone would not do.' },
  posInSet: { group: 'Semantics', note: 'Which item in a set this is, counting from 1.' },
  setSize: { group: 'Semantics', note: 'How many items the set holds, including any not built yet.' },
  level: {
    group: 'Semantics',
    note: 'How deep a tree item sits, 1 for a root. A tree is a flat list of rows, so nothing else carries this.'
  },

  // Media
  image: { group: 'Media', note: 'A decoded bitmap drawn inside the box, clipped by `borderRadius`.' },
  video: { group: 'Media', note: 'A video surface drawn where an image would be, under the same fit and clip.' },
  objectFit: { group: 'Media', note: 'How that bitmap or surface fills the box: `fill`, `cover`, `contain`, `none`.' },

  // Virtualization
  virtualIndex: { group: 'Virtualization', note: 'Which item in the full list this mounted row is.' },
  virtualLead: { group: 'Virtualization', note: 'Space standing in for the rows above the window.' },
  virtualWindow: {
    group: 'Virtualization',
    note: 'The range currently built, and the estimate for everything outside it.'
  },

  // Environment
  theme: { group: 'Environment', note: 'Provides a palette and a type scale to this subtree.' },
  textStyle: { group: 'Environment', note: 'Provides one step of the type scale as the inherited text style.' },
  contentColor: { group: 'Environment', note: 'Provides the colour that content on this surface should use.' }
} as const;
