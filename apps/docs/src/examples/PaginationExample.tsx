import { percent } from 'gesso-core';
import { Pagination } from 'gesso-components';
import { computed, each, internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region pagination
const SPECIES = [
  'Barn owl',
  'Curlew',
  'Dipper',
  'Fieldfare',
  'Goldcrest',
  'Hen harrier',
  'Kittiwake',
  'Lapwing'
] as const;

const PLACES = ['Rannoch', 'Holkham', 'Skomer', 'Bempton', 'Minsmere', 'Slimbridge'] as const;

/** Ninety-six records, which is twelve pages of eight: enough to elide at both ends. */
const RECORDS = Array.from({ length: 96 }, (_, index) => ({
  id: index + 1,
  species: SPECIES[index % SPECIES.length],
  place: PLACES[index % PLACES.length],
  seen: 1 + ((index * 7) % 23)
}));

const PER_PAGE = 8;
const PAGE_COUNT = Math.ceil(RECORDS.length / PER_PAGE);

/**
 * A page of records, and the strip that moves between them.
 *
 * The application owns the page. `Pagination` is handed `page` and
 * reports every move through `onChange`, so the cell is the single
 * place that knows which page is showing; the rows above are a slice
 * of the same cell, and there is no second copy of the number to keep
 * in step.
 *
 * Walk it with the buttons, or with Tab and Enter, and watch the
 * strip rather than the rows. Three things are worth seeing. It never
 * changes width: at page 1 the run of numbers is as wide as it is in
 * the middle, so the next button stays exactly where your pointer
 * already is. The ellipsis appears only when it stands for two pages
 * or more, which is why page 2 is drawn at the start and page 11 at
 * the end rather than being hidden behind a "..." that saves nothing.
 * And previous and next go grey at the ends instead of vanishing, so
 * the row keeps its shape all the way across.
 *
 * What a screen reader hears is not what the screen shows. Each
 * numbered control is named "Page 4", not "4", the one you are on
 * carries the `selected` state rather than only the accent pill, the
 * ellipsis is decorative and cannot be reached at all, and the strip
 * itself is a navigation landmark named "Observations", because a
 * landmark with no name is a line in a list saying nothing.
 */
export function Observations(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const page = internalState(1);

  const rows = computed(() => RECORDS.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE));
  const summary = computed(() => {
    const first = (page.value - 1) * PER_PAGE + 1;
    return `Showing ${first} to ${Math.min(first + PER_PAGE - 1, RECORDS.length)} of ${RECORDS.length}`;
  });

  return (
    <column gap={10} padding={20} width={percent(100)} height={percent(100)}>
      <text text={summary} textStyle="bodySmall" color="textMuted" />
      <column gap={2} flexGrow={1} x="stretch">
        {each(rows, 'id', record => (
          <row gap={12} y="center" paddingX={8} paddingY={4} borderRadius={6} backgroundColor="surface">
            <text text={String(record.id).padStart(2, '0')} textStyle="bodySmall" color="textMuted" width={20} />
            <text text={record.species} textStyle="bodySmall" flexGrow={1} />
            <text text={record.place} textStyle="bodySmall" color="textMuted" />
            <text text={`${record.seen} seen`} textStyle="bodySmall" color="textMuted" width={56} />
          </row>
        ))}
      </column>
      <Pagination label="Observations" pageCount={PAGE_COUNT} page={page} onChange={next => (page.value = next)} />
    </column>
  );
}
// #endregion pagination
