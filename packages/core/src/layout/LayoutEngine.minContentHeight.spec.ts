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

/**
 * An editable contributes no content to its parent's minimum, but a
 * minimum it declares it will keep however little it is given, so the
 * parent has to count it or the next sibling lands on top of the
 * field. A settings screen taller than its host found this: the column
 * holding a labelled field was shrunk to its label, and the note under
 * the field was drawn across it.
 */
describe('LayoutEngine min-content size of a box holding an editable with a minimum', () => {
  it('counts the editable height minimum, so a shrunk column still makes room for the field', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('outer', UiNodeType.Column);
    const field = harness.createNode('field', UiNodeType.Column);
    const label = harness.createNode('label', UiNodeType.Box);
    label.setProperty('height', 14);
    const editable = harness.createNode('editable', UiNodeType.EditableText);
    editable.setProperty('minHeight', 32);
    const note = harness.createNode('note', UiNodeType.Box);
    note.setProperty('height', 14);
    const filler = harness.createNode('filler', UiNodeType.Box);
    filler.setProperty('height', 40);
    harness.append(field, label, editable);
    harness.append(root, field, note, filler);
    // 14 + 32 + 14 + 40 = 100 asked of 60: something has to give, and
    // it must not be the field's declared minimum.
    harness.layout(root, Constraints.tight(200, 60));

    expect(harness.box(editable).height).toBe(32);
    expect(harness.box(field).height).toBe(46);
    expect(harness.box(note).y).toBeGreaterThanOrEqual(harness.box(editable).y + 32);
  });

  it('counts the editable width minimum the same way along a row', () => {
    const harness = new LayoutHarness();
    const root = harness.createNode('outer', UiNodeType.Row);
    const field = harness.createNode('field', UiNodeType.Row);
    const label = harness.createNode('label', UiNodeType.Box);
    label.setProperty('width', 14);
    const editable = harness.createNode('editable', UiNodeType.EditableText);
    editable.setProperty('minWidth', 32);
    const filler = harness.createNode('filler', UiNodeType.Box);
    filler.setProperty('width', 40);
    harness.append(field, label, editable);
    harness.append(root, field, filler);
    harness.layout(root, Constraints.tight(60, 40));

    expect(harness.box(editable).width).toBe(32);
    expect(harness.box(field).width).toBe(46);
    expect(harness.box(filler).x).toBeGreaterThanOrEqual(harness.box(editable).x + 32);
  });
});
