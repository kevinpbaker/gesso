import { map } from 'rxjs/operators';

import { Switch } from 'gesso-components';
import { darkTheme, lightTheme, percent } from 'gesso-core';
import { DesktopWindows } from 'gesso-electrobun/desktop';
import { ShellService, type ComponentContext, type Inputs } from 'gesso-framework';

import { Counter } from '../shared/Counter';

/**
 * The screen, and it is an ordinary Gesso component.
 *
 * Nothing here knows it is in a native window. `ctx.channel` gives a
 * replica of something the main process serves: `view` is a set of
 * observables that arrive as the state changes, and `send` is the
 * typed commands going the other way. Behind them is a process
 * boundary, and the only reason to know that is latency, because a
 * command crossing it costs about a frame and a half.
 *
 * Three things are worth knowing before you change them.
 *
 *   - The component body runs once. Nothing re-runs when the count
 *     changes: `text` is bound to an observable, so one property on
 *     one node is written and the next frame is drawn from it.
 *   - No colour here is a hex value. `background`, `primary` and
 *     `textMuted` are names looked up on whichever theme the node
 *     inherits, and the root below provides that theme from the
 *     appearance the shell reports. The framework carries the
 *     appearance and has no opinion about what dark looks like, so
 *     without the `theme` line the switch would replicate a value that
 *     changed nothing on screen. `lightTheme` and `darkTheme` are a
 *     starting point; a palette of your own answers the same names.
 *   - The elements are lowercase because they are intrinsic, resolved
 *     by `jsxImportSource` in `tsconfig.json` the way `<div>` needs no
 *     import in React. `Switch` is capitalised because it is a
 *     component from `gesso-components`, imported like any value.
 */
export function App(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const counter = ctx.channel(Counter);
  const windows = ctx.channel(DesktopWindows);
  // The scheme is what the main process told this window (see
  // `src/view/main.ts`), so every window is in the same appearance.
  const theme = ctx.inject(ShellService).colorScheme.pipe(map(scheme => (scheme === 'dark' ? darkTheme : lightTheme)));

  return (
    <column
      theme={theme}
      textStyle={theme.pipe(map(value => value.typography.body))}
      gap={16}
      x="center"
      y="center"
      width={percent(100)}
      height={percent(100)}
      backgroundColor="background">
      <text text={counter.view.count.pipe(map(String))} fontSize={56} />

      <row gap={10} y="center">
        <button
          label="Count"
          onClick={() => counter.send.increment(1)}
          padding={10}
          borderRadius={8}
          backgroundColor="primary"
          cursor="pointer">
          <text text="Count" color="background" fontSize={14} />
        </button>

        {/*
          A window opening a window, over a channel rather than an
          import: the screen asks for one and the main process makes
          it. The new window shows the current count immediately,
          because it replicates the same source rather than being
          handed a copy.
        */}
        <button
          label="New window"
          onClick={() => windows.send.open()}
          padding={10}
          borderRadius={8}
          backgroundColor="surface"
          cursor="pointer">
          <text text="New window" fontSize={14} />
        </button>
      </row>

      <text
        text={windows.view.count.pipe(map(open => (open === 1 ? 'One window' : `${open} windows, one source`)))}
        fontSize={12}
        color="textMuted"
      />

      {/*
        The appearance is the main process's, not this window's, so
        flipping it here changes every window that is open. That is the
        desktop shape of `setColorScheme`: one setting, replicated.
      */}
      <Switch label="Dark" checked={counter.view.dark} onChange={next => counter.send.setDark(next)} />
    </column>
  );
}
