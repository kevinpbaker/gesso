import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { PlainView, type PlainAction, type PlainLimits } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

function describeAction(action: PlainAction | null): string {
  return action === null ? 'Nothing done yet' : `Last action: ${action.action} = ${JSON.stringify(action.value)}`;
}

/**
 * A view of a fixed tree, with what it reported (actions and problems)
 * written under it.
 */
function Hosted(inputs: Inputs<{ tree: unknown; limits?: PlainLimits }>, _ctx: ComponentContext) {
  const last = internalState<PlainAction | null>(null);
  const problems = internalState<readonly string[]>([]);
  return (
    <column gap={8} width={percent(100)}>
      <PlainView
        node={inputs.tree.value}
        label="Plugin view"
        limits={inputs.limits.value}
        onAction={action => (last.value = action)}
        onProblem={list => (problems.value = list)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {last.pipe(map(describeAction))}
      </text>
      <text textStyle="bodySmall" color="danger" textWrap="word">
        {problems.pipe(map(list => (list.length === 0 ? '' : `Problems: ${list.join(' | ')}`)))}
      </text>
    </column>
  );
}

const SMALL_SCREEN = {
  type: 'column',
  gap: 10,
  children: [
    { type: 'heading', text: 'Export' },
    { type: 'text', text: 'Choose what to export and where it goes.', tone: 'muted' },
    { type: 'textInput', label: 'File name', value: 'report.csv', placeholder: 'name.csv', action: 'name' },
    {
      type: 'select',
      label: 'Format',
      value: 'csv',
      options: [
        { value: 'csv', label: 'Comma separated' },
        { value: 'tsv', label: 'Tab separated' },
        { value: 'json', label: 'JSON' }
      ],
      action: 'format'
    },
    { type: 'checkbox', label: 'Include the header row', checked: true, action: 'header' },
    { type: 'divider' },
    {
      type: 'row',
      gap: 8,
      children: [
        { type: 'button', label: 'Export', variant: 'filled', action: 'export' },
        { type: 'button', label: 'Cancel', variant: 'plain', action: 'cancel' },
        { type: 'button', label: 'Disabled', disabled: true, action: 'never' }
      ]
    }
  ]
};

/** The tree is sent again every second with a new count in it, as a plugin polling something would. */
function Resent(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const tick = internalState(0);
  const last = internalState<PlainAction | null>(null);
  const timer = setInterval(() => (tick.value += 1), 1000);
  ctx.onUnmount(() => clearInterval(timer));
  const tree = tick.pipe(
    map(count => ({
      type: 'column',
      gap: 10,
      children: [
        { type: 'text', key: 'count', text: `Sent ${count} times` },
        // Sent with the same old value each time: what is typed must win.
        { type: 'textInput', key: 'name', label: 'Name', value: 'from the sender', action: 'name' },
        { type: 'checkbox', key: 'on', label: 'A box the sender always sends unticked', checked: false, action: 'on' },
        { type: 'button', key: 'go', label: 'Press me', action: 'go' }
      ]
    }))
  );
  return (
    <column gap={8} width={percent(100)}>
      <PlainView node={tree} label="Resent" onAction={action => (last.value = action)} />
      <text textStyle="bodySmall" color="textMuted">
        {last.pipe(map(describeAction))}
      </text>
    </column>
  );
}

/** Keyed buttons in an order that a button press shuffles. */
function Reordered(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const order = internalState<readonly string[]>(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  const last = internalState<PlainAction | null>(null);
  const tree = order.pipe(
    map(names => ({
      type: 'row',
      gap: 6,
      children: names.map(name => ({ type: 'button', key: name, label: name, action: name }))
    }))
  );
  return (
    <column gap={8} width={percent(100)}>
      <PlainView
        node={tree}
        label="Reordered"
        onAction={action => {
          last.value = action;
          // Pressing any of them rotates the row, so the pressed one moves under the pointer.
          order.value = [...order.value.slice(1), order.value[0]];
        }}
      />
      <text textStyle="bodySmall" color="textMuted">
        {last.pipe(map(describeAction))}
      </text>
    </column>
  );
}

/** A node that is text one second and a button the next. */
function Shapeshifter(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const flip = internalState(false);
  const timer = setInterval(() => (flip.value = !flip.value), 1500);
  ctx.onUnmount(() => clearInterval(timer));
  const tree = flip.pipe(
    map(on => ({
      type: 'column',
      children: [
        on
          ? { type: 'button', key: 'thing', label: 'Now a button', action: 'thing' }
          : { type: 'text', key: 'thing', text: 'Now some text' },
        { type: 'text', key: 'mono', text: on ? 'mono: on' : 'mono: off', mono: on }
      ]
    }))
  );
  return <PlainView node={tree} label="Changing" />;
}

const LIST = {
  type: 'column',
  grow: true,
  children: [
    { type: 'text', text: 'Double-click or press Enter on an item.', tone: 'muted', style: 'bodySmall' },
    {
      type: 'list',
      label: 'Results',
      action: 'open',
      items: Array.from({ length: 5000 }, (_, at) => ({
        id: `result-${at + 1}`,
        label: `Result ${at + 1}${at % 7 === 0 ? ' with a label long enough that it has to be cut short somewhere' : ''}`,
        detail: `src/file-${at % 40}.ts:${at + 1}`
      }))
    }
  ]
};

const BROKEN = {
  type: 'column',
  children: [
    { type: 'text', text: 'This text is fine and should draw.' },
    { type: 'marquee', text: 'Not an element this view has' },
    null,
    'a bare string',
    { type: 'button', label: 'A button with no action' },
    { type: 'select', label: 'No options', value: 'x', options: [] },
    { type: 'row', children: 'not a list' },
    { type: 'text', text: 42, tone: 'shouting', style: 'huge' },
    { type: 'textInput', label: 'Huge width', width: 99999, action: 'w' },
    { type: 'button', label: 'This one works', action: 'works' }
  ]
};

const TOO_BIG = {
  type: 'column',
  children: [
    {
      type: 'row',
      gap: 4,
      children: Array.from({ length: 50 }, (_, at) => ({ type: 'button', label: String(at + 1), action: `b${at + 1}` }))
    },
    {
      type: 'column',
      children: [{ type: 'column', children: [{ type: 'column', children: [{ type: 'text', text: 'Too deep' }] }] }]
    }
  ]
};

const TEXTS = {
  type: 'column',
  gap: 8,
  children: [
    { type: 'heading', text: 'A heading long enough that it must wrap onto a second line in a narrow card' },
    {
      type: 'text',
      oneLine: true,
      text: 'One line only: this sentence is far too long for the card and must end in an ellipsis'
    },
    { type: 'text', text: 'Wrapped: this sentence is far too long for the card and must wrap onto further lines.' },
    { type: 'text', mono: true, text: 'const mono = "a monospace line";' },
    { type: 'text', tone: 'danger', text: 'Danger tone' },
    { type: 'text', tone: 'primary', text: 'Primary tone' },
    { type: 'text', tone: 'muted', style: 'bodySmall', text: 'Muted, small' },
    { type: 'text', style: 'label', text: 'Label style' },
    { type: 'text', text: 'x'.repeat(400) }
  ]
};

export const plainViewFixture: WorkbenchFixture = {
  id: 'plain-view',
  name: 'PlainView',
  source: 'packages/components/src/PlainView.ts',
  states: [
    {
      name: 'A small screen',
      try: 'Type in the field, change the select, tick the box and press Export and Cancel: each writes its action and value on the line. Disabled does nothing. Every control looks like the library’s own.',
      width: 340,
      stretch: true,
      render: () => <Hosted tree={SMALL_SCREEN} />
    },
    {
      name: 'Sent again every second',
      try: 'The count climbs. Type in Name and keep typing across a tick: the text and caret stay put. Tick the box: it stays ticked until the next send, then follows the sender. Tab to Press me and wait: focus stays on it.',
      width: 340,
      stretch: true,
      render: () => <Resent />
    },
    {
      name: 'Reordered by key',
      try: 'Press any button: the row rotates and the line names the one pressed. Tab to a button and press Space repeatedly: focus follows the same button as it moves, never jumping to whatever took its place.',
      width: 340,
      render: () => <Reordered />
    },
    {
      name: 'A node changing type',
      try: 'Every second and a half the first line turns between text and a button, and the second between a normal and a monospace font. Nothing is left behind from the previous shape and the card does not grow each time.',
      width: 280,
      render: () => <Shapeshifter />
    },
    {
      name: 'A long list',
      try: 'Five thousand items. Scroll fast: no blanks or repeats. Long labels end in an ellipsis before their detail. Double-click an item, or choose one and press Enter: the line names its id.',
      width: 360,
      height: 360,
      stretch: true,
      render: () => <Hosted tree={LIST} />
    },
    {
      name: 'A broken tree',
      try: 'The first line and "This one works" draw; everything else is left out or drawn safely, and the red line lists each problem in words. Nothing throws, and the text field is no wider than the card allows.',
      width: 360,
      stretch: true,
      render: () => <Hosted tree={BROKEN} />
    },
    {
      name: 'Over its limits',
      try: 'Limits of 20 nodes and depth 2: only the first buttons draw (fewer than 20), "Too deep" does not, and the red line says the rest were left out. The buttons wrap or clip inside the card, never past it.',
      width: 360,
      stretch: true,
      render: () => <Hosted tree={TOO_BIG} limits={{ nodes: 20, depth: 2 }} />
    },
    {
      name: 'Text',
      try: 'The heading wraps; the one-line text ends in an ellipsis; the wrapped one wraps; mono is monospace; each tone has its own colour and stays readable in Dark. The run of x’s wraps or clips inside the card.',
      width: 240,
      stretch: true,
      render: () => <Hosted tree={TEXTS} />
    },
    {
      name: 'Nothing sent',
      try: 'A null tree: nothing is drawn, and the red line says it was not an element. The card stays small.',
      width: 280,
      render: () => <Hosted tree={null} />
    }
  ]
};
