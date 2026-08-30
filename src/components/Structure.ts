import { map, type Observable } from 'rxjs';

import { input } from '../framework/Input';
import type { ComponentContext, Inputs } from '../framework/FunctionComponent';
import { Box, Column, Row, Text } from '../ui/composition/UiComponents';
import type { UiChild, UiElement } from '../ui/composition/UiElement';
import type { UiSemanticState } from '../ui/properties/UiSemantics';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import { CONTROL_INTERACTION, keymap, layoutOf, type ControlLayoutProps } from './internals';

/**
 * The pieces a screen is assembled from: a surface, a rule, a row of
 * tools, a set of tabs, a set of sections.
 *
 * None of them holds application state beyond which one is open, and
 * all of them are themed and keyboard-operable on the same terms as
 * the Inputs tier.
 */

// ---------------------------------------------------------------------------
// Card and Divider
// ---------------------------------------------------------------------------

export interface CardProps extends ControlLayoutProps {
  /** A heading drawn above the content. */
  title?: string;
  /** Names the region for a screen reader when there is no title. */
  label?: string;
  padding?: number;
  children?: UiChild;
}

/** A surface that groups what is on it. */
export function Card(props: Inputs<CardProps>, _ctx: ComponentContext): UiChild {
  const title = input(props.title, '');
  const label = input(props.label, '');
  const padding = input(props.padding, 16);
  return Column(
    {
      ...layoutOf(props),
      padding: padding.value,
      gap: 12,
      backgroundColor: 'surface',
      borderColor: 'border',
      borderWidth: 1,
      borderRadius: 8,
      role: 'group',
      label: label.pipe(map(text => (text.length > 0 ? text : title.value)))
    },
    title.pipe(
      map(text =>
        text.length === 0 ? [] : [Text({ text, color: 'text', fontSize: 15, fontWeight: 600, selectable: false })]
      )
    ),
    props.children.value ?? Row()
  );
}

export interface DividerProps extends ControlLayoutProps {
  direction?: 'row' | 'column';
}

/** A rule between things. Decorative, and says so. */
export function Divider(props: Inputs<DividerProps>, _ctx: ComponentContext): UiChild {
  const direction = input(props.direction, 'row');
  const horizontal = direction.value === 'row';
  return Box({
    ...layoutOf(props),
    width: horizontal ? undefined : 1,
    height: horizontal ? 1 : undefined,
    flexGrow: horizontal ? 1 : undefined,
    backgroundColor: 'border',
    role: 'separator',
    // No name and no focus: a rule is furniture, and announcing it by
    // name would be noise on every screen it appears on.
    hitTestable: false
  });
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export interface ToolbarProps extends ControlLayoutProps {
  label?: string;
  children?: UiChild;
}

/**
 * A row of controls that belong together.
 *
 * It is a `toolbar` so a screen reader announces the group once rather
 * than describing every button as loose furniture; the buttons inside
 * stay ordinary tab stops.
 */
export function Toolbar(props: Inputs<ToolbarProps>, _ctx: ComponentContext): UiChild {
  const label = input(props.label, 'Toolbar');
  return Row(
    {
      ...layoutOf(props),
      gap: 6,
      y: 'center',
      padding: 6,
      backgroundColor: 'surface',
      borderColor: 'border',
      borderWidth: 1,
      borderRadius: 8,
      role: 'toolbar',
      label
    },
    props.children.value ?? Row()
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export interface TabDefinition {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface TabsProps extends ControlLayoutProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  tabs: readonly TabDefinition[];
  label?: string;
  /** The panel for the selected tab; the caller renders it. */
  children?: UiChild;
}

/**
 * A tab bar and the panel under it.
 *
 * The bar is one tab stop and the arrows move the selection, the same
 * pattern `RadioGroup` uses and for the same reason: walking five tabs
 * with Tab to reach the content behind them is worse than walking them
 * with the arrows.
 */
export function Tabs(props: Inputs<TabsProps>, ctx: ComponentContext): UiChild {
  const label = input(props.label, 'Tabs');
  const focus = trackFocus(ctx);
  const value = controlled<string>({
    component: 'Tabs',
    name: 'value',
    source: props.value,
    initial: props.defaultValue,
    fallback: '',
    onChange: props.onChange
  });

  const enabled = (): readonly TabDefinition[] => props.tabs.value.filter(tab => tab.disabled !== true);
  const step = (delta: number): void => {
    const tabs = enabled();
    if (tabs.length === 0) {
      return;
    }
    const index = tabs.findIndex(tab => tab.value === value.current());
    const next = index === -1 ? 0 : (index + delta + tabs.length) % tabs.length;
    value.change(tabs[next].value);
  };

  return Column(
    { ...layoutOf(props), gap: 12 },
    Row(
      {
        ref: focus.ref,
        focusable: true,
        gap: 4,
        role: 'tablist',
        label,
        onKeyDown: keymap({
          ArrowRight: () => step(1),
          ArrowLeft: () => step(-1),
          Home: () => {
            const tabs = enabled();
            if (tabs.length > 0) {
              value.change(tabs[0].value);
            }
          },
          End: () => {
            const tabs = enabled();
            if (tabs.length > 0) {
              value.change(tabs[tabs.length - 1].value);
            }
          }
        })
      },
      props.tabs.pipe(map(tabs => tabs.map(tab => tabButton(tab, value.value, value.change))))
    ),
    Box(
      { role: 'tabpanel', label: value.value.pipe(map(current => labelOf(props.tabs.value, current))) },
      props.children.value ?? Row()
    )
  );
}

function labelOf(tabs: readonly TabDefinition[], value: string): string {
  return tabs.find(tab => tab.value === value)?.label ?? '';
}

function tabButton(tab: TabDefinition, value: Observable<string>, choose: (value: string) => void): UiElement {
  const selected = value.pipe(map(current => current === tab.value));
  return Row(
    {
      key: tab.value,
      modifiers: [CONTROL_INTERACTION],
      padding: 8,
      borderRadius: 6,
      disabled: tab.disabled === true,
      backgroundColor: selected.pipe(map(on => (on ? 'controlBackgroundHovered' : 'transparent'))),
      role: 'tab',
      label: tab.label,
      states: selected.pipe(map(on => (on ? (['selected'] as UiSemanticState[]) : []))),
      onClick: () => {
        if (tab.disabled !== true) {
          choose(tab.value);
        }
      }
    },
    Text({
      text: tab.label,
      color: tab.disabled === true ? 'controlForegroundDisabled' : 'controlForeground',
      selectable: false
    })
  );
}

// ---------------------------------------------------------------------------
// Accordion
// ---------------------------------------------------------------------------

export interface AccordionSection {
  readonly value: string;
  readonly label: string;
  readonly content: UiChild;
  readonly disabled?: boolean;
}

export interface AccordionProps extends ControlLayoutProps {
  /** The open sections. Omit to let the accordion manage them. */
  open?: readonly string[];
  defaultOpen?: readonly string[];
  onOpenChange?: (open: readonly string[]) => void;
  sections: readonly AccordionSection[];
  /** Only one section open at a time. */
  exclusive?: boolean;
}

export function Accordion(props: Inputs<AccordionProps>, _ctx: ComponentContext): UiChild {
  const exclusive = input(props.exclusive, false);
  const open = controlled<readonly string[]>({
    component: 'Accordion',
    name: 'open',
    source: props.open,
    initial: props.defaultOpen,
    fallback: [],
    onChange: props.onOpenChange
  });

  const toggle = (value: string): void => {
    const current = open.current();
    if (current.includes(value)) {
      open.change(current.filter(entry => entry !== value));
      return;
    }
    open.change(exclusive.value ? [value] : [...current, value]);
  };

  return Column(
    { ...layoutOf(props), gap: 4 },
    props.sections.pipe(map(sections => sections.map(section => panel(section, open.value, toggle))))
  );
}

function panel(
  section: AccordionSection,
  open: Observable<readonly string[]>,
  toggle: (value: string) => void
): UiElement {
  const expanded = open.pipe(map(values => values.includes(section.value)));
  return Column(
    { key: section.value, gap: 4 },
    Row(
      {
        focusable: true,
        modifiers: [CONTROL_INTERACTION],
        y: 'center',
        gap: 8,
        padding: 8,
        borderRadius: 6,
        disabled: section.disabled === true,
        role: 'button',
        label: section.label,
        states: expanded.pipe(map(on => [on ? 'expanded' : 'collapsed'] as UiSemanticState[])),
        onClick: () => {
          if (section.disabled !== true) {
            toggle(section.value);
          }
        },
        onKeyDown: keymap({
          ' ': () => toggle(section.value),
          Enter: () => toggle(section.value)
        })
      },
      Text({ text: expanded.pipe(map(on => (on ? '▾' : '▸'))), color: 'controlForeground', selectable: false }),
      Text({ text: section.label, color: 'controlForeground', selectable: false })
    ),
    // A closed section is not in the tree at all, so it costs no layout
    // and says nothing to a screen reader.
    expanded.pipe(map(on => (on ? [Box({ padding: 8 }, section.content)] : [])))
  );
}
