import { map } from 'rxjs/operators';

import { Button, Dialog, Menu, TextInput, Toast, type MenuItem } from 'gesso-components';
import type { UiNode } from 'gesso-core';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** The line under a trigger that says what last happened, so a choice can be seen to land. */
function Said(inputs: Inputs<{ text: string }>) {
  return (
    <text textStyle="bodySmall" color="textMuted">
      {inputs.text}
    </text>
  );
}

/** A confirmation with two buttons, the ordinary dialog. */
function Confirm(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const said = internalState('Nothing chosen yet');
  const choose = (what: string) => () => {
    said.value = `Chose: ${what}`;
    open.value = false;
  };
  return (
    <column gap={8} x="start">
      <Button label="Delete note…" onClick={() => (open.value = true)} />
      <Said text={said} />
      <Dialog
        open={open}
        onClose={() => (open.value = false)}
        title="Delete this note?"
        description="It goes from every device. This cannot be undone."
        content={
          <row gap={8}>
            <Button label="Cancel" variant="outlined" onClick={choose('Cancel')} />
            <Button label="Delete" tone="danger" onClick={choose('Delete')} />
          </row>
        }
      />
    </column>
  );
}

/** Escape and the backdrop are refused; only its own button closes it. */
function Stubborn(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const said = internalState('Not started');
  return (
    <column gap={8} x="start">
      <Button label="Start upload" onClick={() => (open.value = true)} />
      <Said text={said} />
      <Dialog
        open={open}
        dismissible={false}
        width={300}
        onClose={() => (open.value = false)}
        title="Uploading"
        description="Escape and a press outside are both ignored."
        content={
          <Button
            label="Stop the upload"
            variant="outlined"
            onClick={() => {
              said.value = 'Chose: Stop the upload';
              open.value = false;
            }}
          />
        }
      />
    </column>
  );
}

const PARAGRAPHS = Array.from(
  { length: 40 },
  (_, index) =>
    `Clause ${index + 1}. The licensee keeps every copy of the work in a place the licensor can inspect on a week's notice.`
);

/** A body far taller than any window, with a field at the very end of it. */
function Tall(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const said = internalState('Not agreed');
  return (
    <column gap={8} x="start">
      <Button label="Read the terms" onClick={() => (open.value = true)} />
      <Said text={said} />
      <Dialog
        open={open}
        onClose={() => (open.value = false)}
        title="Licence terms"
        description="Forty clauses, then a field and a button."
        width={420}
        content={
          <column gap={8} x="stretch">
            {PARAGRAPHS.map(paragraph => (
              <text key={paragraph} textWrap="word" color="text">
                {paragraph}
              </text>
            ))}
            <TextInput label="Your initials" placeholder="KB" />
            <Button
              label="Agree"
              onClick={() => {
                said.value = 'Chose: Agree';
                open.value = false;
              }}
            />
          </column>
        }
      />
    </column>
  );
}

/** Asks for a width no window has. */
function Wide(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  return (
    <column gap={8} x="start">
      <Button label="Open a 2000px dialog" onClick={() => (open.value = true)} />
      <Dialog
        open={open}
        onClose={() => (open.value = false)}
        width={2000}
        title="A dialog wider than the window"
        description="Its right edge, and the Close button at its end, should both be on screen."
        content={
          <row gap={8} x="end">
            <Button label="Close" onClick={() => (open.value = false)} />
          </row>
        }
      />
    </column>
  );
}

/** No scrim, and not dismissible: the page stays visible and still refuses presses. */
function Unscrimmed(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const presses = internalState(0);
  return (
    <column gap={8} x="start">
      <row gap={8}>
        <Button label="Open" onClick={() => (open.value = true)} />
        <Button label="Count" variant="outlined" onClick={() => (presses.value += 1)} />
      </row>
      <Said text={presses.pipe(map(count => `Count pressed ${count} times`))} />
      <Dialog
        open={open}
        scrim={false}
        dismissible={false}
        onClose={() => (open.value = false)}
        title="Nothing is dimmed"
        description="Try pressing Count behind this. It must not count."
        content={<Button label="Close" onClick={() => (open.value = false)} />}
      />
    </column>
  );
}

/** A dialog that opens a second one from inside. */
function Stacked(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const outer = internalState(false);
  const inner = internalState(false);
  const said = internalState('Nothing chosen yet');
  return (
    <column gap={8} x="start">
      <Button label="Open settings" onClick={() => (outer.value = true)} />
      <Said text={said} />
      <Dialog
        open={outer}
        onClose={() => (outer.value = false)}
        title="Settings"
        description="The button below opens a second dialog over this one."
        content={
          <row gap={8}>
            <Button label="Reset everything…" tone="danger" onClick={() => (inner.value = true)} />
            <Button label="Done" variant="outlined" onClick={() => (outer.value = false)} />
          </row>
        }
      />
      <Dialog
        open={inner}
        onClose={() => (inner.value = false)}
        width={300}
        title="Are you sure?"
        content={
          <row gap={8}>
            <Button label="Keep" variant="outlined" onClick={() => (inner.value = false)} />
            <Button
              label="Reset"
              tone="danger"
              onClick={() => {
                said.value = 'Chose: Reset';
                inner.value = false;
              }}
            />
          </row>
        }
      />
    </column>
  );
}

const MOVE_TO: readonly MenuItem[] = [
  { value: 'Inbox', label: 'Inbox' },
  { value: 'Archive', label: 'Archive' },
  { value: 'Spam', label: 'Spam', disabled: true },
  { value: 'Trash', label: 'Trash', danger: true, separator: true }
];

/** A menu opened from a button inside the dialog. */
function WithMenu(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const menu = internalState(false);
  const anchor = internalState<UiNode | null>(null);
  const said = internalState('Nothing chosen yet');
  return (
    <column gap={8} x="start">
      <Button label="Move message…" onClick={() => (open.value = true)} />
      <Said text={said} />
      <Dialog
        open={open}
        onClose={() => (open.value = false)}
        title="Move message"
        content={
          <column gap={8} x="start">
            <Button ref={node => (anchor.value = node)} label="Choose a folder ▾" onClick={() => (menu.value = true)} />
            <Said text={said} />
            <Menu
              open={menu}
              anchor={anchor}
              label="Folders"
              items={MOVE_TO}
              onOpenChange={next => (menu.value = next)}
              onSelect={value => (said.value = `Chose: ${value}`)}
            />
          </column>
        }
      />
    </column>
  );
}

/** A toast raised from inside an open dialog. */
function WithToast(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const toast = internalState(false);
  return (
    <column gap={8} x="start">
      <Button label="Open" onClick={() => (open.value = true)} />
      <Dialog
        open={open}
        onClose={() => (open.value = false)}
        title="Share link"
        content={
          <row gap={8}>
            <Button label="Copy link" onClick={() => (toast.value = true)} />
            <Button label="Close" variant="outlined" onClick={() => (open.value = false)} />
          </row>
        }
      />
      <Toast open={toast} message="Link copied" duration={0} onClose={() => (toast.value = false)} />
    </column>
  );
}

/** Closes itself on a timer, whatever is open inside it at the time. */
function SelfClosing(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const open = internalState(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  ctx.onUnmount(() => clearTimeout(timer));
  const menu = internalState(false);
  const anchor = internalState<UiNode | null>(null);
  const said = internalState('Closed');
  const start = (): void => {
    open.value = true;
    said.value = 'Open: closing in 3 seconds';
    clearTimeout(timer);
    timer = setTimeout(() => {
      open.value = false;
      said.value = 'Closed by the timer';
    }, 3000);
  };
  return (
    <column gap={8} x="start">
      <Button label="Open for 3 seconds" onClick={start} />
      <Said text={said} />
      <Dialog
        open={open}
        onClose={() => (open.value = false)}
        title="Going away"
        description="Open the menu before the timer runs out."
        content={
          <column gap={8} x="start">
            <Button ref={node => (anchor.value = node)} label="Open the menu" onClick={() => (menu.value = true)} />
            <Menu
              open={menu}
              anchor={anchor}
              items={MOVE_TO}
              onOpenChange={next => (menu.value = next)}
              onSelect={value => (said.value = `Chose: ${value}`)}
            />
          </column>
        }
      />
    </column>
  );
}

/** Nothing focusable inside: a sentence and no buttons. */
function NothingFocusable(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  return (
    <column gap={8} x="start">
      <Button label="Open" onClick={() => (open.value = true)} />
      <Dialog
        open={open}
        onClose={() => (open.value = false)}
        title="Read only"
        content={
          <text textWrap="word" color="text">
            This dialog has nothing to press. Escape is the way out.
          </text>
        }
      />
    </column>
  );
}

export const dialogFixture: WorkbenchFixture = {
  id: 'dialog',
  name: 'Dialog',
  source: 'packages/components/src/Dialog.ts',
  states: [
    {
      name: 'Confirm',
      try: 'Open it with the keyboard (Tab, Enter): focus lands inside and Tab / Shift+Tab cycle only Cancel and Delete. Escape closes it and the focus ring is back on the trigger. Choose Delete: the line says so. Switch to Dark and open again: the dialog is dark too.',
      render: () => <Confirm />
    },
    {
      name: 'Not dismissible',
      try: 'Escape does nothing and clicking the dimmed page does nothing. Only Stop the upload closes it, and the line says so.',
      render: () => <Stubborn />
    },
    {
      name: 'Taller than the window',
      try: 'The dialog stops 16px short of the top and bottom; the title stays put while the clauses scroll. Tab to the field at the end: it scrolls into view with its focus ring uncut.',
      render: () => <Tall />
    },
    {
      name: 'Wider than the window',
      try: 'It is clamped to the window less a margin on each side, and Close at its right end is fully visible. Narrow the window: it narrows with it.',
      render: () => <Wide />
    },
    {
      name: 'No scrim',
      try: 'The page is not dimmed but presses outside go nowhere: Count stays where it was while the dialog is open.',
      width: 320,
      render: () => <Unscrimmed />
    },
    {
      name: 'Dialog over dialog',
      try: 'Open Settings, then Reset everything. Escape closes only the top one and focus is back on Reset everything; a second Escape closes Settings and focus is back on Open settings. Both scrims stack visibly darker.',
      render: () => <Stacked />
    },
    {
      name: 'Menu inside',
      try: 'Open the menu from inside the dialog: it sits under its button, above the dialog. Escape closes the menu only; a second Escape closes the dialog. Choosing Archive updates both lines and leaves the dialog open with focus on the menu button.',
      render: () => <WithMenu />
    },
    {
      name: 'Toast while open',
      try: 'Copy link: the toast appears bottom left, drawn above the scrim and readable. Its ✕ closes it and the dialog stays open with focus still inside.',
      render: () => <WithToast />
    },
    {
      name: 'Closes under an open menu',
      try: 'Open it, then open the menu, and wait. When the timer closes both, focus goes back to the trigger and Tab moves through the page normally rather than being stuck.',
      render: () => <SelfClosing />
    },
    {
      name: 'Nothing focusable',
      try: 'A dialog with only text: Escape still closes it, and Tab never escapes to the page behind.',
      render: () => <NothingFocusable />
    }
  ]
};
