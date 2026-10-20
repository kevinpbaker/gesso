import { map } from 'rxjs/operators';

import type { ObjectFit, UiColorValue, VideoState, VideoTransport } from 'gesso-core';
import { Button, Video, type VideoControlsOptions } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/**
 * The playground's own six-second test pattern, which draws its frame
 * number, under a query string of each state's own: playback is shared
 * by source, and two states on one string would drive one decode.
 */
function clip(name: string, file = 'clip.mp4'): string {
  return `/video/${file}?workbench-${name}`;
}

const WIDTH = 240;
const HEIGHT = 135;

interface WatchedProps {
  src: string;
  poster?: string;
  autoplay?: boolean;
  loop?: boolean;
  rate?: number;
  controls?: boolean | VideoControlsOptions;
  objectFit?: ObjectFit;
  placeholderColor?: UiColorValue;
  width?: number;
  height?: number;
  /** Buttons under the clip that drive its transport. */
  driven?: boolean;
}

/**
 * A clip, and what it reported: its state, its failure, and what the
 * transport said the last time something happened to it.
 */
function Watched(inputs: Inputs<WatchedProps>, ctx: ComponentContext) {
  const state = internalState<VideoState>('loading');
  const error = internalState('');
  const readout = internalState('No transport yet');
  let transport: VideoTransport | null = null;
  let release: (() => void) | null = null;
  ctx.onUnmount(() => release?.());
  const describe = (): void => {
    const live = transport;
    if (live === null) return;
    readout.value =
      `${live.paused ? 'Paused' : 'Playing'} at ${live.position.toFixed(2)}s of ${live.duration.toFixed(2)}s` +
      `${live.seeking ? ', seeking' : ''}, rate ${live.rate}`;
  };
  const act = (run: (live: VideoTransport) => void) => () => {
    if (transport !== null) {
      run(transport);
      describe();
    }
  };
  return (
    <column gap={6} x="start">
      <Video
        src={inputs.src.value}
        alt="A test pattern with a frame counter"
        poster={inputs.poster.value}
        autoplay={inputs.autoplay.value}
        loop={inputs.loop.value}
        rate={inputs.rate.value}
        controls={inputs.controls.value}
        objectFit={inputs.objectFit.value ?? 'contain'}
        placeholderColor={inputs.placeholderColor.value}
        width={inputs.width.value ?? WIDTH}
        height={inputs.height.value ?? HEIGHT}
        borderRadius={6}
        onState={(next, failure) => {
          state.value = next;
          if (next === 'failed') {
            error.value =
              failure instanceof Error ? failure.message : String(failure ?? 'failed, with no reason given');
          }
        }}
        onTransport={next => {
          transport = next;
          release?.();
          release = next.onChange(describe);
          describe();
        }}
      />
      <text textStyle="bodySmall" color="textMuted">
        {state.pipe(map(now => `State: ${now}`))}
      </text>
      <text textStyle="bodySmall" color="textMuted" textWrap="word">
        {readout}
      </text>
      <text textStyle="bodySmall" color="danger" textWrap="word">
        {error}
      </text>
      {inputs.driven.value === true ? (
        <row gap={6} flexWrap="wrap">
          <Button label="Play" size="small" variant="outlined" onClick={act(live => live.play())} />
          <Button label="Pause" size="small" variant="outlined" onClick={act(live => live.pause())} />
          <Button label="Seek 3 s" size="small" variant="outlined" onClick={act(live => live.seek(3))} />
          <Button label="Seek past end" size="small" variant="outlined" onClick={act(live => live.seek(60))} />
          <Button label="Half speed" size="small" variant="outlined" onClick={act(live => live.setRate(0.5))} />
          <Button label="Normal speed" size="small" variant="outlined" onClick={act(live => live.setRate(1))} />
        </row>
      ) : null}
    </column>
  );
}

export const videoFixture: WorkbenchFixture = {
  id: 'video',
  name: 'Video',
  source: 'packages/components/src/Media.ts',
  states: [
    {
      name: 'Plays and loops',
      try: 'The frame counter runs smoothly and, after six seconds, starts again from 0 with no black frame or freeze at the seam. State reads playing. Switch to Dark and back: the clip carries on rather than restarting.',
      width: 280,
      render: () => <Watched src={clip('loop')} />
    },
    {
      name: 'Poster while loading',
      try: 'Press Reset states and watch: the poster shows first, never an empty box, then the clip replaces it in place with no jump in size.',
      width: 280,
      render: () => <Watched src={clip('poster', 'clip-long.mp4')} poster="/video/poster.jpg" />
    },
    {
      name: 'Autoplay off',
      try: 'The first frame is shown, not the grey placeholder, and the counter does not move. Press Play: it starts from that frame.',
      width: 300,
      render: () => <Watched src={clip('still')} autoplay={false} driven />
    },
    {
      name: 'Stops at the end',
      try: 'Loop off. It plays once and holds the last frame (the counter near its highest), and the line reads Paused at about 6.00s. Hover: the bar’s button shows Play. Press it: the clip starts again from the beginning, not stuck at the end.',
      width: 280,
      render: () => <Watched src={clip('end')} loop={false} controls />
    },
    {
      name: 'Driven from outside',
      try: 'Each button changes the picture and the line agrees: Pause freezes the counter, Seek 3 s lands near frame 3 s even while paused, Seek past end clamps to the end, Half speed halves the counter’s pace.',
      width: 300,
      render: () => <Watched src={clip('driven')} driven />
    },
    {
      name: 'Controls on hover',
      try: 'Move the pointer over the clip: the bar slides up. Hold still: it goes after about a second. Rest on the bar itself: it stays. Tab into the bar: it stays while a control in it has focus. Play, scrub and fullscreen all work; Escape leaves fullscreen.',
      width: 280,
      render: () => <Watched src={clip('hover')} controls autoplay={false} />
    },
    {
      name: 'Controls that never hide',
      try: 'hideAfterMs is 0, documented as "keeps it up until the pointer leaves". Hover and hold still: it stays. Move the pointer off the clip: the bar goes away.',
      width: 280,
      render: () => <Watched src={clip('hide-zero')} controls={{ hideAfterMs: 0 }} autoplay={false} />
    },
    {
      name: 'No source',
      try: 'An empty src. The box keeps the placeholder tint (red here, from placeholderColor), state reads failed, and a message says why in words. Nothing is left spinning.',
      width: 280,
      render: () => <Watched src="" placeholderColor="danger" />
    },
    {
      name: 'Not a video',
      try: 'This path is answered with the dev server’s HTML page. State reads failed, and the message says the file could not be read as a video rather than something vague. The tint stays.',
      width: 280,
      render: () => <Watched src="/video/nothing-here.mp4?workbench" />
    },
    {
      name: 'Fitted into a wide strip',
      try: 'The same clip in a 260×60 strip, contained and then covered. Contain shows the whole frame, letterboxed left and right; cover fills the strip and crops top and bottom. Neither draws outside its rounded corners.',
      width: 300,
      render: () => (
        <column gap={8}>
          <Watched src={clip('contain')} width={260} height={60} objectFit="contain" />
          <Watched src={clip('cover')} width={260} height={60} objectFit="cover" />
        </column>
      )
    }
  ]
};
