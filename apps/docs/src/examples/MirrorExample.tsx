import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { TextInput } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

// #region note
/**
 * A note with a title and a button, and nothing about accessibility in
 * it.
 *
 * That is the point of this one: the field and the button are ordinary
 * application code, and everything an assistive technology does with
 * them, reading them, pressing the button, typing into the field, goes
 * through the mirror the shell put over the canvas. The spec beside
 * this file drives all three from the runtime's side of that seam.
 */
export function Note(_props: Inputs<{}>, _ctx: ComponentContext) {
  const title = internalState('Groceries');
  const filed = internalState(0);

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)} y="center">
      <TextInput label="Note title" value={title} onChange={next => (title.value = next)} />
      <row gap={12} y="center">
        <button
          label="File note"
          onClick={() => filed.value++}
          padding={9}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="File note" fontSize={13} color="text" />
        </button>
        <text
          text={combineLatest([title, filed]).pipe(
            map(([name, count]) => (count === 0 ? 'Nothing filed yet' : `Filed ${count}, most recently ${name}`))
          )}
          fontSize={12}
          color="textMuted"
        />
      </row>
    </column>
  );
}
// #endregion note
