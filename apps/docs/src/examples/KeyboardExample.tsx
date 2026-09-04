import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { Select } from '@gesso/components';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

import { HOVER_CONTROL } from './interaction';

const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name' }
];

const labelOf = (value: string) => SORTS.find(sort => sort.value === value)?.label ?? '';

// #region sortbar
/**
 * A composite widget and a button, both reachable with keys alone.
 *
 * `Select` is the library's, so its keyboard behaviour comes with it:
 * the trigger is one tab stop, Enter or an arrow opens the list, the
 * arrows walk it, Enter chooses, and Escape closes without choosing
 * and hands focus back to the trigger.
 *
 * The Apply button is hand-written, and shows where the line is. A
 * `<button>` is focusable and takes a press, and that is all: nothing
 * in the runtime turns Enter on a focused button into a click. A
 * control you build yourself is operable from the keyboard when you
 * bind the keys, which is why every component in the library carries a
 * keymap of its own.
 */
export function SortBar(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const sort = internalState('recent');
  const applied = internalState('recent');
  const apply = () => (applied.value = sort.value);

  return (
    <column gap={14} padding={20} width={percent(100)} height={percent(100)} y="center">
      <Select label="Sort by" options={SORTS} value={sort} onChange={next => (sort.value = next)} />
      <row gap={12} y="center">
        <button
          label="Apply"
          onClick={apply}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              apply();
              event.preventDefault();
            }
          }}
          padding={9}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Apply" fontSize={13} color="text" />
        </button>
        <text
          text={applied.pipe(map(value => `Sorted by ${labelOf(value).toLowerCase()}`))}
          fontSize={12}
          color="textMuted"
        />
      </row>
    </column>
  );
}
// #endregion sortbar
