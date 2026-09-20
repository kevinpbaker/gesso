import { Column, parseWebVtt, Text } from 'gesso-core';
import { VideoPlayer } from 'gesso-components';
import { createComponent, type ComponentContext, type Inputs } from 'gesso-framework';

export { ClipResolver } from './VideoExample';

// #region captions
/**
 * A caption track, read from the text a `.vtt` file holds.
 *
 * Written out here rather than fetched because the page fetches
 * nothing, and parsed rather than hand-built because the parse is the
 * part worth showing: `parseWebVtt` turns a file into cues, `cueAt`
 * finds the one due at a position, and `Captions` draws it. None of
 * the three knows anything about video.
 */
const TRACK = parseWebVtt(`WEBVTT

00:00.000 --> 00:00.800
A square crosses the frame.

00:00.800 --> 00:01.600
It reaches the far side,

00:01.600 --> 00:02.400
turns around,

00:02.400 --> 00:03.200
and starts back.
`).cues;
// #endregion captions

// #region player
/**
 * A clip with something to press.
 *
 * `VideoPlayer` is an ordinary component written against the same
 * `VideoTransport` any application can hold: a `Video` for the
 * rectangle, a `Button` and a `Slider` for the transport, and
 * `Captions` over the bottom of the picture. Nothing here has
 * privileged access to the clip, which is the point.
 *
 * It does not autoplay, and `Video` does. They answer different
 * questions: a `Video` is usually a background, and a clip with a play
 * button on it is content someone chose to watch.
 */
export function Player(_inputs: Inputs<Record<string, never>>, _ctx: ComponentContext) {
  return Column(
    { gap: 16, padding: 16, width: 360 },
    createComponent(VideoPlayer, {
      src: 'playing.clip',
      alt: 'A square crossing the frame and back',
      captions: TRACK,
      loop: true,
      width: 328,
      height: 185
    }),
    Text({
      text: 'Press play. The scrubber can be dragged while it is paused.',
      textStyle: 'bodySmall',
      color: 'textMuted'
    })
  );
}
// #endregion player
