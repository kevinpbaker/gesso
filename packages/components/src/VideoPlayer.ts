import { map } from 'rxjs';

import {
  Box,
  Column,
  cueAt,
  percent,
  Text,
  type UiChild,
  type UiColorValue,
  type ObjectFit,
  type VideoTransport,
  type VttCue
} from 'gesso-core';
import { createComponent, input, internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { Video } from './Media';
import { layoutOf, modifiersOf, type ControlLayoutProps } from './internals';

import { followTransport } from './VideoControls';

export { clockTime } from './VideoControls';

export interface CaptionsProps extends ControlLayoutProps {
  /** The track, as `parseWebVtt` returns it. */
  cues: readonly VttCue[];
  /** Where the clip is, in seconds. */
  position: number;
  /** The plate the words sit on. Defaults to something dark enough to read over. */
  background?: UiColorValue;
  color?: UiColorValue;
}

/**
 * The line of a caption track that is due now.
 *
 * Separate from `VideoPlayer` because captions are not a player's
 * property: they are a second piece of content that happens to be
 * synchronised with the first. A clip with no controls at all still
 * wants them, and a transcript beside the video wants the same lookup
 * without any of the chrome.
 *
 * **Why this is a component and not a string.** The cue has to be
 * found again on every position it is asked about, and `cueAt` is fast
 * only if it is given the index it last answered. Holding that index
 * is the whole of this component's state, and holding it here means a
 * caller cannot accidentally throw it away by re-deriving the caption
 * in a render.
 *
 * Nothing is drawn between cues: an empty plate under a video is a
 * caption track that looks broken.
 */
export function Captions(inputs: Inputs<CaptionsProps>, _ctx: ComponentContext): UiChild {
  // The hint `cueAt` wants back. A field rather than state because
  // nothing renders from it: it is an optimisation, and writing it
  // through a cell would dirty a node once a frame to say so.
  let hint = 0;

  const text = inputs.position.pipe(
    map(position => {
      const found = cueAt(inputs.cues.value, position, hint);
      hint = found.index;
      return found.cue?.text ?? '';
    })
  );

  return Box(
    {
      ...layoutOf(inputs),
      modifiers: modifiersOf(inputs),
      // Gone entirely between cues rather than shown empty.
      opacity: text.pipe(map(current => (current === '' ? 0 : 1))),
      backgroundColor: input(inputs.background, 'rgba(0, 0, 0, 0.72)' as UiColorValue),
      borderRadius: 4,
      paddingX: 8,
      paddingY: 4
    },
    Text({
      text,
      color: input(inputs.color, '#ffffff' as UiColorValue),
      textAlign: 'center',
      // A caption is read, not selected, and a drag across it belongs
      // to whatever the video sits in.
      selectable: false
    })
  );
}

export interface VideoPlayerProps extends ControlLayoutProps {
  src: string;
  /**
   * What a screen reader reads for the picture.
   *
   * A player is not decorative: it has controls, so something is being
   * watched on purpose, and this names what. Unlike `Video`, leaving
   * it out is a gap rather than a decision.
   */
  alt?: string;
  /** The caption track, as `parseWebVtt` returns it. */
  captions?: readonly VttCue[];
  /** Start playing as soon as the clip is decoded. Defaults to false; see below. */
  autoplay?: boolean;
  loop?: boolean;
  objectFit?: ObjectFit;
  borderRadius?: number;
  /** Told when the clip is acted on, for an application keeping its own state. */
  onTransport?: (transport: VideoTransport) => void;
  /** Told when the level changed, so an application can pass it to whatever makes the noise. */
  onVolume?: (volume: number, muted: boolean) => void;
}

/**
 * A clip with its transport always showing, and captions under it.
 *
 * Almost nothing of its own since `Video` grew `controls`: this is
 * that, with the bar pinned up rather than revealed on hover, plus a
 * caption track. It stays a separate component because those two
 * choices are a *kind* of player rather than a setting, and because
 * captions are content that a bare `Video` has no business knowing
 * about.
 *
 * **It does not autoplay, and `Video` does.** They answer different
 * questions. A `Video` is usually a background, a texture, a thing
 * that moves; a clip with a play button on it is content someone chose
 * to watch, and starting it before they asked is the behaviour every
 * platform has spent a decade adding a setting to turn off. It is also
 * the honest reading of a reduced-motion preference: `Video` keeps
 * playing under one because a video frozen on its first frame is a
 * video that failed to load, and here a still frame states exactly the
 * truth, which is that the clip has not been started yet.
 */
export function VideoPlayer(inputs: Inputs<VideoPlayerProps>, ctx: ComponentContext): UiChild {
  const held = internalState<VideoTransport | null>(null, 'VideoPlayer.transport');
  const captions = inputs.captions.value;
  // The same extrapolated position the bar draws its scrubber from,
  // for the same reason a caption needs one: a clip's pictures arrive
  // at whatever rate it was encoded at, and a caption that waited for
  // a transport event would change only when the clip was acted on.
  const { position } = followTransport(ctx, held);

  return Column(
    { ...layoutOf(inputs), modifiers: modifiersOf(inputs), gap: 8 },
    createComponent(Video, {
      src: inputs.src.value,
      alt: inputs.alt.value,
      // A player's clip is started by a person, so it is built paused
      // unless the caller insisted otherwise.
      autoplay: inputs.autoplay.value ?? false,
      loop: inputs.loop.value ?? false,
      objectFit: inputs.objectFit.value,
      borderRadius: inputs.borderRadius.value,
      controls: { alwaysVisible: true },
      width: percent(100),
      flex: 1,
      minHeight: 0,
      onVolume: inputs.onVolume.value,
      onTransport: (transport: VideoTransport) => {
        held.value = transport;
        inputs.onTransport.value?.(transport);
      }
    }),
    ...(captions === undefined || captions.length === 0
      ? []
      : [createComponent(Captions, { cues: captions, position })])
  );
}
