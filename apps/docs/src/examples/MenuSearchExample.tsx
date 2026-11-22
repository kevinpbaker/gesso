import { map } from 'rxjs/operators';

import { percent, type UiNode } from 'gesso-core';
import { Button, Menu, type MenuItem } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region menu-search
/** Declared once: a fresh array per frame rebuilds every row. */
const PEOPLE: readonly MenuItem[] = [
  { value: 'ada', label: 'Ada Okafor', keywords: ['design'] },
  { value: 'bo', label: 'Bo Lindqvist', keywords: ['infra'] },
  { value: 'chen', label: 'Chen Wei', keywords: ['design'] },
  { value: 'dara', label: 'Dara Nwosu', keywords: ['support'] },
  { value: 'eli', label: 'Eli Moreau', keywords: ['infra'], disabled: true },
  { value: 'fatima', label: 'Fatima Haddad', keywords: ['sales'] },
  { value: 'grace', label: 'Grace Hopper', keywords: ['compilers'] },
  { value: 'hiro', label: 'Hiro Tanaka', keywords: ['support'] },
  { value: 'ines', label: 'Inês Carvalho', keywords: ['design'] },
  { value: 'none', label: 'Unassigned', separator: true }
];

/**
 * A menu too long to read, so it is searched.
 *
 * **Assign** opens a menu with a field above the people. Type `chen`, or
 * `ines` without the accent, or a team such as `infra`; the arrows walk
 * what matches and Enter assigns. Eli is away, so the arrows pass him
 * by. Space is a space in the field, not a choice.
 */
export function AssignTo(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const anchor = internalState<UiNode | null>(null);
  const open = internalState(false);
  const assignee = internalState('none');
  const name = assignee.pipe(map(value => PEOPLE.find(person => person.value === value)?.label ?? 'Unassigned'));

  return (
    <column gap={12} padding={20} width={percent(100)} height={percent(100)}>
      <Button ref={node => (anchor.value = node)} label="Assign" onClick={() => (open.value = true)} />
      <text text={name.pipe(map(person => `Assigned to: ${person}`))} color="textMuted" />
      <Menu
        open={open}
        onOpenChange={next => (open.value = next)}
        anchor={anchor}
        label="Assign to"
        items={PEOPLE}
        searchable
        searchPlaceholder="Search people"
        emptyText="Nobody by that name"
        onSelect={value => (assignee.value = value)}
      />
    </column>
  );
}
// #endregion menu-search
