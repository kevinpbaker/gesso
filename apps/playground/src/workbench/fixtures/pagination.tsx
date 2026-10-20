import { map } from 'rxjs/operators';

import { Button, Pagination } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** A strip that owns its page and reports each change. */
function Uncontrolled(inputs: Inputs<{ pageCount: number }>, _ctx: ComponentContext) {
  const page = internalState(1);
  return (
    <column gap={8} x="start">
      <Pagination pageCount={inputs.pageCount} defaultPage={1} onChange={next => (page.value = next)} />
      <text textStyle="bodySmall" color="textMuted">
        {page.pipe(map(value => `Page ${value}`))}
      </text>
    </column>
  );
}

/** A strip whose page belongs to the caller, with a jump from outside. */
function Controlled(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const page = internalState(1);
  return (
    <column gap={8} x="start">
      <Pagination pageCount={500} page={page} onChange={next => (page.value = next)} />
      <row gap={8} y="center">
        <Button label="Jump to 250" size="small" variant="outlined" onClick={() => (page.value = 250)} />
        <Button label="Jump to 499" size="small" variant="outlined" onClick={() => (page.value = 499)} />
        <text textStyle="bodySmall" color="textMuted">
          {page.pipe(map(value => `Page ${value} of 500`))}
        </text>
      </row>
    </column>
  );
}

/** A strip whose owner ignores it: presses report, but the page never moves. */
function Ignored(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const asked = internalState('nothing yet');
  return (
    <column gap={8} x="start">
      <Pagination pageCount={10} page={4} onChange={next => (asked.value = String(next))} />
      <text textStyle="bodySmall" color="textMuted">
        {asked.pipe(map(value => `Asked for: ${value}`))}
      </text>
    </column>
  );
}

export const paginationFixture: WorkbenchFixture = {
  id: 'pagination',
  name: 'Pagination',
  source: 'packages/components/src/Pagination.ts',
  states: [
    {
      name: 'Ten pages',
      try: 'Click 2, then Next, then Previous: the highlight and the line follow. Previous is disabled on page 1 and Next on page 10. Tab walks the buttons with a ring; Enter and Space press.',
      width: 400,
      render: () => <Uncontrolled pageCount={10} />
    },
    {
      name: 'Hundreds of pages',
      try: '500 pages, page owned outside. Click Next a few times, then the jumps: the strip shows 1 … 249 250 251 … 500. Watch whether Next shifts under the pointer as the numbers get wider.',
      width: 480,
      render: () => <Controlled />
    },
    {
      name: 'Ten thousand pages',
      try: 'Click the last page and back to the first: five-digit numbers fit in their buttons, and the strip keeps the same number of slots throughout.',
      width: 480,
      render: () => <Uncontrolled pageCount={10000} />
    },
    {
      name: 'Siblings',
      try: 'Page 10 of 20 with 0, 1, 2 and 3 siblings: the run around 10 grows by two each row, the gaps (…) stay, and first and last are always shown.',
      width: 560,
      render: () => (
        <column gap={8} x="start">
          {[0, 1, 2, 3].map(siblings => (
            <Pagination key={String(siblings)} pageCount={20} defaultPage={10} siblings={siblings} />
          ))}
        </column>
      )
    },
    {
      name: 'No boundaries',
      try: 'Page 10 of 20 without boundaries: no 1 and no 20, only Previous, a gap, the run, a gap, and Next.',
      width: 400,
      render: () => <Pagination pageCount={20} defaultPage={10} boundaries={false} />
    },
    {
      name: 'Few pages',
      try: 'One page: just 1 with both arrows disabled. Two pages: 1 2. Zero pages: nothing at all, and no leftover gap above (end).',
      width: 320,
      render: () => (
        <column gap={8} x="start">
          <Pagination pageCount={1} />
          <Pagination pageCount={2} />
          <Pagination pageCount={0} />
          <text textStyle="bodySmall" color="textMuted">
            (end)
          </text>
        </column>
      )
    },
    {
      name: 'Sizes',
      try: 'Small, medium and large: page buttons are square-ish with the number centred, the arrows match their height, and the current page reads as filled.',
      width: 420,
      render: () => (
        <column gap={10} x="start">
          {(['small', 'medium', 'large'] as const).map(size => (
            <Pagination key={size} pageCount={9} defaultPage={5} size={size} />
          ))}
        </column>
      )
    },
    {
      name: 'Disabled',
      try: 'Every button reads as disabled; clicking does nothing and Tab skips the whole strip.',
      width: 400,
      render: () => <Pagination pageCount={10} defaultPage={3} disabled />
    },
    {
      name: 'Owner ignores the change',
      try: 'The page is fixed at 4 by its owner. Click 7: the line says 7 was asked for, but the highlight stays on 4.',
      width: 400,
      render: () => <Ignored />
    },
    {
      name: 'Narrow box',
      try: 'Page 25 of 50 in a 220 cell: note whether the strip wraps, clips or runs past the card. Buttons must never overlap.',
      width: 220,
      render: () => <Pagination pageCount={50} defaultPage={25} />
    }
  ]
};
