import { map } from 'rxjs/operators';

import { Accordion, Button, TextInput, type AccordionSection } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** A paragraph as a section's content. */
function words(text: string) {
  return (
    <text color="text" textWrap="word">
      {text}
    </text>
  );
}

const faq = (): readonly AccordionSection[] => [
  { value: 'Shipping', label: 'Shipping', content: words('Orders leave the warehouse within two working days.') },
  { value: 'Returns', label: 'Returns', content: words('Anything unworn can come back within thirty days.') },
  { value: 'Warranty', label: 'Warranty', content: words('Two years on every part, labour included.') }
];

const withDisabled = (): readonly AccordionSection[] => [
  faq()[0],
  { value: 'Billing', label: 'Billing (locked)', disabled: true, content: words('You should never see this.') },
  { value: 'Terms', label: 'Terms (locked open)', disabled: true, content: words('Locked open: it cannot be closed.') },
  faq()[2]
];

const long = (): readonly AccordionSection[] => [
  {
    value: 'long',
    label: 'What happens to an order that is held at the border for customs clearance for longer than a week?',
    content: words(
      'We contact the carrier on the eighth day, and if the parcel is still held we send a replacement at our cost and recover the original when it is released. Nothing is needed from you unless the customs office asks for an invoice, which we send on your behalf. '.repeat(
        3
      )
    )
  },
  { value: 'Unbroken', label: 'Supercalifragilisticexpialidocious-without-a-space', content: words('Short.') }
];

/** An accordion and a line naming the open sections, so a toggle can be seen to land. */
function Listed(
  inputs: Inputs<{ sections: readonly AccordionSection[]; exclusive?: boolean; defaultOpen?: readonly string[] }>,
  _ctx: ComponentContext
) {
  const open = internalState<readonly string[]>(inputs.defaultOpen.value ?? []);
  return (
    <column gap={8} x="stretch">
      <Accordion
        sections={inputs.sections.value}
        exclusive={inputs.exclusive.value}
        defaultOpen={inputs.defaultOpen.value}
        onOpenChange={next => (open.value = next)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {open.pipe(map(values => (values.length === 0 ? 'Open: none' : `Open: ${values.join(', ')}`)))}
      </text>
    </column>
  );
}

/** The application owns which sections are open. */
function Controlled(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState<readonly string[]>(['Returns']);
  return (
    <column gap={8} x="stretch">
      <row gap={8}>
        <Button
          label="Open all"
          variant="outlined"
          onClick={() => (open.value = faq().map(section => section.value))}
        />
        <Button label="Close all" variant="outlined" onClick={() => (open.value = [])} />
      </row>
      <Accordion sections={faq()} open={open} onOpenChange={next => (open.value = next)} />
      <text textStyle="bodySmall" color="textMuted">
        {open.pipe(map(values => (values.length === 0 ? 'Open: none' : `Open: ${values.join(', ')}`)))}
      </text>
    </column>
  );
}

const fields = (): readonly AccordionSection[] => [
  {
    value: 'Address',
    label: 'Address',
    content: (
      <column gap={8} x="stretch">
        <TextInput label="Street" placeholder="1 Main St" />
        <TextInput label="City" placeholder="Wellington" />
      </column>
    )
  },
  { value: 'Notes', label: 'Notes', content: <TextInput label="Note" multiline placeholder="Leave at the door" /> }
];

const nested = (): readonly AccordionSection[] => [
  {
    value: 'Outer one',
    label: 'Outer one',
    content: (
      <Accordion
        sections={[
          { value: 'Inner A', label: 'Inner A', content: words('Inside A.') },
          { value: 'Inner B', label: 'Inner B', content: words('Inside B.') }
        ]}
      />
    )
  },
  faq()[1]
];

export const accordionFixture: WorkbenchFixture = {
  id: 'accordion',
  name: 'Accordion',
  source: 'packages/components/src/Structure.ts',
  states: [
    {
      name: 'Several open',
      try: 'Click Shipping, then Warranty: both stay open and the chevrons point down. Tab walks the three headers with a ring shown only after Tab; Space and Enter toggle the one focused. The line lists what is open, in the order opened.',
      stretch: true,
      render: () => <Listed sections={faq()} />
    },
    {
      name: 'One at a time',
      try: 'Open Shipping, then Returns: Shipping closes as Returns opens, and the line only ever names one. Clicking the open one closes it, leaving none.',
      stretch: true,
      render: () => <Listed sections={faq()} exclusive defaultOpen={['Shipping']} />
    },
    {
      name: 'Disabled sections',
      try: 'Billing and Terms look disabled. Clicking them does nothing, Tab skips them, and Terms, which starts open, cannot be closed by any means. Shipping and Warranty work as usual.',
      stretch: true,
      render: () => <Listed sections={withDisabled()} defaultOpen={['Terms']} />
    },
    {
      name: 'Controlled',
      try: 'Open all opens every section and Close all closes them, and clicking a header still toggles it; the line agrees with what is drawn every time.',
      width: 320,
      stretch: true,
      render: () => <Controlled />
    },
    {
      name: 'Long label and content',
      try: 'The long header wraps beside its chevron, which stays at the first line; the unbroken label does not draw past the card. Opened, the paragraph wraps within the card.',
      stretch: true,
      render: () => <Listed sections={long()} />
    },
    {
      name: 'Fields inside',
      try: 'Open Address and Tab: focus goes from the header into Street and City, then to the Notes header. Collapse and reopen Address: the fields come back and take typing (empty again, as a closed section leaves the tree). Space in a field types a space, not a toggle.',
      stretch: true,
      render: () => <Listed sections={fields()} />
    },
    {
      name: 'Nested',
      try: 'Open Outer one, then Inner A: both sets of chevrons and indents read clearly. Closing Outer one and reopening it shows the inner accordion closed again. Enter on an inner header toggles only it.',
      stretch: true,
      render: () => <Listed sections={nested()} />
    }
  ]
};
