import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import {
  Column,
  parseWebVtt,
  type UiChild,
  type UiVideoSurface,
  type VideoPlayback,
  type VideoResolver
} from 'gesso-core';

import { Captions, clockTime, VideoPlayer } from './VideoPlayer';

/**
 * The player, which is a composition and is tested as one: what it
 * presses, what it reads out, and what it says to an assistive
 * technology. The clip underneath it is `Video`'s subject and
 * `Media.spec` has it.
 */

class FakePlayback implements VideoPlayback {
  readonly surface: UiVideoSurface = { frame: null, version: 0, width: 4, height: 4 };
  readonly width = 4;
  readonly height = 4;
  readonly duration = 90;
  readonly frameDurationMs = 100;
  positionMs = 0;

  present(positionMs: number): boolean {
    this.positionMs = positionMs;
    return true;
  }

  onError(): () => void {
    return () => {};
  }
}

function mountPlayer(root: UiChild) {
  const resolver: VideoResolver = {
    resolve: () => Promise.resolve(new FakePlayback()),
    release: () => {},
    dispose: () => {}
  };
  return renderTest(root, { media: { videoResolver: resolver } });
}

const TRACK = parseWebVtt(`WEBVTT

00:00.000 --> 00:02.000
The first thing said.

00:02.000 --> 00:04.000
And the second.
`).cues;

describe('VideoPlayer', () => {
  it('starts paused, whatever Video would have done', async () => {
    const mounted = mountPlayer(
      Column({}, createComponent(VideoPlayer, { src: 'clip.mp4', alt: 'A clip', width: 320, height: 200 }))
    );
    await mounted.settle();

    // A clip with a play button on it is content someone chose to
    // watch. `Video` autoplays because it is usually a background;
    // this does not, because it is not.
    expect(mounted.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('presses play and pause on the same button', async () => {
    const mounted = mountPlayer(
      Column({}, createComponent(VideoPlayer, { src: 'clip.mp4', alt: 'A clip', width: 320, height: 200 }))
    );
    await mounted.settle();

    mounted.fireEvent.click(mounted.getByRole('button', { name: 'Play' }));
    await mounted.settle();
    expect(mounted.getByRole('button', { name: 'Pause' })).toBeTruthy();

    mounted.fireEvent.click(mounted.getByRole('button', { name: 'Pause' }));
    await mounted.settle();
    expect(mounted.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('gives the seek bar the clip it is seeking over', async () => {
    const mounted = mountPlayer(
      Column({}, createComponent(VideoPlayer, { src: 'clip.mp4', alt: 'A clip', width: 320, height: 200 }))
    );
    await mounted.settle();

    const slider = mounted.getByRole('slider', { name: 'Seek' });
    const semantics = mounted.getSemantics(slider);
    // The clip is ninety seconds, so the bar runs to ninety rather
    // than to a percentage of something.
    expect(semantics.valueMax).toBe(90);
    expect(semantics.valueMin).toBe(0);
  });

  it('keeps the transport for an application that wants its own controls', async () => {
    let seen = null as { seek(s: number): void; position: number } | null;
    const mounted = mountPlayer(
      Column(
        {},
        createComponent(VideoPlayer, {
          src: 'clip.mp4',
          alt: 'A clip',
          width: 320,
          height: 200,
          onTransport: (t: { seek(s: number): void; position: number }) => (seen = t)
        })
      )
    );
    await mounted.settle();

    expect(seen).not.toBeNull();
    seen!.seek(30);
    expect(seen!.position).toBe(30);
  });
});

describe('Captions', () => {
  it('shows the cue that is due', async () => {
    const mounted = renderTest(Column({}, createComponent(Captions, { cues: TRACK, position: 1 })));
    await mounted.settle();
    expect(mounted.getByText('The first thing said.')).toBeTruthy();
  });

  it('shows nothing at all between cues', async () => {
    const gapped = parseWebVtt('WEBVTT\n\n00:00.000 --> 00:01.000\nA\n\n00:05.000 --> 00:06.000\nB\n').cues;
    const mounted = renderTest(Column({}, createComponent(Captions, { cues: gapped, position: 3 })));
    await mounted.settle();

    // An empty plate under a video is a caption track that looks
    // broken, so the whole box goes rather than just the words.
    expect(mounted.queryByText('A')).toBeNull();
  });
});

describe('clockTime', () => {
  it('reads seconds as a clock', () => {
    expect(clockTime(0)).toBe('0:00');
    expect(clockTime(9)).toBe('0:09');
    expect(clockTime(75)).toBe('1:15');
  });

  it('grows an hours field only once there is an hour', () => {
    expect(clockTime(3599)).toBe('59:59');
    expect(clockTime(3600)).toBe('1:00:00');
    expect(clockTime(3661)).toBe('1:01:01');
  });

  it('floors rather than rounds', () => {
    // Rounding would show a clip's own length a second before it ends.
    expect(clockTime(59.9)).toBe('0:59');
  });

  it('answers something sane for a duration that is not known yet', () => {
    expect(clockTime(Number.NaN)).toBe('0:00');
    expect(clockTime(-5)).toBe('0:00');
  });
});
