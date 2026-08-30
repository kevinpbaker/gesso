import type { ComponentElement } from './ComponentElement';
import type { ComponentArgs, ComponentProps, ComponentType } from './FunctionComponent';
import { getComponentMetadata } from './metadata';

/**
 * Creates a ComponentElement for use as a child of a UiElement.
 *
 *   Column(
 *     createComponent(Counter, { label: 'Count' }),
 *     createComponent(TodoItem, { todo }, todo.id)
 *   )
 *
 * The component may be a class extending Component or a function
 * `(props, ctx) => UiChild`. Props are typed from the component: a
 * class's `input()` fields, or a function's `Inputs<P>` parameter. A
 * misspelled prop, a value of the wrong type, and a missing required
 * prop are compile errors; props may be omitted only when none is
 * required.
 */
export function createComponent<C extends ComponentType>(
  component: C,
  ...args: ComponentArgs<C>
): ComponentElement<ComponentProps<C>> {
  const [props, key] = args as [ComponentProps<C> | undefined, string | number | undefined];
  const metadata = getComponentMetadata(component);
  return {
    kind: 'component',
    tag: metadata.tag,
    component,
    props: (props ?? {}) as ComponentProps<C>,
    key
  };
}
