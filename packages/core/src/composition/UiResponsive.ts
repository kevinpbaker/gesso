import { map } from 'rxjs';

import { UiContainerSizeSource, containerBands } from '../environment/UiContainerSize';
import { UiNodeType } from '../graph/UiNodeType';
import type { Size } from '../layout/LayoutTypes';
import { sizeContainer } from '../modifiers/breakpoints';
import { createElement } from './UiFactory';
import type { UiChild, UiElement } from './UiElement';
import type { ColumnProps } from './UiElementProps';

export interface ResponsiveProps extends ColumnProps {
  /**
   * The content widths, in ascending order, at which the children are
   * built again. A width of 900 with `at={[600, 1200]}` is in the 600
   * band, and so is every width from 600 to 1199.
   *
   * Required, and the reason this is not simply a subscription to the
   * width: children rebuilt on every pixel of a resize allocate a
   * subtree per frame of a drag. Naming the widths that matter is what
   * makes the rebuild happen once per band instead.
   */
  readonly at: readonly number[];
  /** Which container to be. A Column by default; a Row or a Box are the other two. */
  readonly as?: 'column' | 'row' | 'box';
}

/**
 * A container whose children are built from the room it has.
 *
 * The other half of container queries, for the case `breakpoint`
 * cannot cover: a screen that is a sidebar and a list at 1400 px and a
 * single stack at 400 px is not the same tree with different
 * properties, it is a different tree.
 *
 *     Responsive({ at: [900], width: percent(100) }, size =>
 *       size.width >= 900 ? [Sidebar(), List()] : [List()]
 *     )
 *
 * `build` is called once per band entered, with the size the container
 * had when it entered that band, and its result replaces the children.
 * A resize inside a band changes nothing, which is the whole point:
 * dragging a window edge from 1000 px to 1399 px does no work at all.
 *
 * The container also **provides its size to the subtree** through
 * `UiEnvironmentKeys.containerSize`, so a descendant that needs the
 * number rather than a branch can read it without the tree threading a
 * prop down. What is provided is a source object whose identity never
 * changes, so nothing under it is rebuilt when the number moves; see
 * `environment/UiContainerSize.ts`.
 *
 * The first build happens before any layout, when the size is zero, so
 * `build` must return something sensible for a container whose room is
 * not yet known. Zero picks the narrowest arm, which is the right
 * guess and also what a phone gets.
 */
export function Responsive(props: ResponsiveProps, build: (size: Size) => UiChild | readonly UiChild[]): UiElement {
  const { at, as = 'column', modifiers, ...rest } = props;
  const source = new UiContainerSizeSource();
  const children = containerBands(source, at).pipe(
    map(() => {
      const built = build(source.current);
      return Array.isArray(built) ? (built as readonly UiChild[]) : [built as UiChild];
    })
  );
  const container = sizeContainer({ source });
  return createElement(
    as === 'row' ? UiNodeType.Row : as === 'box' ? UiNodeType.Box : UiNodeType.Column,
    {
      ...rest,
      containerSize: source,
      modifiers: modifiers === undefined ? [container] : [container, ...modifiers]
    },
    [children]
  );
}
