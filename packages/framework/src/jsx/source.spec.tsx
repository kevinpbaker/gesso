import { BehaviorSubject, type Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { type UiChild, type UiElement, type UiNode, type UiSourceLocation, UiNodeType } from 'gesso-core';

import { formatNodeReport } from '../app/NodeReport';
import { mountRuntime } from '../app/RuntimeTestUtils';
import type { ComponentElement } from '../ComponentElement';
import { Show } from '../show';
import { jsx } from './jsx-runtime';
// Vite's ?raw import keeps this spec free of node:fs and its types.
import thisSource from './source.spec.tsx?raw';

/**
 * Where an element was written, from the location the compiler passes
 * `jsxDEV` to the inspector's report.
 *
 * Vitest compiles this file for development, so the tags below go
 * through `jsxDEV` exactly as an application's do under `vite dev`, and
 * the lines asserted are the lines in this file. Each expected line is
 * found by the marker comment on it rather than written as a number,
 * so editing the file above one does not break it.
 */

function lineOf(marker: string): number {
  const lines = thisSource.split('\n');
  const index = lines.findIndex(line => line.includes(`at: ${marker} `) || line.endsWith(`at: ${marker}`));
  if (index === -1) {
    throw new Error(`No line is marked '${marker}'.`);
  }
  return index + 1;
}

function sourceOf(child: UiChild): UiSourceLocation | undefined {
  return (child as UiElement | ComponentElement).source;
}

/** The absolute path the compiler gives this file, read off a tag in it. */
const thisFile = sourceOf(<box />)!.fileName;

function findNode(from: UiNode, test: (node: UiNode) => boolean): UiNode | undefined {
  if (test(from)) {
    return from;
  }
  for (let child = from.firstChild; child !== null; child = child.nextSibling) {
    const found = findNode(child, test);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function Card(): UiChild {
  return <box width={120} height={40} />; // at: card-root
}

describe('source locations', () => {
  it('an element keeps the file and line it was written on', () => {
    const element = <row gap={4} />; // at: row

    expect(sourceOf(element)).toEqual({ fileName: thisFile, lineNumber: lineOf('row'), columnNumber: 21 });
    expect(thisFile.endsWith('/packages/framework/src/jsx/source.spec.tsx')).toBe(true);
  });

  it('a component keeps where it was used, not where it was defined', () => {
    const element = <Card />; // at: card-use

    expect(sourceOf(element)?.lineNumber).toBe(lineOf('card-use'));
  });

  it('the production entry is given no location and keeps none', () => {
    expect(sourceOf(jsx('row', { gap: 4 }))).toBeUndefined();
  });

  it('a structural tag is still the observable its parent binds', () => {
    const when = new BehaviorSubject(true);
    const shown = (<Show when={when}>{() => <text text="on" />}</Show>) as unknown as Observable<readonly UiChild[]>;

    const seen: (readonly UiChild[])[] = [];
    shown.subscribe(list => seen.push(list));

    expect(typeof shown.subscribe).toBe('function');
    expect(seen).toHaveLength(1);
  });

  it('the inspector says where a node was written and where each component around it was used', () => {
    const mounted = mountRuntime(
      <column padding={10}>
        <Card /* at: card-in-tree */ />
      </column>
    );
    mounted.frame();
    const box = findNode(mounted.runtime.debugRoot(), node => node.type === UiNodeType.Box)!;

    const report = mounted.runtime.inspectNode(box);

    expect(report.source?.lineNumber).toBe(lineOf('card-root'));
    expect(report.owners[0]?.name).toBe('Card');
    expect(report.owners[0]?.usedAt?.lineNumber).toBe(lineOf('card-in-tree'));
    expect(formatNodeReport(report)).toContain(`written at ${thisFile}:${lineOf('card-root')}:`);
    expect(formatNodeReport(report)).toContain(`Card (used at ${thisFile}:${lineOf('card-in-tree')}:`);
  });
});
