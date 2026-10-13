import { describe, expect, it } from 'vitest';

import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import { LayoutEngine } from './LayoutEngine';
import { Constraints } from './LayoutTypes';
import { scrollbarThumbs } from './Scrollbars';
import { CharacterCountTextMeasurer } from './TextMeasurer';

describe('scrollbarThumbs', () => {
  function scrolled(scrollbars?: 'auto' | 'none') {
    const graph = new UiGraph();
    const engine = new LayoutEngine(new CharacterCountTextMeasurer());
    const root = graph.createNode('app', UiNodeType.Column);
    const scroll = graph.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('height', 100);
    if (scrollbars !== undefined) scroll.setProperty('scrollbars', scrollbars);
    const tall = graph.createNode('tall', UiNodeType.Box);
    tall.setProperty('height', 400);
    tall.setProperty('flexShrink', 0);
    graph.appendChild(root, scroll);
    graph.appendChild(scroll, tall);
    engine.layout(root, Constraints.tight(200, 300));
    return scrollbarThumbs(engine.recordFor(scroll)!);
  }

  it('gives a container whose content overflows a thumb', () => {
    expect(scrolled().vertical).not.toBeNull();
  });

  it('gives none to one set to show no scrollbars, so none is drawn or grabbed', () => {
    expect(scrolled('none')).toEqual({ vertical: null, horizontal: null });
  });
});
