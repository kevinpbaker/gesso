import { percent, type UiChild, type UiSemanticState } from 'gesso-core';
import { Button, Skeleton, SkeletonText } from 'gesso-components';
import { computed, internalState, show, type ComponentContext, type Inputs } from 'gesso-framework';

import { isStill } from '../still';

// #region skeleton
/**
 * A row's box, and the one number this example turns on.
 *
 * The artwork, the padding and therefore the height are declared once
 * and used by both the real row and its stand-in. That is the whole
 * discipline: the stand-in is not "about the right size", it is the
 * same size, so nothing under the list moves when the list arrives.
 */
const ART = 40;
const ROW_PAD = 8;
const ROW_HEIGHT = ART + ROW_PAD * 2;

/** The three rows, as a request would eventually hand them over. */
const TRACKS = [
  { title: 'Selected Ambient Works', artist: 'Aphex Twin', length: '4:12' },
  { title: 'Music for Airports', artist: 'Brian Eno', length: '17:20' },
  { title: 'Substrata', artist: 'Biosphere', length: '6:48' }
] as const;

/** How long the pretend request takes. */
const FETCH_MS = 2400;

/**
 * A list that fills in, and two stand-ins side by side.
 *
 * Press "Load again" to watch the swap. The thing to watch is not the
 * grey: it is the caption underneath, which does not move. Every row is
 * `ROW_HEIGHT` tall whichever of its two faces it is wearing, so the
 * arrival of three tracks changes what the rows say and nothing about
 * where anything sits.
 *
 * The two panels above show the choice `shimmer` offers. Neither says
 * anything the other does not; the moving one is for a wait long enough
 * that a still block starts to read as a broken layout.
 *
 * One announcement, not seven. Every `Skeleton` and `SkeletonText` in
 * the list is silenced with `announce={false}`, and the column around
 * them carries the `status` while it is waiting, so an assistive
 * technology hears "Loading tracks" once instead of hearing "Loading"
 * for each bar of each row.
 */
export function LoadingList(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const loaded = internalState(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const load = (): void => {
    loaded.value = false;
    clearTimeout(timer);
    timer = setTimeout(() => (loaded.value = true), FETCH_MS);
  };

  ctx.onMount(() => {
    // The screenshot gate photographs the wait rather than racing it.
    if (isStill()) {
      return;
    }
    load();
  });
  ctx.onUnmount(() => clearTimeout(timer));

  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)}>
      <row gap={12} y="center">
        <Button label="Load again" size="small" onClick={load} />
        <text
          text={computed(() => (loaded.value ? 'Three tracks, and nothing moved.' : 'Waiting, holding the places.'))}
          textStyle="bodySmall"
          color="textMuted"
        />
      </row>

      <row gap={20} y="start">
        {panel('Still', false)}
        {panel('Shimmering', true)}
      </row>

      <column
        gap={2}
        width={percent(100)}
        role={computed(() => (loaded.value ? undefined : ('status' as const)))}
        label="Loading tracks"
        states={computed(() => (loaded.value ? undefined : (['busy'] as UiSemanticState[])))}>
        {TRACKS.map(track => (
          <box key={track.title} width={percent(100)} height={ROW_HEIGHT}>
            {show(
              loaded,
              () => trackRow(track),
              () => rowStandIn()
            )}
          </box>
        ))}
      </column>
    </column>
  );
}

/** One of the two panels above the list, captioned with its setting. */
function panel(caption: string, shimmer: boolean): UiChild {
  return (
    <column gap={8} flex={1}>
      <text text={caption} textStyle="bodySmall" color="textMuted" />
      <row gap={10} y="center" width={percent(100)}>
        <Skeleton circle width={ART} shimmer={shimmer} announce={false} />
        <SkeletonText flex={1} lines={2} lineHeight={10} gap={7} shimmer={shimmer} announce={false} />
      </row>
    </column>
  );
}

/**
 * A row's stand-in: the same box, with its parts in the same places.
 *
 * Silent, because the column above it speaks for the whole list.
 */
function rowStandIn(): UiChild {
  return (
    <row width={percent(100)} height={ROW_HEIGHT} gap={12} paddingX={10} y="center">
      <Skeleton circle width={ART} shimmer announce={false} />
      <SkeletonText
        flex={1}
        lines={2}
        lineHeight={11}
        gap={8}
        widths={[percent(52), percent(32)]}
        announce={false}
        shimmer
      />
      <Skeleton width={28} height={11} shimmer announce={false} />
    </row>
  );
}

/** The real row, which is what the box was being held open for. */
function trackRow(track: (typeof TRACKS)[number]): UiChild {
  return (
    <row width={percent(100)} height={ROW_HEIGHT} gap={12} paddingX={10} y="center">
      <box width={ART} height={ART} borderRadius={999} backgroundColor="primary" flexShrink={0} />
      <column flex={1} gap={3} y="center" x="start">
        <text text={track.title} textStyle="body" color="text" textWrap="none" />
        <text text={track.artist} textStyle="bodySmall" color="textMuted" textWrap="none" />
      </column>
      <text text={track.length} textStyle="bodySmall" color="textMuted" textWrap="none" />
    </row>
  );
}
// #endregion skeleton
