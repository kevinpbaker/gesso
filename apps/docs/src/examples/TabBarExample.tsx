import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { TabBar, type TabBarTab } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region tab-bar
/**
 * An editor's open files.
 *
 * Press a tab, or focus the strip and use the arrows. Delete or the ×
 * closes one; `notes.md` is unsaved, so it shows a dot until the
 * pointer is on it. Drag a tab, or press Mod+Shift with an arrow, to
 * move it. Double-click a tab, or press F2, to rename it. The + opens a
 * new file. Open enough files and the strip scrolls, with a button at
 * its end that lists them all.
 *
 * The bar reports and the owner decides: every callback here writes the
 * change into `files`, and nothing moves until it does.
 */
export function Editor(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const files = internalState<readonly TabBarTab[]>([
    { value: 'app', label: 'App.tsx' },
    { value: 'notes', label: 'notes.md', dirty: true },
    { value: 'styles', label: 'styles.css' },
    { value: 'spec', label: 'App.spec.tsx', detail: 'tests', preview: true }
  ]);
  const open = internalState('app');
  let made = 0;

  const close = (value: string) => {
    const list = files.value;
    const at = list.findIndex(file => file.value === value);
    const rest = list.filter(file => file.value !== value);
    files.value = rest;
    // The neighbour takes over, as an editor's tabs do.
    if (open.value === value) open.value = rest[Math.min(at, rest.length - 1)]?.value ?? '';
  };
  const move = (value: string, index: number) => {
    const file = files.value.find(each => each.value === value)!;
    const rest = files.value.filter(each => each.value !== value);
    files.value = [...rest.slice(0, index), file, ...rest.slice(index)];
  };
  const rename = (value: string, label: string) => {
    files.value = files.value.map(file => (file.value === value ? { ...file, label } : file));
  };
  const add = () => {
    made += 1;
    const value = `new-${made}`;
    files.value = [...files.value, { value, label: `Untitled-${made}` }];
    open.value = value;
  };

  const name = combineLatest([open, files]).pipe(
    map(([value, list]) => list.find(file => file.value === value)?.label ?? 'nothing')
  );

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      <TabBar
        label="Open files"
        tabs={files}
        value={open}
        onChange={value => (open.value = value)}
        onClose={close}
        onMove={move}
        onRename={rename}
        onAdd={add}
        addLabel="New file"
      />
      <text text={name.pipe(map(file => `Editing ${file}`))} color="textMuted" />
    </column>
  );
}
// #endregion tab-bar
