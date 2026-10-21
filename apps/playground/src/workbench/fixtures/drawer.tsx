import { map } from 'rxjs/operators';

import {
  Button,
  Checkbox,
  Dialog,
  Drawer,
  Menu,
  Select,
  TextInput,
  type DrawerSide,
  type MenuItem,
  type SelectOption
} from 'gesso-components';
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

/** A modal drawer holding a small form, the ordinary use. */
function Form(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const said = internalState('Nothing saved yet');
  return (
    <column gap={8} x="start">
      <Button label="Edit profile" onClick={() => (open.value = true)} />
      <Said text={said} />
      <Drawer
        open={open}
        onOpenChange={next => (open.value = next)}
        title="Edit profile"
        description="Tab cycles the fields and buttons in here and never reaches the page."
        content={
          <column gap={12} x="stretch">
            <TextInput label="Name" placeholder="Ada Lovelace" />
            <TextInput label="Email" placeholder="ada@example.com" />
            <Checkbox label="Send me the newsletter" />
            <row gap={8}>
              <Button label="Cancel" variant="outlined" onClick={() => (open.value = false)} />
              <Button
                label="Save"
                onClick={() => {
                  said.value = 'Saved';
                  open.value = false;
                }}
              />
            </row>
          </column>
        }
      />
    </column>
  );
}

/** One button per side given, each opening a drawer on that side. */
function Sides(inputs: Inputs<{ sides: readonly DrawerSide[]; modal?: boolean }>, _ctx: ComponentContext) {
  const open = internalState<DrawerSide | null>(null);
  const said = internalState('Pressed nothing on the page');
  const presses = internalState(0);
  return (
    <column gap={8} x="start">
      <row gap={8} flexWrap="wrap">
        {inputs.sides.value.map(side => (
          <Button key={side} label={`Open ${side}`} onClick={() => (open.value = side)} />
        ))}
        <Button
          label="Page button"
          variant="outlined"
          onClick={() => {
            presses.value += 1;
            said.value = `Page button pressed ${presses.value} times`;
          }}
        />
      </row>
      <Said text={said} />
      {inputs.sides.value.map(side => (
        <Drawer
          key={side}
          open={open.pipe(map(which => which === side))}
          onOpenChange={next => (open.value = next ? side : null)}
          side={side}
          modal={inputs.modal.value ?? true}
          size={side === 'top' || side === 'bottom' ? 220 : 300}
          title={`Side: ${side}`}
          content={
            <text textWrap="word" color="text">
              {`This drawer was asked for the ${side} edge.`}
            </text>
          }
        />
      ))}
    </column>
  );
}

const CLAUSES = Array.from(
  { length: 40 },
  (_, index) =>
    `Clause ${index + 1}. The licensee keeps every copy of the work in a place the licensor can inspect on a week's notice.`
);

/** Content far taller than any window, with a field at the very end. */
function Tall(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  return (
    <column gap={8} x="start">
      <Button label="Read the terms" onClick={() => (open.value = true)} />
      <Drawer
        open={open}
        onOpenChange={next => (open.value = next)}
        side="end"
        size={360}
        title="Licence terms"
        description="Forty clauses, then a field and a button."
        content={
          <column gap={8} x="stretch">
            {CLAUSES.map(clause => (
              <text key={clause} textWrap="word" color="text">
                {clause}
              </text>
            ))}
            <TextInput label="Your initials" placeholder="AL" />
            <Button label="Agree" onClick={() => (open.value = false)} />
          </column>
        }
      />
    </column>
  );
}

/** Asks for more room than any window has. */
function Oversized(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  return (
    <column gap={8} x="start">
      <Button label="Open a 2000px drawer" onClick={() => (open.value = true)} />
      <Drawer
        open={open}
        onOpenChange={next => (open.value = next)}
        size={2000}
        title="A drawer wider than the window, with a title long enough to wrap onto a second line"
        content={<Button label="Close from inside" onClick={() => (open.value = false)} />}
      />
    </column>
  );
}

/** Not dismissible: only its own button closes it. */
function Stubborn(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  return (
    <column gap={8} x="start">
      <Button label="Start export" onClick={() => (open.value = true)} />
      <Drawer
        open={open}
        onOpenChange={next => (open.value = next)}
        dismissible={false}
        side="bottom"
        size={160}
        title="Exporting"
        content={<Button label="Stop the export" variant="outlined" onClick={() => (open.value = false)} />}
      />
    </column>
  );
}

const ACTIONS: readonly MenuItem[] = [
  { value: 'Rename', label: 'Rename' },
  { value: 'Duplicate', label: 'Duplicate' },
  { value: 'Delete', label: 'Delete', danger: true, separator: true }
];

const SORTS: readonly SelectOption[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'By name' }
];

/** A menu and a select opened from inside the drawer. */
function WithPopups(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const open = internalState(false);
  const menu = internalState(false);
  const anchor = internalState<UiNode | null>(null);
  const said = internalState('Nothing chosen yet');
  return (
    <column gap={8} x="start">
      <Button label="Open list settings" onClick={() => (open.value = true)} />
      <Said text={said} />
      <Drawer
        open={open}
        onOpenChange={next => (open.value = next)}
        title="List settings"
        content={
          <column gap={12} x="start">
            <Select label="Sort" options={SORTS} defaultValue="newest" />
            <Button ref={node => (anchor.value = node)} label="Actions ▾" onClick={() => (menu.value = true)} />
            <Said text={said} />
            <Menu
              open={menu}
              anchor={anchor}
              label="Actions"
              items={ACTIONS}
              onOpenChange={next => (menu.value = next)}
              onSelect={value => (said.value = `Chose: ${value}`)}
            />
          </column>
        }
      />
    </column>
  );
}

/** A drawer opened from a button inside a dialog. */
function FromDialog(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const dialog = internalState(false);
  const drawer = internalState(false);
  return (
    <column gap={8} x="start">
      <Button label="Open settings" onClick={() => (dialog.value = true)} />
      <Dialog
        open={dialog}
        onClose={() => (dialog.value = false)}
        title="Settings"
        description="The button below opens a drawer over this dialog."
        content={
          <row gap={8}>
            <Button label="Advanced…" onClick={() => (drawer.value = true)} />
            <Button label="Done" variant="outlined" onClick={() => (dialog.value = false)} />
          </row>
        }
      />
      <Drawer
        open={drawer}
        onOpenChange={next => (drawer.value = next)}
        side="end"
        title="Advanced"
        content={
          <column gap={12} x="start">
            <Checkbox label="Experimental renderer" />
            <Button label="Back" variant="outlined" onClick={() => (drawer.value = false)} />
          </column>
        }
      />
    </column>
  );
}

export const drawerFixture: WorkbenchFixture = {
  id: 'drawer',
  name: 'Drawer',
  source: 'packages/components/src/Drawer.ts',
  states: [
    {
      name: 'Form inside',
      try: 'Open it with the keyboard (Tab, Enter): it slides in from the left, the page dims, and focus lands on the close button. Tab and Shift+Tab cycle the fields and buttons inside and never reach the page. Escape slides it out and the focus ring is back on Edit profile. Switch to Dark and open again: the drawer is dark too.',
      render: () => <Form />
    },
    {
      name: 'Start and end',
      try: 'Open start: it comes from the left. Open end: from the right. Switch the direction to right to left and open each again: start now comes from the right and end from the left, and the text inside reads right to left.',
      width: 360,
      render: () => <Sides sides={['start', 'end']} />
    },
    {
      name: 'Top and bottom',
      try: 'Open top: a 220px panel slides down from the top edge, full width. Open bottom: the same from the bottom. A press on the dimmed page closes either, and Page button never counts while one is open.',
      width: 360,
      render: () => <Sides sides={['top', 'bottom']} />
    },
    {
      name: 'Not modal',
      try: 'Open end: nothing is dimmed, Page button still counts while it is open, and Tab moves on to the page after the drawer. With focus in the drawer, Escape closes it; with focus back on the page, Escape does nothing to it.',
      width: 360,
      render: () => <Sides sides={['end']} modal={false} />
    },
    {
      name: 'Taller than the window',
      try: 'The drawer is exactly as tall as the window; the title stays put while the clauses scroll under it. Tab to the field at the end: it scrolls into view with its focus ring uncut.',
      render: () => <Tall />
    },
    {
      name: 'Wider than the window',
      try: 'It fills the window and no more: the close button at the far end of the wrapped title is on screen. Narrow the window while it is open: it narrows with it. It still slides in and out cleanly.',
      render: () => <Oversized />
    },
    {
      name: 'Not dismissible',
      try: 'A bottom drawer with no close button. Escape does nothing and a press on the dimmed page does nothing; only Stop the export closes it.',
      render: () => <Stubborn />
    },
    {
      name: 'Menu and Select inside',
      try: 'Open Sort and Actions from inside the drawer: each list is drawn above the drawer, next to its button. Escape closes the list only; a second Escape slides the drawer out. Choosing an action updates the line and leaves the drawer open.',
      render: () => <WithPopups />
    },
    {
      name: 'From inside a dialog',
      try: 'Open settings, then Advanced: the drawer slides in over the dialog and its scrim. Escape closes only the drawer and focus is back on Advanced inside the dialog; a second Escape closes the dialog.',
      render: () => <FromDialog />
    },
    {
      name: 'Reduced motion',
      try: 'Turn on reduced motion in the system settings, then open Edit profile: the drawer is simply there, with no slide, and closing it is just as immediate.',
      render: () => <Form />
    }
  ]
};
