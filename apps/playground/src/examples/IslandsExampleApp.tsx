import { map } from 'rxjs/operators';

import { percent, type UiChild, type UiNode } from 'gesso-core';
import { Button, Menu, NativeInput } from 'gesso-components';
import { internalState, Island, IslandService, type ComponentContext, type Inputs } from 'gesso-framework';
import { BORDER, GROUND, gessoTheme, SURFACE, SURFACE_RAISED, TEXT_MUTED } from './brand';
import { LagProbe, PROBE_CANVAS } from './islands/IslandsContract';

/**
 * DOM islands: real elements over boxes in the layout.
 *
 * A canvas field is not a field to a password manager, the browser's
 * autofill or a phone's one-time-code suggestion, so the two fields of
 * this sign-in form are native `<input>`s, placed by the shell over boxes
 * the render worker lays out. Everything else on the page is drawn:
 * the fields' frames, their labels, the button, the menu, the sticky
 * header the form scrolls under.
 *
 * What to try on it: let the browser fill the email, or save the
 * password after signing in; Tab between the fields and the buttons;
 * scroll the form under the header, which cuts the fields away rather
 * than drawing under them; open the menu, which opens over the password field, which
 * cuts it too, and takes the press where it covers it. The red block
 * at the bottom is an element over a blue box: while the page scrolls, a
 * blue strip is how far the element trails its box.
 */
export function IslandsApp(_inputs: Inputs<Record<string, never>>, ctx: ComponentContext): UiChild {
  const islands = ctx.inject(IslandService);
  const email = internalState('');
  const password = internalState('');
  const signedInAs = internalState<string | null>(null);
  const menuOpen = internalState(false);
  const emailNode = internalState<UiNode | null>(null);

  const signIn = (): void => {
    if (email.value.length === 0 || password.value.length === 0) {
      return;
    }
    // The page's form is submitted as well as the app's command run:
    // the submission is what a password manager offers to save on.
    islands.submitForm('sign-in');
    signedInAs.value = email.value;
  };

  const form = (): UiChild => (
    <column
      gap={12}
      padding={20}
      width={360}
      backgroundColor={SURFACE}
      borderWidth={1}
      borderColor={BORDER}
      borderRadius={12}>
      <text text="Sign in" textStyle="title" />
      <NativeInput
        form="sign-in"
        name="email"
        type="email"
        autocomplete="username"
        inputMode="email"
        label="Email"
        ref={(node: UiNode | null) => (emailNode.value = node)}
        placeholder="you@example.com"
        value={email}
        onChange={(value: string) => (email.value = value)}
        onSubmit={signIn}
      />
      <NativeInput
        form="sign-in"
        name="password"
        type="password"
        autocomplete="current-password"
        label="Password"
        value={password}
        onChange={(value: string) => (password.value = value)}
        onSubmit={signIn}
      />
      <row gap={8}>
        <Button label="Sign in" onClick={signIn} />
        <Button label="Menu over the field" onClick={() => (menuOpen.value = true)} />
      </row>
    </column>
  );

  const signedIn = (who: string): UiChild => (
    <column
      gap={12}
      padding={20}
      width={360}
      backgroundColor={SURFACE}
      borderWidth={1}
      borderColor={BORDER}
      borderRadius={12}>
      <text text={`Signed in as ${who}`} textStyle="title" />
      <text
        text="The form is gone, which with the submission before it is what Chrome reads as a sign-in that worked."
        color={TEXT_MUTED}
      />
      <Button
        label="Sign out"
        onClick={() => {
          signedInAs.value = null;
          password.value = '';
        }}
      />
    </column>
  );

  return (
    <column theme={gessoTheme} backgroundColor={GROUND} width={percent(100)} height={percent(100)}>
      <scrollview width={percent(100)} height={percent(100)}>
        <column gap={24} paddingBottom={600} x="center">
          <row
            position="sticky"
            top={0}
            zIndex={1}
            width={percent(100)}
            padding={12}
            backgroundColor={SURFACE_RAISED}
            borderColor={BORDER}
            x="center">
            <text text="A sticky header: the fields scroll under it and are cut where it covers them." />
          </row>
          {filler(4)}
          {signedInAs.pipe(map(who => (who === null ? form() : signedIn(who))))}
          <column gap={8} x="center">
            <text
              text="Lag probe: a red element over a blue box. Blue while scrolling is the lag."
              color={TEXT_MUTED}
            />
            <Island
              of={LagProbe}
              props={{}}
              width={240}
              height={32}
              backgroundColor={PROBE_CANVAS}
              focusable={false}
              label="Lag probe"
            />
          </column>
          {filler(10)}
        </column>
      </scrollview>
      <Menu
        open={menuOpen}
        anchor={emailNode}
        placement="bottom-start"
        label="Field commands"
        items={[
          { value: 'clear', label: 'Clear the password' },
          { value: 'fill', label: 'Fill in a sample password' },
          { value: 'close', label: 'Close' }
        ]}
        onOpenChange={(open: boolean) => (menuOpen.value = open)}
        onSelect={(value: string) => {
          if (value === 'clear') {
            password.value = '';
          } else if (value === 'fill') {
            password.value = 'correct horse battery staple';
          }
          menuOpen.value = false;
        }}
      />
    </column>
  );
}

function filler(count: number): UiChild[] {
  const rows: UiChild[] = [];
  for (let index = 0; index < count; index += 1) {
    rows.push(
      <text
        width={480}
        color={TEXT_MUTED}
        text={
          'Filler, so the page scrolls. Everything here is drawn on the canvas by the render worker; ' +
          'the two fields are the only DOM in the picture, and the shell moves them with their boxes.'
        }
      />
    );
  }
  return rows;
}
