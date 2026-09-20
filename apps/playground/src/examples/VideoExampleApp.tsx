import { map } from 'rxjs';

import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  cueAt,
  parseWebVtt,
  percent,
  type UiChild,
  type VideoState,
  type VideoTransport,
  type VttCue
} from 'gesso-core';
import { Video, VideoPlayer, type VideoControlsOptions } from 'gesso-components';

import { gessoTheme } from './brand';
import { blobUrlOf, dataUrlOf, RANGED, type ScenarioResolver } from './video/VideoScenarios';

/**
 * Every way a clip can arrive, on one page.
 *
 * The other video in this playground is `example-transitions`, where a
 * clip is one element among many and the subject is the morph it
 * survives. This page is the opposite: nothing here is designed, and
 * every card exists to make one claim about the pipeline checkable by
 * looking at it.
 *
 * **The clips are `testsrc2`**, which draws a frame counter and a
 * moving pattern rather than being footage of anything. That is the
 * whole reason to use it: a seek that lands on the wrong frame, a
 * decoder that stalls after its first keyframe, and a loop that
 * restarts a beat early are all *visible* here, where against real
 * footage you would have to take them on trust.
 * `scripts/gen-video-fixtures.sh` builds them.
 *
 * **What each card is for** is in its own note, and the ones worth
 * knowing about before you scroll:
 *
 *   - Three cards play the same six seconds from three different
 *     transports: a url, a `blob:` and a `data:`. They should be
 *     indistinguishable, which is the point.
 *   - Two cards play files this demuxer could not read at all until
 *     recently: one fragmented, one with its `moov` at the end.
 *   - Two cards will fail on most machines, deliberately. VP9 and AV1
 *     are decoded by the platform or not at all, and a card that says
 *     so is worth more than one quietly missing.
 *   - The last card is a long way down the page, and is not decoding
 *     while you read this.
 */

const CLIP = '/video/clip.mp4';
const CAPTIONS = '/video/clip.vtt';

/**
 * The same file, under a name of its own.
 *
 * Playback is shared by source, which is the behaviour the twin card
 * exists to show and is a nuisance everywhere else on this page: six
 * cards pointed at `clip.mp4` would hold *one* playback between them
 * and each drive its position from its own tween, so the still would
 * not be still, the half-speed card would run at whatever rate the
 * last writer asked for, and the decoder would seek several times a
 * frame trying to be in six places at once.
 *
 * A query string the server ignores is enough to separate them,
 * because the resolver keys on the string it was given rather than on
 * the bytes behind it. That is a device of this page. An application
 * showing one clip in one place never meets it, and an application
 * that *wants* the sharing, as a route transition does, gets it by
 * naming the same source.
 */
function own(name: string): string {
  return `${CLIP}?${name}`;
}

/** The width every card's picture is drawn at. */
const PICTURE = 320;
const PICTURE_HEIGHT = 180;

/**
 * A card: a title, a note, a picture, and what actually happened.
 *
 * The last part is the reason this component exists rather than the
 * cards being written out. What a reader needs in order to believe any
 * of this is the state the clip reached and what it cost, and that is
 * four cells and a subscription per card.
 */
interface ScenarioProps {
  title: string;
  note: string;
  /** Absent means the source is still being prepared; see `LazySource`. */
  src?: string;
  poster?: string;
  autoplay?: boolean;
  loop?: boolean;
  rate?: number;
  resolver: ScenarioResolver;
  /** A second picture on the same source, for the shared-playback card. */
  twin?: boolean;
  /** Draw the built-in transport over the picture. */
  controls?: boolean | VideoControlsOptions;
  /** Wire the level to something, which is what makes a volume control honest. */
  sound?: boolean;
}

function Scenario(inputs: Inputs<ScenarioProps>, _ctx: ComponentContext): UiChild {
  const resolver = inputs.resolver.value;
  const src = inputs.src.value;
  const state = internalState<VideoState>('loading');
  const error = internalState<string>('');
  // What the volume control actually did, since nothing here plays
  // the sound: proof that the level reaches the application.
  const heard = internalState<string>('');
  const detail = internalState<string>('');
  let transport: VideoTransport | null = null;

  const describe = (): void => {
    const report = src === undefined ? undefined : resolver.reports.get(src);
    const parts: string[] = [];
    if (transport !== null && transport.duration > 0) {
      parts.push(`${transport.duration.toFixed(2)}s`);
    }
    if (report?.note !== undefined) {
      parts.push(report.note);
    }
    detail.value = parts.join(' · ');
  };

  // Every fetch this page makes, so the ranged card's request count
  // climbs on screen as the decoder asks for more of the file rather
  // than being a number frozen at whatever it was when the clip
  // opened.
  resolver.onReport(describe);

  const onState = (next: VideoState, failure?: unknown): void => {
    state.value = next;
    if (next === 'failed') {
      // The message is the whole value of this card for the two codec
      // scenarios: "no decoder for av01.0.05M.08 on this platform" is
      // an answer, and a blank box is not.
      error.value = failure instanceof Error ? failure.message : String(failure ?? 'it failed');
    }
    describe();
  };

  const picture = (key: string): UiChild =>
    src === undefined ? (
      <box
        key={key}
        width={PICTURE}
        height={PICTURE_HEIGHT}
        backgroundColor="surfaceRaised"
        borderRadius={6}
        x="center"
        y="center">
        <text color="textMuted" fontSize={12}>
          preparing the source
        </text>
      </box>
    ) : (
      <Video
        key={key}
        src={src}
        alt={inputs.title.value}
        poster={inputs.poster.value}
        autoplay={inputs.autoplay.value ?? true}
        loop={inputs.loop.value ?? true}
        rate={inputs.rate.value}
        width={PICTURE}
        height={PICTURE_HEIGHT}
        objectFit="contain"
        borderRadius={6}
        controls={inputs.controls.value}
        onVolume={
          inputs.sound.value === true
            ? (level: number, silent: boolean) => (heard.value = silent ? 'muted' : `${Math.round(level * 100)}%`)
            : undefined
        }
        onState={onState}
        onTransport={(next: VideoTransport) => {
          transport = next;
          next.onChange(describe);
          describe();
        }}
      />
    );

  return (
    <column gap={8} padding={14} backgroundColor="surface" borderColor="border" borderWidth={1} borderRadius={10}>
      <text color="text" fontSize={14} fontWeight={600}>
        {inputs.title.value}
      </text>
      <text color="textMuted" fontSize={12}>
        {inputs.note.value}
      </text>
      <row gap={10}>
        {picture('one')}
        {inputs.twin.value === true ? picture('two') : null}
      </row>
      <row gap={8} y="center">
        <box
          width={8}
          height={8}
          borderRadius={4}
          backgroundColor={state.pipe(
            map(current => (current === 'playing' ? 'positive' : current === 'failed' ? 'danger' : 'border'))
          )}
        />
        <text color="textMuted" fontSize={11}>
          {state.pipe(map(current => (current === 'playing' ? 'decoding' : current)))}
        </text>
        <text color="textMuted" fontSize={11}>
          {detail}
        </text>
      </row>
      <text color="textMuted" fontSize={11}>
        {heard.pipe(map(level => (level === '' ? '' : `the application was told: ${level}`)))}
      </text>
      <text color="danger" fontSize={11} textWrap="word">
        {error}
      </text>
    </column>
  );
}

/**
 * A card whose source has to be built before it can be shown.
 *
 * `Video` reads `src` once, because a body runs once and a clip whose
 * source changed is a different clip. A `blob:` URL does not exist
 * until its bytes have been fetched, so the card renders a placeholder
 * and then renders a *new* `Scenario` once the url is in hand. The
 * `key` is what makes that a new one rather than an edit of the old.
 */
function LazySource(
  inputs: Inputs<{ title: string; note: string; make: () => Promise<string>; resolver: ScenarioResolver }>,
  _ctx: ComponentContext
): UiChild {
  const src = internalState<string | undefined>(undefined);
  const failed = internalState<string>('');

  inputs.make
    .value()
    .then(url => (src.value = url))
    .catch((error: unknown) => (failed.value = error instanceof Error ? error.message : String(error)));

  return (
    <column>
      {src.pipe(
        map(url => (
          <Scenario
            key={url ?? 'pending'}
            title={inputs.title.value}
            note={inputs.note.value}
            src={url}
            resolver={inputs.resolver.value}
          />
        ))
      )}
      <text color="danger" fontSize={11}>
        {failed}
      </text>
    </column>
  );
}

/**
 * The transport card: a clip with controls and a caption track.
 *
 * `VideoPlayer` is an ordinary component built out of `Button`,
 * `Slider` and `Captions` against the public `VideoTransport`, which
 * is the claim being demonstrated: nothing here has privileged access
 * to the decoder.
 */
function PlayerCard(inputs: Inputs<{ cues: readonly VttCue[] }>, _ctx: ComponentContext): UiChild {
  return (
    <column gap={8} padding={14} backgroundColor="surface" borderColor="border" borderWidth={1} borderRadius={10}>
      <text color="text" fontSize={14} fontWeight={600}>
        A transport, and captions
      </text>
      <text color="textMuted" fontSize={12}>
        Press play, then drag the scrubber. The frame counter should land where you left it and the caption should
        follow. A seek resets the decoder at the keyframe before the target and decodes forward without showing the gap.
      </text>
      <VideoPlayer
        src={`${CLIP}?player`}
        alt="A test pattern with a frame counter"
        captions={inputs.cues.value}
        loop={true}
        width={PICTURE + 40}
        height={PICTURE_HEIGHT}
        objectFit="contain"
        borderRadius={6}
      />
    </column>
  );
}

export function VideoExampleApp(inputs: Inputs<{ resolver: ScenarioResolver }>, _ctx: ComponentContext): UiChild {
  const resolver = inputs.resolver.value;
  const cues = internalState<readonly VttCue[]>([]);
  const captionNote = internalState<string>('');

  fetch(CAPTIONS)
    .then(response => response.text())
    .then(text => {
      const track = parseWebVtt(text);
      cues.value = track.cues;
      captionNote.value = `${track.cues.length} cues, ${track.skipped} skipped`;
      // A sanity read of the lookup, printed rather than asserted:
      // the cue due two seconds in.
      void cueAt(track.cues, 2);
    })
    .catch(() => (captionNote.value = 'the caption track could not be read'));

  return (
    <scrollview theme={gessoTheme} width={percent(100)} height={percent(100)} backgroundColor="background">
      <column gap={14} padding={18} maxWidth={760}>
        <text color="text" fontSize={20} fontWeight={600}>
          Video, every way it arrives
        </text>
        <text color="textMuted" fontSize={13} textWrap="word">
          Every clip on this page is the same six seconds of a test pattern, which draws its own timecode and frame
          number so that a seek landing on the wrong frame is something you can see rather than something you have to
          trust. There is no video element anywhere: each file is fetched, demuxed and decoded in the render worker, and
          each frame is drawn on the thread that produced it.
        </text>

        <Scenario
          resolver={resolver}
          title="A url"
          note="The ordinary case. H.264 with its moov at the front, fetched whole, looping."
          src={CLIP}
        />

        <LazySource
          resolver={resolver}
          title="A blob: URL"
          note="The same bytes, handed over as a blob. What you have after a file picker or a drag and drop. The resolver does not care: it is a url that fetch answers."
          make={() => blobUrlOf(CLIP)}
        />

        <LazySource
          resolver={resolver}
          title="A data: URL"
          note="The same bytes again, inlined as base64. Indistinguishable on screen, and the one transport that cannot be read in ranges."
          make={() => dataUrlOf(CLIP)}
        />

        <Scenario
          resolver={resolver}
          title="A moov at the end of the file"
          note="What a camera writes, and what -movflags +faststart exists to undo. A reader that only looked at the front of the file would refuse this."
          src="/video/clip-moov-last.mp4"
        />

        <Scenario
          resolver={resolver}
          title="A fragmented MP4"
          note="No sample tables at all: a moof per group of pictures, with sizes and durations inline and the rest defaulted from trex. This is what a DASH or HLS segment is."
          src="/video/clip-fragmented.mp4"
        />

        <Scenario
          resolver={resolver}
          title="Read in ranges, not whole"
          note="Thirty seconds, read a quarter of a megabyte at a time. The header is found by walking the top-level boxes, and media follows the decoder. Scrub the transport card above and watch this one's request count climb."
          src={`${RANGED}/video/clip-long.mp4`}
        />

        <Scenario
          resolver={resolver}
          title="VP9"
          note="Decoded by the platform or not at all. The codec string is assembled from the vpcC rather than guessed, because vp09 on its own is not one."
          src="/video/clip-vp9.mp4"
        />

        <Scenario
          resolver={resolver}
          title="AV1"
          note="The same, from an av1C. Expect this to fail where there is no AV1 decoder, and expect it to say so: a message naming the codec is worth more than a blank box."
          src="/video/clip-av1.mp4"
        />

        <Scenario
          resolver={resolver}
          title="A file with sound"
          note="The audio track is demuxed but not played: AudioContext does not exist on a worker, so sound is the shell's. The picture is unaffected, which is the point of this card."
          src="/video/clip-audio.mp4"
        />

        <Scenario
          resolver={resolver}
          title="A poster, while it loads"
          note="A clip carries its own poster once the decoder is configured, since the first frame is presented playing or not. This is for the window before that."
          src={own('poster')}
          poster="/video/poster.jpg"
        />

        <Scenario
          resolver={resolver}
          title="Held on one frame"
          note="Autoplay off. The first frame is presented and the position is never driven, which is a still rather than a clip that failed."
          src={own('still')}
          autoplay={false}
        />

        <Scenario
          resolver={resolver}
          title="Half speed"
          note="Rate 0.5. The tween runs twice as long and the clip declares half its frame interval, so it wakes the application half as often to say so."
          src={own('half')}
          rate={0.5}
        />

        <Scenario
          resolver={resolver}
          title="One decode, two pictures"
          note="Two Video elements on one source. The resolver reference counts, so they share a playback and a surface: the counters stay in step because there is only one of them."
          src={own('twin')}
          twin={true}
        />

        <Scenario
          resolver={resolver}
          title="The controls built in"
          note="controls={true}. Move the pointer over the picture and the bar comes up; take it away and it goes. Tab into it and it stays, because a control you cannot see is a control you cannot use. Play and pause, a scrubber, the elapsed and total time, a mute and a level, and fullscreen. It is Button, Slider and Icon driven through the public transport, which is why an application that wants a different bar can build one."
          src={own('controls')}
          controls={true}
          sound={true}
          autoplay={false}
        />

        <Scenario
          resolver={resolver}
          title="The controls, pinned and trimmed"
          note="controls={{ alwaysVisible: true, time: false, fullscreen: false }}. The bar stays up and two of its parts are gone. Nothing here is a special case: a part that is off is a part that was not built."
          src={own('trimmed')}
          controls={{ alwaysVisible: true, time: false, fullscreen: false }}
          autoplay={false}
        />

        <PlayerCard cues={cues} />
        <text color="textMuted" fontSize={11}>
          {captionNote}
        </text>

        <Scenario
          resolver={resolver}
          title="A source that is not a video"
          note="The promise rejects, no surface ever reaches the node, and the box keeps its placeholder tint. Read the message: this dev server answers every unknown path with its index page, so what failed is not the fetch but the demuxer, looking at HTML. That distinction is the whole reason the errors here name what they found."
          src="/video/nothing-here.mp4"
        />

        <box height={700} flexShrink={0} x="center" y="center">
          <text color="textMuted" fontSize={12} textWrap="word">
            Deliberate empty space. The card below has not been decoding while you read the page: a clip scrolled out of
            the viewport stops, and starts again where it stopped rather than reloading.
          </text>
        </box>

        <Scenario
          resolver={resolver}
          title="Off screen until now"
          note="Its frame counter starts near zero however long you took to scroll here, because nothing was decoded while it was out of view. Scroll away and back: it resumes rather than restarting."
          src="/video/clip-moov-last.mp4?offscreen"
        />
      </column>
    </scrollview>
  );
}
