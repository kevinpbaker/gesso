import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { StatusBar, type StatusBarItem } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region status-bar
/**
 * An editor's status line.
 *
 * Type in the note: the caret's line and column follow it, and "Saving…"
 * spins until a moment after you stop. Press the error count or the
 * encoding to see a press reported. The bar is one tab stop: Tab to it
 * and walk its buttons with the arrows. −, the percentage and + zoom the
 * note; the percentage puts it back to 100%.
 */
export function Editor(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const text = internalState('Status bars say where you are.');
  const caret = internalState(0);
  const saving = internalState(false);
  const zoom = internalState(1);
  const last = internalState('nothing yet');
  let timer: ReturnType<typeof setTimeout> | null = null;

  const position = caret.pipe(
    map(at => {
      const before = text.value.slice(0, at);
      return `Ln ${before.split('\n').length}, Col ${at - before.lastIndexOf('\n')}`;
    })
  );

  // Declared once: the caret's text is a cell, so it changes without the items changing.
  const items: readonly StatusBarItem[] = [
    { key: 'branch', text: 'main', tooltip: 'The branch you are on', onClick: () => (last.value = 'branch') },
    { key: 'problems', text: '1 error', tone: 'danger', onClick: () => (last.value = 'problems') },
    {
      key: 'save',
      text: saving.pipe(map(on => (on ? 'Saving…' : 'Saved'))),
      busy: saving,
      live: true
    },
    { key: 'caret', text: position, side: 'end' },
    {
      key: 'encoding',
      text: 'UTF-8',
      label: 'Encoding, UTF-8',
      side: 'end',
      onClick: () => (last.value = 'encoding')
    }
  ];

  return (
    <column width={percent(100)} height={percent(100)}>
      <column flexGrow={1} padding={16} gap={8}>
        <editabletext
          value={text}
          label="Note"
          padding={8}
          borderColor="controlBorder"
          borderWidth={1}
          borderRadius={6}
          color="text"
          fontSize={zoom.pipe(map(scale => 14 * scale))}
          onInput={event => {
            text.value = event.value;
            saving.value = true;
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(() => (saving.value = false), 800);
          }}
          onSelectionChange={event => (caret.value = event.focus)}
        />
        <text text={last.pipe(map(what => `Last pressed: ${what}`))} color="textMuted" />
      </column>
      <box height={1} backgroundColor="border" />
      <StatusBar items={items} zoom={zoom} onZoomChange={next => (zoom.value = next)} />
    </column>
  );
}
// #endregion status-bar
