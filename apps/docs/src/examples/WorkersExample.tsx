import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { TextInput } from '@gesso/components';
import { internalState, ShellService, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

/**
 * What the thread this tree was built on can see of the page.
 *
 * Evaluated once, where the component runs. In the render worker there
 * is no `document`, no `window` and no `localStorage`, so a component
 * that reached for one would not fail at some later moment: it fails
 * the moment it is built.
 */
const THREAD = typeof document === 'undefined' ? 'No document on this thread' : 'A document is reachable here';

// #region shell
/**
 * A screen in the render worker, and the three things it still asks the
 * shell for.
 *
 * **Keys.** The field is drawn on the canvas and holds no DOM focus of
 * its own. What gives it characters is a hidden textarea on the main
 * thread, which the shell focuses while the worker reports a focused
 * editable and which reports composition, so an IME works here.
 *
 * **The clipboard.** A worker has none. `ShellService.copyText` hands
 * the request to the runtime, which posts it to the shell, which does
 * the write. Every reach for the outside world takes that shape: the
 * component asks, and something on the other thread answers.
 *
 * **The appearance.** `prefers-color-scheme` is a media query, and a
 * media query needs a window. The shell watches it and reports what it
 * says; `colorScheme` is where the application hears about it, and it
 * is what this site's light and dark toggle drives.
 */
export function ShellNeeds(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const shell = ctx.inject(ShellService);
  const message = internalState('Typed into a canvas in a worker');
  const copies = internalState(0);

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)}>
      <text text={THREAD} fontSize={13} fontWeight={600} color="text" />

      <TextInput
        label="Message"
        value={message}
        onChange={next => (message.value = next)}
        description="Every keystroke crossed a thread to get here."
      />

      <row gap={10} y="center">
        <button
          label="Copy to the clipboard"
          onClick={() => {
            shell.copyText(message.value);
            copies.value++;
          }}
          padding={8}
          paddingLeft={12}
          paddingRight={12}
          borderRadius={6}
          borderWidth={1}
          borderColor="controlBorder"
          backgroundColor="controlBackground"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Copy to the clipboard" fontSize={12} color="controlForeground" />
        </button>
        <text
          text={copies.pipe(
            map(count => (count === 0 ? 'no request yet' : `${count} request${count === 1 ? '' : 's'} to the shell`))
          )}
          fontSize={12}
          color="textMuted"
        />
      </row>

      <text
        text={shell.colorScheme.pipe(map(scheme => `the shell reports ${scheme}`))}
        fontSize={12}
        color="textMuted"
      />
    </column>
  );
}
// #endregion shell
