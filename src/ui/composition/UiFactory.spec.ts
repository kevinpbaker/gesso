import { describe, expect, it } from 'vitest';
import { BUTTON_INTERACTION } from '../modifiers/interaction';

import { UiNodeType } from '../graph/UiNodeType';
import { Button, Column, Row, ScrollView, Text } from './UiComponents';
import { createElement } from './UiFactory';
import type { UiElement } from './UiElement';
import type { UiProps } from './UiProps';

describe('UiFactory', () => {
  describe('createElement', () => {
    it('creates an element with the supplied type', () => {
      const element = createElement(UiNodeType.Text);
      expect(element.type).toBe(UiNodeType.Text);
    });

    it('creates an element with props', () => {
      const element = createElement(UiNodeType.Text, {
        text: 'Hello'
      });
      expect(element.props.text).toBe('Hello');
    });

    it('creates an element with children', () => {
      const child = createElement(UiNodeType.Text);
      const element = createElement(UiNodeType.Column, {}, [child]);
      expect(element.children).toHaveLength(1);
      expect(element.children[0]).toBe(child);
    });
  });

  describe('Text', () => {
    it('creates a Text element', () => {
      const element = Text({
        text: 'Hello'
      });
      expect(element.type).toBe(UiNodeType.Text);
      expect(element.props).toEqual({
        text: 'Hello'
      });
      expect(element.children).toEqual([]);
    });
  });

  describe('Button', () => {
    it('creates a Button element', () => {
      const element = Button({
        text: 'Save'
      });
      expect(element.type).toBe(UiNodeType.Button);
      // Every button carries the interaction modifier that publishes
      // hover and press; see UiComponents.Button.
      expect(element.props).toEqual({
        text: 'Save',
        modifiers: [BUTTON_INTERACTION]
      });
    });

    it('supports children', () => {
      const child = Text({
        text: 'Save'
      });
      const button = Button({}, child);
      expect(button.children).toEqual([child]);
    });
  });

  describe('Row', () => {
    it('creates a Row element', () => {
      const element = Row();
      expect(element.type).toBe(UiNodeType.Row);
      expect(element.children).toEqual([]);
    });

    it('preserves children', () => {
      const first = Text({
        text: 'A'
      });
      const second = Text({
        text: 'B'
      });
      const row = Row(first, second);
      expect(row.children).toEqual([first, second]);
    });

    it('forwards props alongside children', () => {
      const first = Text({
        text: 'A'
      });
      const second = Text({
        text: 'B'
      });
      const row = Row({ gap: 8 }, first, second);
      expect(row.type).toBe(UiNodeType.Row);
      expect(row.props).toEqual({ gap: 8 });
      expect(row.children).toEqual([first, second]);
    });
  });

  describe('Column', () => {
    it('creates a Column element', () => {
      const element = Column();
      expect(element.type).toBe(UiNodeType.Column);
      expect(element.children).toEqual([]);
    });

    it('preserves children', () => {
      const first = Text({
        text: 'A'
      });
      const second = Text({
        text: 'B'
      });
      const column = Column(first, second);
      expect(column.children).toEqual([first, second]);
    });

    it('forwards props alongside children', () => {
      const first = Text({
        text: 'A'
      });
      const second = Text({
        text: 'B'
      });
      const column = Column({ padding: 4, gap: 8 }, first, second);
      expect(column.type).toBe(UiNodeType.Column);
      expect(column.props).toEqual({ padding: 4, gap: 8 });
      expect(column.children).toEqual([first, second]);
    });
  });

  describe('element-as-props guard', () => {
    it('throws when Text receives an element as props', () => {
      expect(() => Text(Text({ text: 'Hello' }) as unknown as UiProps)).toThrow(/UiElement/);
    });

    it('throws when Button receives an element as props', () => {
      expect(() => Button(Text({ text: 'Save' }) as unknown as UiProps)).toThrow(/UiElement/);
    });

    it('throws when ScrollView receives an element as props', () => {
      expect(() => ScrollView(Text({ text: 'Hello' }) as unknown as UiProps)).toThrow(/UiElement/);
    });

    it('allows elements as children alongside props', () => {
      const child = Text({ text: 'Save' });
      const button = Button({ text: 'Save' }, child);
      expect(button.children).toEqual([child]);
    });
  });

  describe('nested composition', () => {
    it('builds a declarative UI tree', () => {
      const ui = Column(
        Text({
          text: 'Hello'
        }),
        Row(
          Text({
            text: 'World'
          }),
          Button({
            text: 'Save'
          })
        )
      );
      expect(ui.type).toBe(UiNodeType.Column);
      expect(ui.children).toHaveLength(2);
      const text = ui.children[0] as UiElement;
      expect(text.type).toBe(UiNodeType.Text);
      const row = ui.children[1] as UiElement;
      expect(row.type).toBe(UiNodeType.Row);
      expect(row.children).toHaveLength(2);
      expect((row.children[0] as UiElement).type).toBe(UiNodeType.Text);
      expect((row.children[1] as UiElement).type).toBe(UiNodeType.Button);
    });
  });
});
