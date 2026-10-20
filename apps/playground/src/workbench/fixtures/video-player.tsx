import { map } from 'rxjs/operators';

import { parseWebVtt, type VideoTransport, type VttCue } from 'gesso-core';
import { Button, Captions, Video, VideoControls, VideoPlayer } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

/** Each state's own source: playback is shared by source string. */
function clip(name: string): string {
  return `/video/clip.mp4?workbench-player-${name}`;
}

function cue(start: number, end: number, text: string): VttCue {
  return { start, end, text, settings: {} };
}

/** The same four lines as `public/video/clip.vtt`, written here so they are there at mount. */
const CUES: readonly VttCue[] = [
  cue(0, 1.5, 'The counter in the corner is the frame number.'),
  cue(1.5, 3, 'Drag the scrubber: the number should land where you left it.'),
  cue(3, 4.5, 'A seek starts at the keyframe before the target,'),
  cue(4.5, 6, 'and decodes forward without showing the gap.')
];

/** Cues with gaps between them, one long enough to wrap and one on two lines. */
const GAPPY: readonly VttCue[] = [
  cue(0.5, 1.5, 'Short.'),
  cue(2.5, 4, 'A much longer caption that has to wrap onto a second line in a narrow plate under the picture.'),
  cue(5, 6, 'Two lines,\nkept as two.')
];

const WIDTH = 260;
const HEIGHT = 190;

/** A player whose captions are fetched after it mounts, as the playground's video page does. */
function LateCaptions(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const cues = internalState<readonly VttCue[]>([]);
  const note = internalState('Fetching clip.vtt…');
  fetch('/video/clip.vtt')
    .then(response => response.text())
    .then(text => {
      const track = parseWebVtt(text);
      cues.value = track.cues;
      note.value = `${track.cues.length} cues arrived`;
    })
    .catch(() => (note.value = 'The caption file could not be read'));
  return (
    <column gap={6} x="start">
      <VideoPlayer src={clip('late')} alt="A test pattern" captions={cues} width={WIDTH} height={HEIGHT} />
      <text textStyle="bodySmall" color="textMuted">
        {note}
      </text>
    </column>
  );
}

/** Captions alone, stepped through by hand, with no video at all. */
function SteppedCaptions(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const position = internalState(0);
  const step = (by: number) => () => (position.value = Math.max(0, Math.min(7, position.value + by)));
  return (
    <column gap={8} x="start">
      <box width={220} height={70} backgroundColor="#202020" borderRadius={6} x="center" y="end" padding={6}>
        <Captions cues={GAPPY} position={position} maxWidth={200} />
      </box>
      <row gap={6} y="center">
        <Button label="−0.5 s" size="small" variant="outlined" onClick={step(-0.5)} />
        <Button label="+0.5 s" size="small" variant="outlined" onClick={step(0.5)} />
        <Button label="Back to 0" size="small" variant="outlined" onClick={() => (position.value = 0)} />
      </row>
      <text textStyle="bodySmall" color="textMuted">
        {position.pipe(map(at => `Position: ${at.toFixed(1)} s`))}
      </text>
    </column>
  );
}

/** A bare `Video` and a `VideoControls` laid under it rather than over it. */
function OwnBar(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const transport = internalState<VideoTransport | null>(null);
  const heard = internalState('nothing yet');
  return (
    <column gap={6} x="start">
      <Video
        src={clip('own-bar')}
        alt="A test pattern"
        autoplay={false}
        width={WIDTH}
        height={146}
        objectFit="contain"
        borderRadius={6}
        onTransport={next => (transport.value = next)}
        onVolume={(level, muted) => (heard.value = muted ? 'muted' : `${Math.round(level * 100)}%`)}
      />
      <box width={WIDTH} backgroundColor="#1e293b" borderRadius={6}>
        <VideoControls
          transport={transport}
          options={{ alwaysVisible: true, fullscreen: false }}
          volumeWired
          background="#1e293b"
          color="#fde68a"
        />
      </box>
      <text textStyle="bodySmall" color="textMuted">
        {heard.pipe(map(level => `Volume told: ${level}`))}
      </text>
    </column>
  );
}

/** A player with sound wired, so the level control is drawn. */
function Wired(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const heard = internalState('nothing yet');
  const acted = internalState('No transport yet');
  return (
    <column gap={6} x="start">
      <VideoPlayer
        src={clip('wired')}
        alt="A test pattern"
        captions={CUES}
        width={WIDTH}
        height={HEIGHT}
        onVolume={(level, muted) => (heard.value = muted ? 'muted' : `${Math.round(level * 100)}%`)}
        onTransport={transport => (acted.value = `Transport ready: ${transport.duration.toFixed(2)} s`)}
      />
      <text textStyle="bodySmall" color="textMuted">
        {heard.pipe(map(level => `Volume told: ${level}`))}
      </text>
      <text textStyle="bodySmall" color="textMuted">
        {acted}
      </text>
    </column>
  );
}

export const videoPlayerFixture: WorkbenchFixture = {
  id: 'video-player',
  name: 'VideoPlayer',
  source: 'packages/components/src/VideoPlayer.ts',
  states: [
    {
      name: 'Paused until pressed',
      try: 'The first frame shows and the bar is up without hovering. No caption plate shows yet. Press Play: the counter runs, the time counts, and a caption appears under the picture and changes every 1.5 s.',
      width: 300,
      render: () => (
        <VideoPlayer src={clip('paused')} alt="A test pattern" captions={CUES} width={WIDTH} height={HEIGHT} />
      )
    },
    {
      name: 'Scrub with captions',
      try: 'Drag the scrubber to about 4 s while paused: the frame counter lands there, and the caption switches to the third line at once, not after Play. Drag back to 0: the first line returns.',
      width: 300,
      render: () => (
        <VideoPlayer src={clip('scrub')} alt="A test pattern" captions={CUES} width={WIDTH} height={HEIGHT} />
      )
    },
    {
      name: 'Captions that arrive late',
      try: 'The caption file is fetched after the player mounts. Once the line says 4 cues arrived, press Play: captions appear under the picture just as they do when they are there from the start.',
      width: 300,
      render: () => <LateCaptions />
    },
    {
      name: 'Ends without looping',
      try: 'Autoplay on, loop off. It plays once and stops on the last frame; the button turns to Play, the scrubber sits at the end, the time reads 0:06 / 0:06. Press Play: it starts again from 0.',
      width: 300,
      render: () => (
        <VideoPlayer
          src={clip('ends')}
          alt="A test pattern"
          captions={CUES}
          autoplay
          loop={false}
          width={WIDTH}
          height={HEIGHT}
        />
      )
    },
    {
      name: 'No captions',
      try: 'No plate and no empty space under the picture; the clip takes the full height of the cell.',
      width: 300,
      render: () => <VideoPlayer src={clip('bare')} alt="A test pattern" width={WIDTH} height={HEIGHT} />
    },
    {
      name: 'A source that fails',
      try: 'The picture stays the placeholder tint. The bar is drawn but does not pretend: Play does nothing visible, the scrubber does not move, and the time reads 0:00. Nothing on screen says why, since the player has no onState.',
      width: 300,
      render: () => (
        <VideoPlayer src="/video/nothing-here.mp4?workbench-player" alt="Nothing" width={WIDTH} height={HEIGHT} />
      )
    },
    {
      name: 'Narrow',
      try: 'A 160px player. The bar’s buttons, scrubber and time fit inside the picture or drop parts cleanly; nothing overlaps or spills past the rounded corners. Captions wrap under it.',
      width: 220,
      render: () => <VideoPlayer src={clip('narrow')} alt="A test pattern" captions={CUES} width={160} height={150} />
    },
    {
      name: 'Volume wired',
      try: 'With onVolume given, a mute button and level slider appear in the bar. Drag the level: the line says the percentage. Mute: it says muted; unmute: it returns to the old level, not 0%.',
      width: 300,
      render: () => <Wired />
    },
    {
      name: 'Captions on their own',
      try: 'Step with +0.5 s. Whenever no cue is due (at 0, 1.5 to 2, 4 to 4.5, and past 6) the plate disappears entirely rather than showing empty. The long cue wraps inside the plate; "Two lines" shows as two lines. Stepping back finds the earlier cue again.',
      width: 280,
      render: () => <SteppedCaptions />
    },
    {
      name: 'Your own bar under a Video',
      try: 'VideoControls drawn below the clip in amber on slate. Play, scrub and the level all drive the clip above, and the volume line follows. The bar works before the clip has loaded without throwing.',
      width: 300,
      render: () => <OwnBar />
    }
  ]
};
