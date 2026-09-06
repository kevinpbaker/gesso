import { describe, expect, it } from 'vitest';

import { AudioSink, type AudioElementLike } from './AudioSink';
import type { AudioSample } from './AudioService';

/**
 * The second element, and what makes a track change gapless.
 *
 * Whether the room hears a gap is not something a spec can say; what
 * these pin is the mechanism underneath it, that the bytes are fetched
 * once and that the element which was quietly buffering becomes the one
 * that plays.
 */
describe('AudioSink preload', () => {
  class FakeElement extends EventTarget implements AudioElementLike {
    src = '';
    currentTime = 0;
    volume = 1;
    preload = '';
    duration = 100;
    paused = true;
    ended = false;
    buffered = { length: 0, start: () => 0, end: () => 0 };
    error = null;
    loads = 0;
    plays = 0;
    play(): Promise<void> {
      this.plays += 1;
      this.paused = false;
      return Promise.resolve();
    }
    pause(): void {
      this.paused = true;
    }
    load(): void {
      this.loads += 1;
    }
  }

  const build = (): { sink: AudioSink; elements: FakeElement[]; samples: AudioSample[] } => {
    const elements: FakeElement[] = [];
    const samples: AudioSample[] = [];
    const sink = new AudioSink(
      { sample: sample => samples.push(sample), action: () => {} },
      {
        createElement: () => {
          const element = new FakeElement();
          elements.push(element);
          return element;
        },
        mediaSession: null
      }
    );
    return { sink, elements, samples };
  };

  it('makes two elements, and only one of them plays', () => {
    const { sink, elements } = build();
    sink.handle({ type: 'load', src: 'first.mp3', autoplay: true });
    expect(elements).toHaveLength(2);
    expect(elements[0]!.src).toBe('first.mp3');
    expect(elements[1]!.src).toBe('');
  });

  it('buffers the next source on the spare without touching playback', () => {
    const { sink, elements } = build();
    sink.handle({ type: 'load', src: 'first.mp3', autoplay: true });
    sink.handle({ type: 'preload', src: 'second.mp3' });

    expect(elements[0]!.src).toBe('first.mp3');
    expect(elements[0]!.paused).toBe(false);
    expect(elements[1]!.src).toBe('second.mp3');
    expect(elements[1]!.loads).toBe(1);
    // The spare never plays on its own.
    expect(elements[1]!.plays).toBe(0);
  });

  it('swaps to the buffered element rather than fetching it again', () => {
    const { sink, elements } = build();
    sink.handle({ type: 'load', src: 'first.mp3', autoplay: true });
    sink.handle({ type: 'preload', src: 'second.mp3' });
    const loadsBefore = elements[1]!.loads;

    sink.handle({ type: 'load', src: 'second.mp3', autoplay: true });

    // The element that was buffering is now the one playing, and it was
    // not asked to load a second time: that is the whole of gapless.
    expect(elements[1]!.loads).toBe(loadsBefore);
    expect(elements[1]!.plays).toBe(1);
    // The one that finished is emptied so it holds no bytes.
    expect(elements[0]!.src).toBe('');
    expect(elements[0]!.paused).toBe(true);
  });

  it('loads normally when what is asked for is not what was prepared', () => {
    const { sink, elements } = build();
    sink.handle({ type: 'load', src: 'first.mp3', autoplay: true });
    sink.handle({ type: 'preload', src: 'second.mp3' });

    sink.handle({ type: 'load', src: 'elsewhere.mp3', autoplay: true });

    // Still the original element, now holding the new source.
    expect(elements[0]!.src).toBe('elsewhere.mp3');
    expect(elements[1]!.src).toBe('second.mp3');
  });

  it('carries the volume across, so a swap is not a jump in loudness', () => {
    const { sink, elements } = build();
    sink.handle({ type: 'load', src: 'first.mp3', autoplay: true });
    sink.handle({ type: 'volume', level: 0.25 });
    sink.handle({ type: 'preload', src: 'second.mp3' });

    expect(elements[1]!.volume).toBe(0.25);
  });

  it('asks for the same source only once', () => {
    const { sink, elements } = build();
    sink.handle({ type: 'load', src: 'first.mp3', autoplay: true });
    sink.handle({ type: 'preload', src: 'second.mp3' });
    sink.handle({ type: 'preload', src: 'second.mp3' });
    // The queue republishes the next url whenever it moves, so this
    // arrives repeatedly and must not restart the fetch.
    expect(elements[1]!.loads).toBe(1);
  });

  it('clears the spare when nothing follows', () => {
    const { sink, elements } = build();
    sink.handle({ type: 'load', src: 'first.mp3', autoplay: true });
    sink.handle({ type: 'preload', src: 'second.mp3' });
    sink.handle({ type: 'preload', src: '' });

    expect(elements[1]!.src).toBe('');
  });

  it('reports one timeline: the spare never emits a sample', () => {
    const { sink, elements, samples } = build();
    sink.handle({ type: 'load', src: 'first.mp3', autoplay: true });
    sink.handle({ type: 'preload', src: 'second.mp3' });
    const before = samples.length;

    // The buffering element firing its own events must not reach the
    // application, or the screen would see two tracks at once.
    elements[1]!.dispatchEvent(new Event('canplay'));
    elements[1]!.dispatchEvent(new Event('durationchange'));

    expect(samples).toHaveLength(before);
  });

  it('after a swap, the element now playing is the one being listened to', () => {
    const { sink, elements, samples } = build();
    sink.handle({ type: 'load', src: 'first.mp3', autoplay: true });
    sink.handle({ type: 'preload', src: 'second.mp3' });
    sink.handle({ type: 'load', src: 'second.mp3', autoplay: true });
    const before = samples.length;

    elements[1]!.dispatchEvent(new Event('playing'));
    expect(samples.length).toBeGreaterThan(before);

    // And the one that stepped aside is no longer heard.
    const after = samples.length;
    elements[0]!.dispatchEvent(new Event('playing'));
    expect(samples).toHaveLength(after);
  });
});
