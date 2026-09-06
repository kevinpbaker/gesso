export enum UiNodeType {
  Root = 'root',
  Column = 'column',
  Row = 'row',
  Box = 'box',
  Text = 'text',
  /** Text the user types into; see `UiEditable`. */
  EditableText = 'editable-text',
  Button = 'button',
  /**
   * A node an application draws itself, through `paint` or `path`.
   * A leaf with a box, like `Box`; see `rendering/PaintSurface.ts`.
   */
  Paint = 'paint',
  ScrollView = 'scroll-view',
  Grid = 'grid',
  Fragment = 'fragment'
}
