import { map } from 'rxjs/operators';

import { percent, videoSource, type UiVideoSurface, type VideoPlayback, type VideoResolver } from 'gesso-core';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

import { isStill } from '../still';
import { HOVER_CONTROL } from './interaction';

/** The clip is generated, so the name is not a URL. Any string a resolver understands will do. */
export const SOURCE = 'generated:sweep';

export const FRAME_COUNT = 24;
/** Twelve frames a second, which is what the playback reports as its own rate. */
export const FRAME_MS = 1000 / 12;
export const WIDTH = 320;
export const HEIGHT = 180;

/** Mutable from in here, readonly to the renderers, which is what `UiVideoSurface` is for. */
class GeneratedSurface implements UiVideoSurface {
  frame: ImageBitmap | null = null;
  version = 0;
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

/**
 * Twenty-four frames drawn with `OffscreenCanvas`, in whichever thread
 * the runtime lives in.
 *
 * A browser has one; node does not, and there the array comes back
 * empty and the surface carries a null frame. Everything else about the
 * playback still works, which is what lets the spec beside this file
 * measure the pacing without a decoder.
 */
async function drawFrames(): Promise<ImageBitmap[]> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
    return [];
  }
  const frames: ImageBitmap[] = [];
  for (let index = 0; index < FRAME_COUNT; index++) {
    const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      return frames;
    }
    const turn = index / FRAME_COUNT;
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#1d4ed8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(
      WIDTH / 2 + Math.cos(turn * Math.PI * 2) * 92,
      HEIGHT / 2 + Math.sin(turn * Math.PI * 2) * 46,
      18,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, HEIGHT - 8, WIDTH * ((index + 1) / FRAME_COUNT), 8);
    ctx.font = '600 20px sans-serif';
    ctx.fillText(`frame ${index + 1} / ${FRAME_COUNT}`, 14, 32);
    frames.push(await createImageBitmap(canvas));
  }
  return frames;
}

// #region playback
/**
 * A playback that draws its own pictures.
 *
 * `VideoPlayback` is an interface, and this implements the whole of it:
 * a surface whose identity never changes, a version that counts frames,
 * a duration, the rate the picture can change at, where the playback
 * has got to, and `present`, which shows the frame due at a position
 * and says whether that changed anything.
 *
 * `present` is a pure function of the position: nothing in here runs on
 * a clock. Whoever holds time decides when a frame is due, which in an
 * application is the animation driver, through `videoSource`.
 */
class GeneratedPlayback implements VideoPlayback {
  readonly surface = new GeneratedSurface(WIDTH, HEIGHT);
  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly duration = (FRAME_COUNT * FRAME_MS) / 1000;
  readonly frameDurationMs = FRAME_MS;

  private frames: ImageBitmap[] = [];
  private index = -1;
  private position = 0;

  get positionMs(): number {
    return this.position;
  }

  present(positionMs: number): boolean {
    this.position = Math.max(0, positionMs);
    const next = Math.floor(this.position / FRAME_MS) % FRAME_COUNT;
    if (next === this.index) {
      // The position moved inside one frame's worth of time, so there
      // is nothing new to draw and nothing to ask a frame for.
      return false;
    }
    this.index = next;
    this.surface.frame = this.frames[next] ?? null;
    this.surface.version++;
    return true;
  }

  onError(_listener: (error: unknown) => void): () => void {
    return () => {};
  }

  async load(): Promise<void> {
    this.frames = await drawFrames();
  }
}

/**
 * A resolver over that playback, with `VideoResolver`'s shape.
 *
 * One playback per source, handed to everyone who asks: that is what
 * makes two elements on one clip watch one decode, and it is the same
 * guarantee `DefaultVideoResolver` makes for a file.
 */
export class GeneratedVideoResolver implements VideoResolver {
  /** How many elements have asked, and how many have let go. */
  resolves = 0;
  releases = 0;

  private entry: Promise<VideoPlayback> | null = null;
  private started: GeneratedPlayback | null = null;

  resolve(_source: string): Promise<VideoPlayback> {
    this.resolves++;
    if (this.entry === null) {
      const playback = new GeneratedPlayback();
      this.started = playback;
      this.entry = playback.load().then(() => playback);
    }
    return this.entry;
  }

  release(_source: string): void {
    this.releases++;
  }

  dispose(): void {
    this.entry = null;
    this.started = null;
  }

  /** The playback itself, for the spec: an app has no reason to reach for it. */
  get playback(): VideoPlayback | null {
    return this.started;
  }
}
// #endregion playback

// #region views
/**
 * Two views of one playback, and a button that takes the second away.
 *
 * Both boxes carry a `videoSource` on the same source, so the resolver
 * hands both the same playback and both draw the same surface. That is
 * why the small one is never a frame behind: there is one picture, and
 * `objectFit` is all that differs between them.
 *
 * Removing the second view releases its hold. The modifier registers
 * the release with `host.own`, so it runs inside `removeSubtree` rather
 * than waiting for anything to notice, and the view that is left keeps
 * playing.
 */
export function MediaVideo(inputs: Inputs<{ resolver?: VideoResolver }>, _ctx: ComponentContext) {
  const resolver = inputs.resolver.value ?? new GeneratedVideoResolver();
  const status = internalState<'loading' | 'playing' | 'failed'>('loading');
  const second = internalState(true);

  // `autoplay` is left out of an ordinary app, and the clip plays.
  // `isStill` is this site's screenshot flag: not autoplaying is what
  // holds a video on its first frame, and both views take the same
  // answer because they share one playback.
  const playing = !isStill();

  const main = videoSource({
    resolver,
    source: SOURCE,
    loop: true,
    autoplay: playing,
    onState: next => (status.value = next)
  });
  const thumbnail = videoSource({ resolver, source: SOURCE, loop: true, autoplay: playing });

  return (
    <column gap={14} x="center" y="center" width={percent(100)} height={percent(100)} padding={20}>
      <row gap={14} y="center">
        <box
          width={280}
          height={158}
          borderRadius={10}
          objectFit="cover"
          backgroundColor="controlBackground"
          modifiers={[main]}
          role="image"
          label="A generated clip, playing"
        />
        {second.pipe(
          map(shown =>
            shown
              ? [
                  <box
                    key="thumbnail"
                    width={110}
                    height={158}
                    borderRadius={10}
                    objectFit="contain"
                    backgroundColor="controlBackground"
                    modifiers={[thumbnail]}
                  />
                ]
              : []
          )
        )}
      </row>

      <row gap={12} y="center">
        <button
          label="Add or remove the second view"
          onClick={() => (second.value = !second.value)}
          padding={8}
          borderRadius={6}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          cursor="pointer"
          modifiers={[HOVER_CONTROL]}>
          <text
            text={second.pipe(map(shown => (shown ? 'Remove the second view' : 'Add a second view')))}
            fontSize={12}
            color="text"
          />
        </button>
        <text text={status.pipe(map(state => `state: ${state}`))} fontSize={12} color="textMuted" />
      </row>
    </column>
  );
}
// #endregion views
