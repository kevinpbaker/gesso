import { map } from 'rxjs/operators';

import { animateLayout, percent, spring, type UiChild } from '@gesso/core';
import { AnimationService, internalState, type ComponentContext, type Inputs } from '@gesso/framework';
import { HOVER_CONTROL } from './interaction';

const FOLDERS = ['Inbox', 'Drafts', 'Sent', 'Archive'] as const;

/**
 * One modifier value, shared by every row.
 *
 * A modifier's arguments are compared by identity, so a fresh object
 * built inside the list would detach and re-attach the modifier on
 * every emission, and a modifier that has just attached has no
 * previous box to animate from. The shared controls on this site are
 * hoisted for the same reason.
 */
const FLIP = animateLayout({ spring: 'snappy' });

const DETAIL =
  'The height is a bound prop. Nothing in this card starts an animation; the transition says how the prop travels.';

// #region transition
/**
 * A card that opens, without a line of animation code in it.
 *
 * `height` and the detail's `opacity` are ordinary bound props: they
 * take the value the state says, and taking the `transition` away
 * leaves a working card that jumps. `transition` names the properties
 * it animates and says how each one travels, a bare number being
 * milliseconds and `spring()` being the longer form.
 */
function Panel(props: Inputs<{ open: boolean }>, _ctx: ComponentContext): UiChild {
  return (
    <column
      width={260}
      gap={8}
      padding={14}
      overflow="hidden"
      borderRadius={10}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface"
      height={props.open.pipe(map(on => (on ? 140 : 64)))}
      transition={{ height: spring('gentle') }}>
      <text text="A property that travels" fontSize={14} fontWeight={600} color="text" />
      <text
        text={DETAIL}
        fontSize={12}
        color="textMuted"
        opacity={props.open.pipe(map(on => (on ? 1 : 0)))}
        transition={{ opacity: 180 }}
      />
    </column>
  );
}
// #endregion transition

// #region flip
/**
 * Four rows that animate when they change places, and only then.
 *
 * Nothing declares where a row moves from: the layout does. The
 * modifier keeps the box the row had last frame, draws it back there
 * and springs it home. It absorbs a move only when the row genuinely
 * changed places, so a neighbour resizing is followed rather than
 * animated.
 */
function Folders(props: Inputs<{ order: readonly string[] }>, _ctx: ComponentContext): UiChild {
  return (
    <column gap={8} width={200}>
      {props.order.pipe(
        map(names =>
          names.map(name => (
            <row
              key={name}
              modifiers={[FLIP]}
              gap={8}
              y="center"
              padding={10}
              borderRadius={8}
              borderWidth={1}
              borderColor="border"
              backgroundColor="surface">
              <box width={6} height={6} borderRadius={3} backgroundColor="primary" flexShrink={0} />
              <text text={name} fontSize={13} color="text" />
            </row>
          ))
        )
      )}
    </column>
  );
}
// #endregion flip

export function MotionBoard(_props: Inputs<{}>, ctx: ComponentContext): UiChild {
  const open = internalState(false);
  const order = internalState<readonly string[]>([...FOLDERS]);
  // #region reduced
  // The preference is a fact about the person, not about a region of
  // the tree, so it is read from a service rather than resolved
  // against a node. Bindable, so a component can decide not to draw a
  // decorative movement at all instead of running one that snaps.
  const animations = ctx.inject(AnimationService);
  const notice = animations.reducedMotion.pipe(
    map(reduced =>
      reduced
        ? 'Reduced motion is on, so every animation here writes its target at once.'
        : 'Reduced motion is off. Turn it on in your system settings and these controls still work; nothing moves.'
    )
  );
  // #endregion reduced

  const rotate = (): void => {
    const [first, ...rest] = order.value;
    order.value = first === undefined ? order.value : [...rest, first];
  };

  return (
    <column gap={14} x="center" y="center" width={percent(100)} height={percent(100)} padding={20}>
      <row gap={16} y="start">
        <Panel open={open} />
        <Folders order={order} />
      </row>
      <row gap={10}>
        <Control label="Open the card" onPress={() => (open.value = !open.value)} />
        <Control label="Move the top row down" onPress={rotate} />
      </row>
      <text text={notice} fontSize={11} color="textMuted" textAlign="center" maxWidth={420} />
    </column>
  );
}

function Control(props: Inputs<{ label: string; onPress: () => void }>, _ctx: ComponentContext): UiChild {
  return (
    <button
      onClick={() => props.onPress.value()}
      padding={8}
      borderRadius={6}
      borderWidth={1}
      borderColor="border"
      backgroundColor="background"
      cursor="pointer"
      modifiers={[HOVER_CONTROL]}>
      <text text={props.label} fontSize={12} color="text" />
    </button>
  );
}
