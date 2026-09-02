import { map } from 'rxjs/operators';

import { fade, percent, sharedElement, type UiChild } from '@gesso/core';
import { internalState, Presence, type ComponentContext, type Inputs } from '@gesso/framework';
import { HOVER_CONTROL } from './interaction';

/** The name both covers answer to. It names a thing, not a place. */
export const COVER = 'docs-cover';

export const COVER_SIZE = 72;
export const BANNER_HEIGHT = 132;

const SUMMARY =
  'Nine field recordings made between March and June, ordered by the hour they were taken rather than by place.';

// #region list
/**
 * The list, whose cover is the element the next screen continues from.
 *
 * Nothing here knows a transition exists. The modifier claims a name,
 * and reports the box this element is seen in whenever the layout
 * moves it.
 */
function Summary(props: Inputs<{ onOpen: () => void }>, _ctx: ComponentContext): UiChild {
  return (
    <column gap={12} padding={20} width={percent(100)}>
      <text text="Collections" fontSize={12} fontWeight={600} color="textMuted" />
      <row
        gap={12}
        y="center"
        padding={10}
        borderRadius={10}
        borderWidth={1}
        borderColor="border"
        backgroundColor="surface">
        <box
          width={COVER_SIZE}
          height={COVER_SIZE}
          borderRadius={8}
          backgroundColor="primary"
          role="image"
          label="Aurora cover"
          flexShrink={0}
          modifiers={[sharedElement({ name: COVER })]}
        />
        <column gap={3} flexGrow={1}>
          <text text="Aurora" fontSize={15} fontWeight={600} color="text" />
          <text text="Nine recordings" fontSize={12} color="textMuted" />
        </column>
        <button
          onClick={() => props.onOpen.value()}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          label="Open Aurora"
          modifiers={[HOVER_CONTROL]}>
          <text text="Open" fontSize={12} color="text" />
        </button>
      </row>
    </column>
  );
}
// #endregion list

// #region detail
/**
 * The screen it opens into. Same name, a different box.
 *
 * The arriving element asks the registry where the element holding
 * this name was standing, and springs from that box onto its own. The
 * departing element yields the moment the name changes hands, so there
 * are never two of the same thing on screen.
 */
function Detail(props: Inputs<{ onBack: () => void }>, _ctx: ComponentContext): UiChild {
  return (
    <column gap={12} padding={20} width={percent(100)}>
      <box
        width={percent(100)}
        height={BANNER_HEIGHT}
        borderRadius={12}
        backgroundColor="primary"
        role="image"
        label="Aurora cover"
        modifiers={[sharedElement({ name: COVER })]}
      />
      <text text="Aurora" fontSize={20} fontWeight={600} color="text" />
      <text text={SUMMARY} fontSize={12} color="textMuted" />
      <row>
        <button
          onClick={() => props.onBack.value()}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text text="Back" fontSize={12} color="text" />
        </button>
      </row>
    </column>
  );
}
// #endregion detail

// #region swap
/**
 * The screen change itself.
 *
 * `exit` and no `enter`, deliberately: a screen's opacity is inherited
 * by everything inside it, and the morphing cover is inside the
 * arriving screen, so fading that screen in would fade the morph with
 * it. The departing screen may fade, because nothing is morphing out
 * of it.
 */
export function SharedElementStage(_props: Inputs<{}>, _ctx: ComponentContext): UiChild {
  const view = internalState<'list' | 'detail'>('list');

  return (
    <box width={percent(100)} height={percent(100)} backgroundColor="background">
      <Presence exit={fade} timing={{ duration: 220 }}>
        {view.pipe(
          map(current =>
            current === 'list'
              ? [<Summary key="list" onOpen={() => (view.value = 'detail')} />]
              : [<Detail key="detail" onBack={() => (view.value = 'list')} />]
          )
        )}
      </Presence>
    </box>
  );
}
// #endregion swap
