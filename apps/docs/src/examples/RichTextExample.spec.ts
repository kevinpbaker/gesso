import { describe, expect, it } from 'vitest';

import { UiNodeType, selectableTextOf, textContentOf } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { markdownBlocks, RichText } from './RichTextExample';

/**
 * The claim rich text makes, checked on the document the page shows.
 *
 * A markdown document with headings, emphasis, inline code and links
 * is one paragraph node per block; the text of each block is one
 * string, so it selects, is found and is read as prose with links in
 * it. Every one of those is asserted here rather than described.
 */
const SOURCE = `# Heading

Plain, **bold**, *italic*, \`code\` and a [link](https://example.test/a).`;

describe('the docs rich text example', () => {
  describe('markdownBlocks', () => {
    it('turns a block into runs, and the runs concatenate to the text', () => {
      const blocks = markdownBlocks(SOURCE, () => {});
      expect(blocks.map(block => block.level)).toEqual([1, 0]);
      expect(blocks[1].spans.map(span => span.text).join('')).toBe('Plain, bold, italic, code and a link.');
    });

    it('gives each form the run it deserves', () => {
      const [, paragraph] = markdownBlocks(SOURCE, () => {});
      const bold = paragraph.spans.find(span => span.text === 'bold');
      const italic = paragraph.spans.find(span => span.text === 'italic');
      const code = paragraph.spans.find(span => span.text === 'code');
      const link = paragraph.spans.find(span => span.text === 'link');
      expect(bold?.fontWeight).toBe(700);
      expect(italic?.fontStyle).toBe('italic');
      expect(code?.fontFamily).toBe('monospace');
      expect(link?.link?.href).toBe('https://example.test/a');
      expect(link?.textDecoration).toBe('underline');
    });

    it('runs the handler the link was built with', () => {
      const followed: string[] = [];
      const [, paragraph] = markdownBlocks(SOURCE, href => followed.push(href));
      paragraph.spans.find(span => span.text === 'link')?.link?.onClick?.();
      expect(followed).toEqual(['https://example.test/a']);
    });
  });

  describe('the rendered document', () => {
    it('is one paragraph node per block, and no node per run', () => {
      const ui = renderTest(createComponent(RichText, {}), { width: 620, height: 720 });
      // Each of these throws if two nodes carry the block's text, so
      // finding all four is the assertion that a block is one node.
      const blocks = [
        ui.getByText('Rich text'),
        ui.getByText(/A paragraph is one node/),
        ui.getByText('What a run may change'),
        ui.getByText(/Its family, size, weight/)
      ];
      expect(blocks.every(node => node.type === UiNodeType.Text)).toBe(true);
      expect(blocks.every(node => node.properties.get('spans') !== undefined)).toBe(true);
      expect(blocks.every(node => node.properties.get('text') === undefined)).toBe(true);
      // Six runs in the first paragraph, and still one node with no
      // children: a run is a shape of a paragraph, not a node in it.
      expect((blocks[1].properties.get('spans') as readonly unknown[]).length).toBeGreaterThan(5);
      expect(blocks.every(node => node.firstChild === null)).toBe(true);
    });

    it('lays every paragraph out on more than one line, from its runs', () => {
      const ui = renderTest(createComponent(RichText, {}), { width: 620, height: 720 });
      const body = ui.getByText(/A paragraph is one node/);
      const box = ui.getLayout(body);
      expect(box.width).toBeGreaterThan(0);
      // The body is long enough to wrap in a 520px card, and it wrapped
      // against the runs' own widths.
      expect(box.height).toBeGreaterThan(30);
    });

    it('is one selectable string per block, runs and all', () => {
      const ui = renderTest(createComponent(RichText, {}), { width: 620, height: 720 });
      const body = ui.getByText(/A paragraph is one node/);
      const text = selectableTextOf(body);
      expect(text).toBe(textContentOf(body));
      // The words either side of a run are in the same string as the
      // run, which is what lets a drag cross it.
      expect(text).toContain('may be bold, or italic');
      expect(text).toContain('or a link you can press');
    });

    it('is found by a search that crosses a run boundary', () => {
      const ui = renderTest(createComponent(RichText, {}), { width: 620, height: 720 });
      // 'a link you can' spans the prose before the run, the run, and
      // the prose after it.
      expect(ui.getByText(/a link you can press/)).toBeDefined();
    });

    it('reads as prose with links in it', () => {
      const ui = renderTest(createComponent(RichText, {}), { width: 620, height: 720 });
      const records = [...ui.semanticsTree().values()];
      const links = records.filter(record => record.role === 'link');
      expect(links.map(record => record.label)).toEqual(['link', 'link', 'accessibility mirror']);
      // The paragraph holding them is named by what it contains rather
      // than by a label, so its words are not read twice.
      const paragraphs = records.filter(record => record.role === 'paragraph');
      expect(paragraphs).toHaveLength(2);
      expect(paragraphs.every(record => record.label === undefined)).toBe(true);
    });

    it('reads the prose between two links as its own record, in order', () => {
      const ui = renderTest(createComponent(RichText, {}), { width: 620, height: 720 });
      const labels = [...ui.semanticsTree().values()]
        .filter(record => record.parent !== null && record.role !== 'status')
        .map(record => record.label);
      const index = labels.indexOf('accessibility mirror');
      expect(index).toBeGreaterThan(0);
      expect(labels[index - 1]).toMatch(/find-in-page and to the $/);
    });
  });
});
