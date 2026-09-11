import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import { LayoutHarness } from './LayoutTestUtils';
import { Constraints } from './LayoutTypes';

/**
 * A flex item's automatic minimum height is its min-content height, and
 * a scroll container contributes none: scrollable content pushes on
 * nothing outside the scroller, along either axis. Without this a box
 * holding a list is as tall as the list, and a lazy list inside it has
 * a viewport the size of its content.
 */
describe('LayoutEngine min-content height', () => {
  function column(wrapperType: UiNodeType, inner: 'scroll' | 'column') {
    const harness = new LayoutHarness();
    const root = harness.createNode('outer', UiNodeType.Column);
    const header = harness.createNode('header', UiNodeType.Box);
    header.setProperty('height', 50);
    const wrapper = harness.createNode('wrapper', wrapperType);
    wrapper.setProperty('flexGrow', 1);
    wrapper.setProperty('flexBasis', 0);
    const content = harness.createNode('content', inner === 'scroll' ? UiNodeType.ScrollView : UiNodeType.Column);
    for (let n = 0; n < 10; n++) {
      const row = harness.createNode(`row${n}`, UiNodeType.Box);
      row.setProperty('height', 50);
      row.setProperty('flexShrink', 0);
      harness.append(content, row);
    }
    harness.append(wrapper, content);
    harness.append(root, header, wrapper);
    harness.layout(root, Constraints.tight(200, 300));
    return { harness, wrapper, content };
  }

  it('gives a stack holding a scroll view its flex share, not the height of the rows', () => {
    const { harness, wrapper, content } = column(UiNodeType.Box, 'scroll');
    expect(harness.box(wrapper).height).toBe(250);
    expect(harness.box(content).height).toBe(250);
    expect(harness.record(content).contentHeight).toBe(500);
  });

  it('gives a column holding a scroll view its flex share as well', () => {
    const { harness, wrapper, content } = column(UiNodeType.Column, 'scroll');
    expect(harness.box(wrapper).height).toBe(250);
    expect(harness.box(content).height).toBe(250);
  });

  it('still keeps a stack holding plain content at least as tall as that content', () => {
    const { harness, wrapper, content } = column(UiNodeType.Box, 'column');
    expect(harness.box(wrapper).height).toBe(500);
    expect(harness.box(content).height).toBe(500);
  });

  it('lets an explicit height on the scroll view count towards the minimum', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('outer', UiNodeType.Column);
    const wrapper = harness.createNode('wrapper', UiNodeType.Box);
    wrapper.setProperty('flexGrow', 1);
    wrapper.setProperty('flexBasis', 0);
    const scroll = harness.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('height', 400);
    harness.append(wrapper, scroll);
    harness.append(root, wrapper);
    harness.layout(root, Constraints.tight(200, 300));
    expect(harness.box(wrapper).height).toBe(400);
  });
});
