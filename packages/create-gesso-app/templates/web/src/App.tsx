import { map } from 'rxjs/operators';

import { darkTheme, lightTheme, percent } from 'gesso-core';
import { Button, ContextMenus, FindBar, Switch } from 'gesso-components';
import { internalState, ShellService, type ComponentContext, type Inputs } from 'gesso-framework';
import { Clicks } from './clicks';

/**
 * The screen.
 *
 * A Gesso component is a function that runs once. What it returns is a
 * tree of nodes that stays: nothing here re-runs when the count
 * changes, because `text` is bound to an Observable, so one property on
 * one node is written and the next frame is drawn from it.
 *
 * Four things are worth knowing before you change them.
 *
 *   - The count is a channel's (`clicks.ts`), read as
 *     `clicks.view.count` and changed with `clicks.send.add()`. That is
 *     what lets an AI agent read and press it too.
 *   - `internalState(true)` is state this component owns, which no one
 *     else needs: whether the hint shows.
 *   - A canvas inherits nothing from the page, light or dark included.
 *     The root maps the shell's colour scheme onto a theme, and gives
 *     text its type scale, so everything below follows the person's
 *     setting without knowing about it.
 *   - No colour here is a hex value and no size is a number of points.
 *     `primary`, `background` and `textMuted` are colours, and
 *     `headline` and `bodySmall` text styles, looked up on whichever
 *     theme the node inherits.
 *
 * The elements are lowercase because they are intrinsic, resolved by
 * `jsxImportSource` in `tsconfig.json`, the same way `<div>` needs no
 * import in React. `Button` and `Switch` are capitalised because they
 * are components from `gesso-components`, so they are imported.
 */
export function App(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const clicks = ctx.channel(Clicks);
  const hinted = internalState(true);
  const theme = ctx.inject(ShellService).colorScheme.pipe(map(scheme => (scheme === 'dark' ? darkTheme : lightTheme)));

  // `ContextMenus` puts back the menu a right-click opens in a browser:
  // Cut, Copy and Paste in a field, Copy on selected text, and a link's.
  return (
    <ContextMenus>
      <column
        theme={theme}
        textStyle={theme.pipe(map(value => value.typography.body))}
        gap={16}
        x="center"
        y="center"
        width={percent(100)}
        height={percent(100)}
        backgroundColor="background"
        position="relative">
        <text text="Hello from a render worker" textStyle="headline" />

        <row gap={12} y="center">
          <text text={clicks.view.count.pipe(map(value => `Clicks: ${value}`))} textStyle="title" />
          <Button label="Add one" onClick={() => clicks.send.add()} />
          {/* An agent pressing Reset on the screen is asked about, as its reset command is. */}
          <box agentConfirm="Reset the count to 0?">
            <Button label="Reset" variant="outlined" onClick={() => clicks.send.reset()} />
          </box>
        </row>

        <text
          text={clicks.view.count.pipe(
            map(value => (value === 0 ? 'Press the button, or ask an agent to.' : 'Nothing was rebuilt to do that.'))
          )}
          textStyle="bodySmall"
          color="textMuted"
          opacity={hinted.pipe(map(showing => (showing ? 1 : 0)))}
        />

        <Switch label="Show the hint" checked={hinted} onChange={next => (hinted.value = next)} />

        {/*
        Ctrl+F or Cmd+F opens it. The browser's own find cannot see a
        canvas, so while this is mounted the shell takes the shortcut
        and the bar searches the text on screen. It places itself in the
        top corner of the nearest positioned box, which is this column.
      */}
        <FindBar />
      </column>
    </ContextMenus>
  );
}
