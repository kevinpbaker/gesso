import { describe, expect, it } from 'vitest';

import { batch, computed } from './computed';
import { internalState } from './InternalState';

/** A hundred places and the computeds a document builds over them. */
function blocks() {
  const places = Array.from({ length: 100 }, (_, i) => internalState(i * 10));
  let runs = 0;
  const bottoms = computed(() => {
    runs++;
    return places.map(p => p.value + 5);
  });
  const lowest = computed(() => Math.max(...bottoms.value));
  const heard: number[] = [];
  const following = lowest.subscribe(value => heard.push(value));
  return { places, bottoms, lowest, heard, runs: () => runs, following };
}

describe('batch', () => {
  it('works out a computed once for every cell it follows changed together', () => {
    const doc = blocks();
    const before = doc.runs();
    batch(() => {
      for (const place of doc.places) place.value += 100;
    });

    expect(doc.runs() - before).toBe(1);
    expect(doc.lowest.value).toBe(990 + 100 + 5);
    // The follower heard the first value and the one after the batch, not a hundred on the way.
    expect(doc.heard).toEqual([995, 1095]);
    doc.following.unsubscribe();
  });

  it('works out a computed over computeds once, however many of them changed', () => {
    const places = Array.from({ length: 100 }, (_, i) => internalState(i));
    const each = places.map(p => computed(() => ({ y: p.value })));
    let runs = 0;
    const all = computed(() => {
      runs++;
      return each.map(e => e.value.y);
    });
    const heard: number[][] = [];
    const following = all.subscribe(ys => heard.push(ys));
    const before = runs;
    batch(() => {
      for (const place of places) place.value += 1000;
    });

    expect(runs - before).toBe(1);
    expect(heard).toHaveLength(2);
    expect(heard[1]).toEqual(places.map(p => p.value));
    following.unsubscribe();
  });

  it('works out each change once without it, as before', () => {
    const doc = blocks();
    const before = doc.runs();
    for (const place of doc.places) place.value += 100;

    expect(doc.runs() - before).toBe(100);
    expect(doc.lowest.value).toBe(1095);
    doc.following.unsubscribe();
  });

  it('is never stale when read inside the batch', () => {
    const doc = blocks();
    batch(() => {
      doc.places[99]!.value = 5000;
      expect(doc.lowest.value).toBe(5005);
      doc.places[98]!.value = 6000;
      expect(doc.bottoms.value[98]).toBe(6005);
    });
    expect(doc.lowest.value).toBe(6005);
    doc.following.unsubscribe();
  });

  it('gives a written cell its value at once, and its own subscribers hear it at once', () => {
    const place = internalState(1);
    const twice = computed(() => place.value * 2);
    const heardPlace: number[] = [];
    const heardTwice: number[] = [];
    const a = place.subscribe(v => heardPlace.push(v));
    const b = twice.subscribe(v => heardTwice.push(v));
    batch(() => {
      place.value = 2;
      place.value = 3;
      expect(place.value).toBe(3);
      expect(heardPlace).toEqual([1, 2, 3]);
      expect(heardTwice).toEqual([2]);
    });
    expect(heardTwice).toEqual([2, 6]);
    a.unsubscribe();
    b.unsubscribe();
  });

  it('ends with the outermost batch, and ends when the work throws', () => {
    const doc = blocks();
    batch(() => {
      batch(() => {
        doc.places[0]!.value = 7000;
      });
      expect(doc.heard).toEqual([995]);
    });
    expect(doc.heard).toEqual([995, 7005]);

    expect(() =>
      batch(() => {
        doc.places[1]!.value = 8000;
        throw new Error('stopped');
      })
    ).toThrow('stopped');
    expect(doc.heard).toEqual([995, 7005, 8005]);
    doc.following.unsubscribe();
  });

  it('leaves alone a computed nobody follows any more by the end', () => {
    const place = internalState(1);
    let runs = 0;
    const twice = computed(() => {
      runs++;
      return place.value * 2;
    });
    const following = twice.subscribe(() => {});
    const before = runs;
    batch(() => {
      place.value = 2;
      following.unsubscribe();
    });
    expect(runs).toBe(before);
    // Read when asked, as any computed nobody follows.
    expect(twice.value).toBe(4);
  });
});
