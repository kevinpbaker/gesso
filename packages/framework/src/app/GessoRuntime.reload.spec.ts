import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Box, Column, ScrollView, Text, type UiElement, type UiNode } from '@gesso/core';
import { Component } from '../Component';
import { Define } from '../decorators';
import { createComponent } from '../createComponent';
import { internalState, type InternalState } from '../InternalState';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * `ROADMAP.md` F7's HMR item, as the runtime sees it.
 *
 * A component renders once, so nothing can push new code into a
 * mounted one. What a reload does is rebuild the tree while the
 * runtime, its services and its channel replicas carry on, and these
 * are the specs for exactly what that keeps and what it costs.
 */
/**
 * The live component's state cell, so a spec can change it and reload.
 *
 * The cell rather than the instance: what these specs need is
 * something to write to, and a component's own state is exactly what a
 * reload is supposed to keep or lose.
 */
let firstCardLabel: InternalState<string> | undefined;

@Define('first-card')
class FirstCard extends Component {
  readonly label = internalState('initial');

  override render(): UiElement {
    firstCardLabel = this.label;
    return Box({ width: 100, height: 20 }, Text({ text: this.label }));
  }
}

@Define('second-card')
class SecondCard extends Component {
  override render(): UiElement {
    return Box({ width: 200, height: 40 }, Text({ text: 'second' }));
  }
}

function texts(node: UiNode): string[] {
  const out: string[] = [];
  const walk = (current: UiNode): void => {
    const text = current.getProperty<string>('text');
    if (text !== undefined) {
      out.push(text);
    }
    for (let child = current.firstChild; child !== null; child = child.nextSibling) {
      walk(child);
    }
  };
  walk(node);
  return out;
}

describe('reload', () => {
  it('replaces the tree with the new definition', () => {
    const mounted = mountRuntime(Column({}, Text({ text: 'before' })));
    mounted.frame();

    mounted.runtime.reload(Column({}, Text({ text: 'after' })));
    mounted.frame();

    expect(texts(mounted.runtime.debugRoot())).toEqual(['after']);
  });

  it('keeps the layout root, so everything registered on it stays valid', () => {
    // Input routing, the focus scope stack and the touch scroller all
    // hold this node by reference. A reload that replaced it would
    // leave every one of them pointing at a detached tree.
    const mounted = mountRuntime(Column({}, Text({ text: 'before' })));
    mounted.frame();
    const before = mounted.runtime.layoutRoot();

    mounted.runtime.reload(Column({}, Text({ text: 'after' })));
    mounted.frame();

    expect(mounted.runtime.layoutRoot()).toBe(before);
  });

  it('keeps a component whose class did not change, and its state', () => {
    const mounted = mountRuntime(Column({}, createComponent(FirstCard)));
    mounted.frame();
    const host = mounted.runtime.debugRoot().firstChild;
    firstCardLabel!.value = 'typed by the person';
    mounted.frame();

    mounted.runtime.reload(Column({}, createComponent(FirstCard)));
    mounted.frame();

    // The same class object in the same slot: the host is reused, so
    // the node is the same one, nothing was remounted, and the state
    // the component was holding is still there. This is what makes a
    // reload of one module leave the rest of the screen alone.
    expect(mounted.runtime.debugRoot().firstChild).toBe(host);
    expect(texts(mounted.runtime.debugRoot())).toEqual(['typed by the person']);
  });

  it('remounts a component whose class is a different object', () => {
    const mounted = mountRuntime(Column({}, createComponent(FirstCard)));
    mounted.frame();

    mounted.runtime.reload(Column({}, createComponent(SecondCard)));
    mounted.frame();

    expect(texts(mounted.runtime.debugRoot())).toEqual(['second']);
  });

  it('keeps a scroll offset on a container that survived', () => {
    const app = () => Column({}, ScrollView({ height: 40 }, Box({ height: 200 })));
    const mounted = mountRuntime(app());
    mounted.frame();
    const scroller = mounted.runtime.debugRoot().firstChild!;
    scroller.setProperty('scrollY', 60);

    mounted.runtime.reload(app());
    mounted.frame();

    expect(mounted.runtime.debugRoot().firstChild?.getProperty('scrollY')).toBe(60);
  });

  it('binds the new tree to state the runtime was already holding', () => {
    // The point of the whole exercise: an application's data is not in
    // the tree, so a fresh tree binds to values that are already there
    // rather than to nothing.
    const value = new BehaviorSubject('kept');
    const mounted = mountRuntime(Column({}, Text({ text: value })));
    mounted.frame();

    mounted.runtime.reload(Column({}, Box({}, Text({ text: value }))));
    mounted.frame();

    expect(texts(mounted.runtime.debugRoot())).toEqual(['kept']);
  });

  it('lays the new tree out on the next frame', () => {
    const mounted = mountRuntime(Column({}, Box({ width: 10, height: 10 })));
    mounted.frame();

    mounted.runtime.reload(Column({}, Box({ width: 120, height: 44 })));
    mounted.frame();

    const box = mounted.runtime.debugLayoutBox(mounted.runtime.debugRoot().firstChild!);
    expect(box).toMatchObject({ width: 120, height: 44 });
  });

  it('drops the inspector’s hovered node rather than explaining a removed one', () => {
    const mounted = mountRuntime(Column({}, Box({ width: 10, height: 10 })));
    mounted.frame();
    mounted.runtime.setInspectorEnabled(true);
    mounted.runtime.inspector.setHovered(mounted.runtime.debugRoot().firstChild);

    mounted.runtime.reload(Column({}, Box({ width: 20, height: 20 })));

    expect(mounted.runtime.inspector.hoveredNode).toBeNull();
  });

  it('adopts a service the replaced module redefined, keeping its state', () => {
    // The defect this exists for: a service declared beside the root
    // is a new class object after a replacement, so a component that
    // injects it asks the registry for something it has never seen,
    // even though the old one is sitting in it.
    class Feed {
      samples = 0;
    }
    const Replacement = class {
      samples = 0;
    };
    Object.defineProperty(Replacement, 'name', { value: 'Feed' });

    const mounted = mountRuntime(Column({}, Text({ text: 'x' })));
    mounted.frame();
    mounted.runtime.services.register(Feed).samples = 12;

    mounted.runtime.reload(Column({}, Text({ text: 'y' })), [Replacement as unknown as new () => Feed]);
    mounted.frame();

    expect(mounted.runtime.services.get(Replacement as unknown as new () => Feed).samples).toBe(12);
  });

  it('registers a service the replacement introduces', () => {
    class Fresh {
      value = 3;
    }
    const mounted = mountRuntime(Column({}, Text({ text: 'x' })));
    mounted.frame();

    mounted.runtime.reload(Column({}, Text({ text: 'y' })), [Fresh]);

    expect(mounted.runtime.services.get(Fresh).value).toBe(3);
  });

  it('works before the first frame, so an early replacement is not a race', () => {
    // A module can be replaced while the app is still starting: the
    // runtime builds its root in the constructor, so there is always a
    // tree to reconcile against even with no frame yet run.
    const mounted = mountRuntime(Column({}, Text({ text: 'before' })), { start: false });

    mounted.runtime.reload(Column({}, Text({ text: 'after' })));
    mounted.runtime.start();
    mounted.frame();

    expect(texts(mounted.runtime.debugRoot())).toEqual(['after']);
  });
});
