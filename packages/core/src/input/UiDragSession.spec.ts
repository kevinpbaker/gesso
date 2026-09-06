import { describe, expect, it, vi } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import type { LayoutBox } from '../layout/LayoutTypes';
import { InputTestHarness } from './UiInputTestUtils';
import { dragSessionFor, EXTERNAL_FILES, UiDragSession, type UiDragPayload, type UiDropZone } from './UiDragSession';

/** A zone at a fixed box, recording what it was told. */
function zone(
  node: UiNode,
  box: LayoutBox,
  accepts: (payload: UiDragPayload) => boolean = () => true
): UiDropZone & { events: string[] } {
  const events: string[] = [];
  return {
    events,
    node,
    boxOf: () => box,
    accepts,
    enter: () => events.push('enter'),
    over: () => events.push('over'),
    leave: () => events.push('leave'),
    drop: () => {
      events.push('drop');
      return 'move';
    }
  };
}

/** A tree deep enough to tell an outer zone from an inner one. */
function tree(): { h: InputTestHarness; list: UiNode; row: UiNode; other: UiNode } {
  const h = new InputTestHarness();
  const list = h.node('list', UiNodeType.Column, { width: 200, height: 200 });
  const row = h.node('row', UiNodeType.Row, { width: 200, height: 40 });
  const other = h.node('other', UiNodeType.Column, { width: 200, height: 100 });
  h.add(list, row);
  h.add(h.root, list, other);
  h.layoutTree();
  return { h, list, row, other };
}

const CARD: UiDragPayload = { type: 'board/card', data: { id: 'c1' } };

describe('UiDragSession', () => {
  it('tells a zone when the drag enters, moves inside it and is let go', () => {
    const { list } = tree();
    const session = new UiDragSession();
    const target = zone(list, { x: 0, y: 0, width: 100, height: 100 });
    session.addZone(target);

    session.begin(CARD, 10, 10, null);
    session.move(20, 20);
    const result = session.end();

    expect(target.events).toEqual(['enter', 'over', 'drop', 'leave']);
    expect(result).toEqual({ node: list, effect: 'move' });
  });

  it('reports nothing when the drag is let go over empty space', () => {
    const { list } = tree();
    const session = new UiDragSession();
    const target = zone(list, { x: 0, y: 0, width: 100, height: 100 });
    session.addZone(target);

    session.begin(CARD, 500, 500, null);
    const result = session.end();

    expect(result).toBeNull();
    expect(target.events).toEqual([]);
  });

  it('leaves the zone the drag crosses out of before entering the next', () => {
    const { list, other } = tree();
    const session = new UiDragSession();
    const left = zone(list, { x: 0, y: 0, width: 100, height: 100 });
    const right = zone(other, { x: 100, y: 0, width: 100, height: 100 });
    session.addZone(left);
    session.addZone(right);

    session.begin(CARD, 10, 10, null);
    session.move(150, 10);

    expect(left.events).toEqual(['enter', 'leave']);
    expect(right.events).toEqual(['enter']);
  });

  it('passes over a zone that will not take the payload rather than blocking', () => {
    const { list, other } = tree();
    const session = new UiDragSession();
    const refusing = zone(other, { x: 0, y: 0, width: 100, height: 100 }, payload => payload.type === 'other');
    const accepting = zone(list, { x: 0, y: 0, width: 200, height: 200 });
    session.addZone(refusing);
    session.addZone(accepting);

    session.begin(CARD, 10, 10, null);

    expect(refusing.events).toEqual([]);
    expect(accepting.events).toEqual(['enter']);
    expect(session.overNode).toBe(list);
  });

  it('gives the drop to the deeper of two zones that both contain the point', () => {
    const { list, row } = tree();
    const session = new UiDragSession();
    const outer = zone(list, { x: 0, y: 0, width: 200, height: 200 });
    const inner = zone(row, { x: 0, y: 0, width: 200, height: 40 });
    session.addZone(outer);
    session.addZone(inner);

    session.begin(CARD, 10, 10, null);

    expect(session.overNode).toBe(row);
    expect(outer.events).toEqual([]);
  });

  it('takes a zone out of consideration once it is unregistered', () => {
    const { list } = tree();
    const session = new UiDragSession();
    const target = zone(list, { x: 0, y: 0, width: 100, height: 100 });
    const remove = session.addZone(target);

    remove();
    session.begin(CARD, 10, 10, null);

    expect(session.accepted).toBe(false);
    expect(session.end()).toBeNull();
  });

  it('cancels without dropping', () => {
    const { list } = tree();
    const session = new UiDragSession();
    const target = zone(list, { x: 0, y: 0, width: 100, height: 100 });
    session.addZone(target);

    session.begin(CARD, 10, 10, null);
    session.cancel();

    expect(target.events).toEqual(['enter', 'leave']);
    expect(session.state).toBeNull();
  });

  it('is one session per graph, and two graphs cannot see each other', () => {
    const { h, row } = tree();
    const other = new InputTestHarness();

    expect(dragSessionFor(row)).toBe(dragSessionFor(h.root));
    expect(dragSessionFor(other.root)).not.toBe(dragSessionFor(h.root));
  });

  describe('files dragged in from the OS', () => {
    const FILES = [{ name: 'track.mp3', mediaType: 'audio/mpeg', size: 12, lastModified: 0 }];

    it('arrives as an ordinary drag a zone cannot tell apart', () => {
      const { list } = tree();
      const session = new UiDragSession();
      const seen: UiDragPayload[] = [];
      const target: UiDropZone = {
        node: list,
        boxOf: () => ({ x: 0, y: 0, width: 200, height: 200 }),
        accepts: payload => payload.type === EXTERNAL_FILES,
        enter: state => seen.push(state.payload),
        over: () => {},
        leave: () => {},
        drop: () => 'copy'
      };
      session.addZone(target);

      session.applyFileDrop({ type: 'fileDrop', phase: 'enter', x: 10, y: 10, files: FILES });
      expect(seen).toHaveLength(1);
      expect(seen[0].data).toBe(FILES);
      expect(session.state?.external).toBe(true);

      const result = session.applyFileDrop({ type: 'fileDrop', phase: 'drop', x: 12, y: 12, files: FILES });
      expect(result).toEqual({ node: list, effect: 'copy' });
    });

    it('drops the drag when the pointer leaves the window', () => {
      const { list } = tree();
      const session = new UiDragSession();
      const leave = vi.fn();
      session.addZone({
        node: list,
        boxOf: () => ({ x: 0, y: 0, width: 200, height: 200 }),
        accepts: () => true,
        enter: () => {},
        over: () => {},
        leave,
        drop: () => 'move'
      });

      session.applyFileDrop({ type: 'fileDrop', phase: 'enter', x: 10, y: 10, files: FILES });
      session.applyFileDrop({ type: 'fileDrop', phase: 'leave', x: 10, y: 10, files: FILES });

      expect(leave).toHaveBeenCalledTimes(1);
      expect(session.state).toBeNull();
    });

    it('handles a drop that never announced itself first', () => {
      const { list } = tree();
      const session = new UiDragSession();
      session.addZone(zone(list, { x: 0, y: 0, width: 200, height: 200 }));

      const result = session.applyFileDrop({ type: 'fileDrop', phase: 'drop', x: 10, y: 10, files: FILES });

      expect(result?.node).toBe(list);
    });
  });
});
