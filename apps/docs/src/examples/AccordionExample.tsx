import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { Accordion, type AccordionSection } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

// #region accordion
/**
 * The sections, declared once at module scope.
 *
 * Each one carries its own content, so a section is a value rather
 * than a pair of elements the caller has to keep in step. `Retention`
 * is marked `disabled`: it is drawn, refuses a click, and cannot be
 * focused, so the keyboard walks past it.
 */
const SETTINGS: readonly AccordionSection[] = [
  {
    value: 'basics',
    label: 'Basics',
    content: <text text="Name, time zone and the language the app is read in." fontSize={13} color="text" />
  },
  {
    value: 'notifications',
    label: 'Notifications',
    content: <text text="What is worth interrupting someone for, and by which route." fontSize={13} color="text" />
  },
  {
    value: 'retention',
    label: 'Retention',
    content: <text text="How long a deleted item is recoverable." fontSize={13} color="text" />,
    disabled: true
  }
];

const SHIPPING: readonly AccordionSection[] = [
  {
    value: 'delivery',
    label: 'When will it arrive?',
    content: <text text="Two to five working days, and sooner within the city." fontSize={13} color="text" />
  },
  {
    value: 'returns',
    label: 'Can I send it back?',
    content: <text text="Within thirty days, in the packaging it arrived in." fontSize={13} color="text" />
  }
];

/** The section the application will not let anyone close. */
const PINNED = 'basics';

/**
 * Two accordions, and the two ways the open set can be owned.
 *
 * **Settings is controlled.** The application holds the list of open
 * sections and writes back every change except one: `Basics` is
 * pinned, so clicking its header does not close it. The Expand all
 * button opens everything with no gesture at all, which is the same
 * write arriving from somewhere else in the application.
 *
 * **Shipping is uncontrolled and `exclusive`.** It owns its own open
 * set, and opening one section closes the other.
 *
 * Every header is its own tab stop. Tab to one and press Space or
 * Enter to open and close it. A closed section is not in the tree at
 * all, so it costs no layout and says nothing to a screen reader.
 */
export function Settings(_props: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState<readonly string[]>([PINNED]);

  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)}>
      <text text="Settings" fontSize={13} fontWeight={600} color="text" />
      <Accordion
        sections={SETTINGS}
        open={open}
        onOpenChange={next => (open.value = next.includes(PINNED) ? next : [PINNED, ...next])}
      />

      <row gap={12} y="center">
        <button
          label="Expand all"
          onClick={() => (open.value = ['basics', 'notifications'])}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Expand all" fontSize={12} color="text" />
        </button>
        <text
          text={open.pipe(map(values => `${values.length} open, and Basics stays open`))}
          fontSize={12}
          color="textMuted"
        />
      </row>

      <text text="Shipping" fontSize={13} fontWeight={600} color="text" />
      <Accordion sections={SHIPPING} defaultOpen={['delivery']} exclusive />
    </column>
  );
}
// #endregion accordion
