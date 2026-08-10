import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../UiNodeType';
import { createElement } from './UiFactory';
import type { UiElement } from './UiElement';

describe('UiDefinition', () => {
  describe('element structure', () => {
    it('creates an element with a type', () => {
      const element: UiElement = createElement(UiNodeType.Text);
      expect(element.type).toBe(UiNodeType.Text);
    });

    it('creates an element with empty props by default', () => {
      const element = createElement(UiNodeType.Text);
      expect(element.props).toEqual({});
    });

    it('creates an element with empty children by default', () => {
      const element = createElement(UiNodeType.Text);
      expect(element.children).toEqual([]);
    });

    it('preserves supplied props', () => {
      const element = createElement(UiNodeType.Text, {
        text: 'Hello'
      });
      expect(element.props).toEqual({
        text: 'Hello'
      });
    });

    it('preserves supplied children', () => {
      const child = createElement(UiNodeType.Text);
      const element = createElement(UiNodeType.Column, {}, [child]);
      expect(element.children).toEqual([child]);
    });

    it('preserves child ordering', () => {
      const first = createElement(UiNodeType.Text, {
        text: 'first'
      });
      const second = createElement(UiNodeType.Text, {
        text: 'second'
      });
      const third = createElement(UiNodeType.Text, {
        text: 'third'
      });
      const element = createElement(UiNodeType.Column, {}, [first, second, third]);
      expect(element.children).toEqual([first, second, third]);
    });

    it('supports nested definitions', () => {
      const text = createElement(UiNodeType.Text, {
        text: 'Hello'
      });
      const row = createElement(UiNodeType.Row, {}, [text]);
      const column = createElement(UiNodeType.Column, {}, [row]);
      expect(column.children[0]).toBe(row);
      expect(row.children[0]).toBe(text);
    });
  });
});
