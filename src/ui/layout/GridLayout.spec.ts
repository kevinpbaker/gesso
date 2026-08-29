import { describe, expect, it } from 'vitest';

import { AlignContent } from './Alignment';
import { placeGridItems, sizeGridTracks } from './GridLayout';
import { auto, fr, minmax, percent } from './UiLength';

describe('placeGridItems', () => {
  const item = (column?: number, row?: number, columnSpan = 1, rowSpan = 1) => ({
    item: `${column ?? '-'}/${row ?? '-'}`,
    column,
    row,
    columnSpan,
    rowSpan
  });

  it('fills rows left to right and grows implicit rows', () => {
    const result = placeGridItems([item(), item(), item(), item(), item()], 2, 0, 'row');
    expect(result.columnCount).toBe(2);
    expect(result.rowCount).toBe(3);
    expect(result.placements.map(p => [p.columnStart, p.rowStart])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2]
    ]);
  });

  it('fills columns top to bottom in column flow', () => {
    const result = placeGridItems([item(), item(), item()], 0, 2, 'column');
    expect(result.placements.map(p => [p.columnStart, p.rowStart])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0]
    ]);
    expect(result.columnCount).toBe(2);
  });

  it('honours explicit placement and flows the rest around it', () => {
    const result = placeGridItems([item(), item(2, 1), item(), item()], 2, 0, 'row');
    expect(result.placements.map(p => [p.columnStart, p.rowStart])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1]
    ]);
  });

  it('spans and wraps a spanning item that does not fit the current row', () => {
    const result = placeGridItems([item(), item(undefined, undefined, 2)], 2, 0, 'row');
    expect(result.placements[1]).toMatchObject({ columnStart: 0, columnEnd: 2, rowStart: 1 });
  });

  it('locks an item to its row and finds the first free column', () => {
    const result = placeGridItems([item(1, 2), item(undefined, 2)], 2, 0, 'row');
    expect(result.placements[1]).toMatchObject({ columnStart: 1, rowStart: 1 });
  });
});

describe('sizeGridTracks', () => {
  const noItems: { start: number; end: number; contribution: { min: number; max: number } }[] = [];

  it('sizes fixed tracks and lays them out with gaps', () => {
    const result = sizeGridTracks({
      sizes: [100, 50],
      available: undefined,
      gap: 10,
      distribution: AlignContent.Stretch,
      items: noItems
    });
    expect(result.tracks.map(t => [t.offset, t.size])).toEqual([
      [0, 100],
      [110, 50]
    ]);
    expect(result.total).toBe(160);
  });

  it('shares definite space between fr tracks after fixed ones', () => {
    const result = sizeGridTracks({
      sizes: [100, fr(1), fr(3)],
      available: 300,
      gap: 0,
      distribution: AlignContent.Stretch,
      items: noItems
    });
    expect(result.tracks.map(t => t.size)).toEqual([100, 50, 150]);
  });

  it('gives auto tracks their content and stretches them into spare space', () => {
    const items = [{ start: 0, end: 1, contribution: { min: 40, max: 60 } }];
    const shrinkWrapped = sizeGridTracks({
      sizes: [auto],
      available: undefined,
      gap: 0,
      distribution: AlignContent.Stretch,
      items
    });
    expect(shrinkWrapped.tracks[0].size).toBe(60);
    const stretched = sizeGridTracks({
      sizes: [auto, 100],
      available: 300,
      gap: 0,
      distribution: AlignContent.Stretch,
      items
    });
    expect(stretched.tracks.map(t => t.size)).toEqual([200, 100]);
    const packed = sizeGridTracks({
      sizes: [auto, 100],
      available: 300,
      gap: 0,
      distribution: AlignContent.Start,
      items
    });
    expect(packed.tracks.map(t => t.size)).toEqual([60, 100]);
    // The min-content total keeps the item's minimum, not its maximum.
    expect(packed.minTotal).toBe(140);
  });

  it('respects minmax bounds and treats a flexible track whose base exceeds its share as fixed', () => {
    const result = sizeGridTracks({
      sizes: [minmax(50, 80), fr(1), fr(1)],
      available: 300,
      gap: 0,
      distribution: AlignContent.Stretch,
      items: [
        { start: 0, end: 1, contribution: { min: 200, max: 200 } },
        { start: 1, end: 2, contribution: { min: 150, max: 150 } }
      ]
    });
    // minmax clamps to 80; the fr track holding 150 keeps it; the other takes the rest.
    expect(result.tracks.map(t => Math.round(t.size))).toEqual([80, 150, 70]);
  });

  it('sizes fr tracks from content when the space is indefinite', () => {
    const result = sizeGridTracks({
      sizes: [fr(1), fr(2)],
      available: undefined,
      gap: 0,
      distribution: AlignContent.Stretch,
      items: [
        { start: 0, end: 1, contribution: { min: 30, max: 30 } },
        { start: 1, end: 2, contribution: { min: 40, max: 40 } }
      ]
    });
    // fr = max(30/1, 40/2) = 30 → 30 and 60.
    expect(result.tracks.map(t => t.size)).toEqual([30, 60]);
  });

  it('resolves percentages against a definite size', () => {
    const result = sizeGridTracks({
      sizes: [percent(25), fr(1)],
      available: 200,
      gap: 0,
      distribution: AlignContent.Stretch,
      items: noItems
    });
    expect(result.tracks.map(t => t.size)).toEqual([50, 150]);
  });

  it('distributes spare space between tracks for space-between', () => {
    const result = sizeGridTracks({
      sizes: [50, 50],
      available: 200,
      gap: 0,
      distribution: AlignContent.SpaceBetween,
      items: noItems
    });
    expect(result.tracks.map(t => t.offset)).toEqual([0, 150]);
  });

  it('spreads a spanning item over the intrinsic tracks it covers', () => {
    const result = sizeGridTracks({
      sizes: [auto, auto],
      available: undefined,
      gap: 10,
      distribution: AlignContent.Stretch,
      items: [{ start: 0, end: 2, contribution: { min: 90, max: 90 } }]
    });
    // 90 minus the 10 gap, split equally.
    expect(result.tracks.map(t => t.size)).toEqual([40, 40]);
  });
});
