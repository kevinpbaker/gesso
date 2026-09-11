import { percent } from '@gesso/core';
import { Chip } from '@gesso/components';
import { computed, internalState, type ComponentContext, type Inputs } from '@gesso/framework';

// #region chip
/** The genres, with how many tracks each has, as a catalogue would give them. */
const GENRES = [
  { name: 'Electronic', count: '366,280' },
  { name: 'Metal', count: '119,205' },
  { name: 'Folk', count: '32,476' }
] as const;

/** A heart, on the 24 grid every icon here is drawn on. */
const HEART =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

/**
 * Two rows of chips, and the sentence they add up to.
 *
 * The first row picks one genre or none. Each chip is controlled: the
 * application holds `genre`, every chip reads whether it is the one,
 * and a press writes the cell rather than the chip. "All" is the chip
 * that is on until another is pressed, so the row always says what it
 * is showing, and its `name` says so to a screen reader too: "All,
 * showing", then "Show all" once a genre is chosen. The others carry
 * a `count`, which is drawn after the word and read after it.
 *
 * The second row is outlined and small, the shape for a toolbar. Two
 * chips are switches that hold their own value in a cell each; "Liked"
 * has a glyph before its word; "Clear filters" is never on, so it reads
 * as a plain button; and "Offline only" is disabled, with a
 * `description` saying why.
 *
 * Nothing here names a colour. The sheet, the inversion when a chip is
 * on, the ring, the wash, the hover and the press all come from the
 * control tokens of whatever theme the tree inherits.
 */
export function Filters(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const genre = internalState<string | null>(null);
  const verified = internalState(false);
  const liked = internalState(true);

  const summary = computed(() => {
    const parts = [genre.value ?? 'every genre'];
    if (verified.value) {
      parts.push('verified artists only');
    }
    if (liked.value) {
      parts.push('liked tracks');
    }
    return `Showing ${parts.join(', ')}.`;
  });

  const clear = (): void => {
    genre.value = null;
    verified.value = false;
    liked.value = false;
  };

  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)} y="center">
      <row gap={8} rowGap={8} y="center" flexWrap="wrap" role="group" label="Filter by genre">
        <Chip
          label="All"
          name={computed(() => (genre.value === null ? 'All, showing' : 'Show all'))}
          selected={computed(() => genre.value === null)}
          onPress={() => (genre.value = null)}
        />
        {GENRES.map(entry => (
          <Chip
            key={entry.name}
            label={entry.name}
            count={entry.count}
            selected={computed(() => genre.value === entry.name)}
            onPress={() => (genre.value = genre.value === entry.name ? null : entry.name)}
          />
        ))}
      </row>
      <row gap={6} rowGap={6} y="center" flexWrap="wrap">
        <Chip
          label="Verified artists only"
          variant="outlined"
          size="small"
          selected={verified}
          onPress={next => (verified.value = next)}
        />
        <Chip
          label="Liked"
          icon={HEART}
          variant="outlined"
          size="small"
          selected={liked}
          onPress={next => (liked.value = next)}
        />
        <Chip label="Clear filters" variant="outlined" size="small" onPress={clear} />
        <Chip
          label="Offline only"
          description="Save a track to filter by it"
          variant="outlined"
          size="small"
          disabled
        />
      </row>
      <text text={summary} textStyle="bodySmall" color="textMuted" />
    </column>
  );
}
// #endregion chip
