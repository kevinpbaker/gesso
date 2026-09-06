import { percent, type UiVideoSurface, type VideoPlayback, type VideoResolver } from '@gesso/core';
import { Video } from '@gesso/components';
import type { ComponentContext, Inputs } from '@gesso/framework';

import { isStill } from '../still';

// #region playback
/** The surface as its producer sees it: the same object, a new frame. */
interface MutableSurface {
  frame: ImageBitmap | null;
  version: number;
  readonly width: number;
  readonly height: number;
}

const FRAME_COUNT = 24;
const FRAME_MS = 100;

/**
 * A clip drawn on the spot, so this page fetches nothing.
 *
 * It is a real `VideoPlayback` and not a mock: one surface whose
 * identity never changes, a `version` that counts frames, and a
 * `present` that is a pure function of a position. That is the whole
 * contract a decoder has to meet, which is why an app can replace the
 * MP4 one with a screen capture, a generator, or anything else that
 * can produce a frame.
 *
 * The previous frame is closed rather than dropped, because a decoded
 * frame holds pixels and often holds them on the GPU. Under a spec
 * there is no `OffscreenCanvas`, so no frame is drawn and `frame`
 * stays null; the version still counts, which is what makes "the
 * animation driver is what moves a video on" measurable without a
 * browser.
 */
class GeneratedPlayback implements VideoPlayback {
  readonly width = 240;
  readonly height = 135;
  readonly duration = (FRAME_COUNT * FRAME_MS) / 1000;
  readonly frameDurationMs = FRAME_MS;
  positionMs = 0;

  private readonly canvas: OffscreenCanvas | null =
    typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(240, 135);
  private readonly mutable: MutableSurface = { frame: null, version: 0, width: 240, height: 135 };
  private index = -1;

  constructor(private readonly hue: number) {}

  get surface(): UiVideoSurface {
    return this.mutable;
  }

  present(positionMs: number): boolean {
    this.positionMs = positionMs;
    const next = Math.floor(positionMs / FRAME_MS) % FRAME_COUNT;
    if (next === this.index) {
      // The picture did not change, so nothing asks for a paint. A
      // clip at ten frames a second inside an app at sixty paints ten
      // times a second.
      return false;
    }
    this.index = next;
    this.mutable.frame?.close();
    this.mutable.frame = this.draw(next);
    this.mutable.version++;
    return true;
  }

  onError(_listener: (error: unknown) => void): () => void {
    return () => {};
  }

  private draw(index: number): ImageBitmap | null {
    const context = this.canvas?.getContext('2d') ?? null;
    if (this.canvas === null || context === null) {
      return null;
    }
    const turn = (index / FRAME_COUNT) * Math.PI * 2;
    context.fillStyle = `hsl(${this.hue} 45% 22%)`;
    context.fillRect(0, 0, this.width, this.height);
    context.fillStyle = `hsl(${this.hue} 70% 60%)`;
    const x = (this.width / 2) * (1 + Math.sin(turn)) - 24;
    context.fillRect(x, this.height / 2 - 24, 48, 48);
    context.fillStyle = 'rgba(255, 255, 255, 0.75)';
    context.fillRect(0, this.height - 8, (this.width * (index + 1)) / FRAME_COUNT, 8);
    return this.canvas.transferToImageBitmap();
  }
}

/**
 * One playback per source, shared by everything that names it.
 *
 * `DefaultVideoResolver` has this shape and adds the fetch, the
 * demuxer and `VideoDecoder`. The reference counting is the part worth
 * copying: two `Video`s pointed at one source watch one playback, and
 * an arriving screen picks up the position a departing one had reached
 * rather than starting the clip again.
 */
export class ClipResolver implements VideoResolver {
  private readonly clips = new Map<string, GeneratedPlayback>();

  resolve(source: string): Promise<VideoPlayback> {
    if (source === 'missing.clip') {
      // What a fetch that failed, a fragmented MP4 and a thread with no
      // `VideoDecoder` all look like from here: the promise rejects and
      // no surface ever reaches the node.
      return Promise.reject(new Error(`'${source}' is not there.`));
    }
    const existing = this.clips.get(source);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    const clip = new GeneratedPlayback(source === 'still.clip' ? 32 : 196);
    this.clips.set(source, clip);
    return Promise.resolve(clip);
  }

  release(_source: string): void {
    // Kept, as the default resolver keeps a released playback: the
    // usual reason a source loses its last holder is a navigation that
    // is about to give it another.
  }

  dispose(): void {
    this.clips.clear();
  }
}
// #endregion playback

// #region video
/**
 * Three videos of the same shape: one playing, one held still, one
 * that never resolves.
 *
 * `Video` takes the props `Image` takes, plus `loop` and `autoplay`,
 * and that is the whole control surface: there is no play method and
 * nothing to call. The left one loops, so its position is a repeating
 * tween over the clip's length and its frames arrive on the `ticks`
 * phase like any other animation. The right one was given
 * `autoplay={false}`, so it resolves the clip, presents the frame at
 * its position, and stops there.
 *
 * The third names a source the resolver refuses, which is what a fetch
 * that failed or a thread without `VideoDecoder` looks like from a
 * component's side. It keeps `placeholderColor`, the same prop and the
 * same default an `Image` has, and that tinted box is the whole of what
 * a clip that will not play looks like.
 *
 * The resolver above is not installed here: the worker entry that
 * renders this page declares it with `renderRoot(...).useMedia(...)`,
 * so it is in place before either `Video` is built and asks for its
 * playback. An application that plays an MP4 declares nothing: the
 * default resolver fetches and decodes it.
 */
export function Player(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <column gap={16} padding={20} width={percent(100)} height={percent(100)}>
      <row gap={16}>
        <column gap={6}>
          <Video
            src="loop.clip"
            alt="A generated clip, playing"
            width={200}
            height={112}
            borderRadius={8}
            // Ordinarily this prop is not written at all, and the clip
            // plays. `isStill` is this site's screenshot flag, and a
            // video that does not autoplay is a video holding its first
            // frame, which is what a gate can photograph.
            autoplay={!isStill()}
          />
          <text text="loop and autoplay: the defaults" fontSize={12} color="textMuted" />
        </column>
        <column gap={6}>
          <Video
            src="still.clip"
            alt="A generated clip, held on one frame"
            width={200}
            height={112}
            borderRadius={8}
            objectFit="contain"
            autoplay={false}
          />
          <text text="autoplay={false}: one frame, and no tween" fontSize={12} color="textMuted" />
        </column>
      </row>
      <row gap={10} y="center">
        <Video
          src="missing.clip"
          alt="A clip that failed"
          placeholderColor="danger"
          width={112}
          height={72}
          borderRadius={8}
        />
        <column gap={4}>
          <text text="A source the resolver refuses keeps the placeholder tint, here danger." fontSize={12} />
          <text text="There is no error slot: draw your own beside it." fontSize={12} color="textMuted" />
        </column>
      </row>
      <text
        text="None of the three clips is a file. They are painted frame by frame by a VideoResolver this example supplies, and the third source is one it refuses."
        fontSize={12}
      />
    </column>
  );
}
// #endregion video
