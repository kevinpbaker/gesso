import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import {
  AnimationService,
  ShellService,
  internalState,
  type ColorScheme,
  type ComponentContext,
  type Inputs
} from '@gesso/framework';

import { HOVER_ACCENT } from './interaction';

/** What this screen would share, which depends on what the shell said. */
const linkFor = (scheme: ColorScheme) => `https://gesso.invalid/report?theme=${scheme}`;

// #region shell
/**
 * A panel that reads what the shell reported, and acts on it.
 *
 * Two facts arrive from the thread with a window, and they land in
 * different places on purpose. The framework consumes the motion
 * preference, so `AnimationService` holds it and the animation driver
 * reads it. Nothing in the framework consumes the appearance, so
 * `ShellService` carries it and stops there: what dark looks like is
 * the application's decision, not the framework's.
 *
 * The button goes the other way. A component in a render worker has no
 * clipboard, so `copyText` is a request the runtime hands to whichever
 * host it has. It reads `currentColorScheme` rather than subscribing,
 * which is what a click handler wants: the link that lands on the
 * clipboard is the one for the appearance the reader is in at the
 * moment they press it.
 */
export function ShellSignals(_props: Inputs<{}>, ctx: ComponentContext) {
  const shell = ctx.inject(ShellService);
  const reducedMotion = ctx.inject(AnimationService).reducedMotion;
  const copied = internalState(false);

  const reported = combineLatest([shell.colorScheme, reducedMotion]).pipe(
    map(([scheme, reduced]) => `${scheme} appearance, ${reduced ? 'reduced' : 'full'} motion`)
  );

  return (
    <column gap={14} x="center" y="center" width={percent(100)} height={percent(100)} padding={20}>
      <column
        gap={8}
        padding={18}
        borderRadius={10}
        borderWidth={1}
        borderColor="border"
        backgroundColor="surface"
        x="center">
        <text text="What the shell reported" fontSize={12} color="textMuted" />
        <text text={reported} fontSize={18} fontWeight={600} color="text" />
        <text text={shell.colorScheme.pipe(map(linkFor))} fontSize={12} color="textMuted" />
      </column>
      <button
        label="Copy the link"
        onClick={() => {
          shell.copyText(linkFor(shell.currentColorScheme));
          copied.value = true;
        }}
        padding={8}
        borderRadius={6}
        backgroundColor="primary"
        cursor="pointer"
        modifiers={[HOVER_ACCENT]}>
        <text text="Copy the link" fontSize={13} color="background" />
      </button>
      <text
        text={copied.pipe(map(done => (done ? 'The link is on the clipboard.' : 'Nothing has been copied yet.')))}
        fontSize={12}
        color="textMuted"
      />
    </column>
  );
}
// #endregion shell
