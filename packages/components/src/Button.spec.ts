import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Text, type UiNode } from 'gesso-core';
import { Button } from './Button';

function mount(root: Parameters<typeof renderTest>[0]) {
  return renderTest(root, { width: 400, height: 400 });
}

/** The pointer over the middle of a node, through the hit tester. */
function hover(ui: ReturnType<typeof mount>, node: UiNode): void {
  const box = ui.getLayout(node);
  ui.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
  ui.frame();
}

/** The property as the node resolved it, after the modifiers wrote theirs. */
function prop(node: UiNode, name: string): unknown {
  return node.properties.get(name);
}

describe('Button', () => {
  it('takes one label and uses it as the words and the name', () => {
    const ui = mount(createComponent(Button, { label: 'Sign in with Audius' }));
    const button = ui.getByRole('button');
    expect(button).toHaveSemantics({ name: 'Sign in with Audius' });
    expect(ui.getByText('Sign in with Audius')).toBeTruthy();
  });

  it('calls back on a press, and not while disabled', () => {
    const presses: number[] = [];
    const ui = mount(createComponent(Button, { label: 'Retry', onClick: () => presses.push(1) }));
    ui.fireEvent.click(ui.getByRole('button'));
    expect(presses.length).toBe(1);

    const off = mount(createComponent(Button, { label: 'Retry', disabled: true, onClick: () => presses.push(2) }));
    off.fireEvent.click(off.getByRole('button'));
    expect(presses).toEqual([1]);
  });

  it('refuses a press while busy, and says so', () => {
    const presses: number[] = [];
    const ui = mount(createComponent(Button, { label: 'Saving', busy: true, onClick: () => presses.push(1) }));
    ui.fireEvent.click(ui.getByRole('button'));
    expect(presses).toEqual([]);
    expect(ui.getByRole('button')).toHaveSemantics({ states: ['busy'] });
  });

  it('names a palette entry rather than a colour, on every axis', () => {
    for (const variant of ['filled', 'tonal', 'outlined', 'plain'] as const) {
      for (const tone of ['neutral', 'accent', 'danger'] as const) {
        const ui = mount(createComponent(Button, { label: 'Go', variant, tone }));
        const background = prop(ui.getByRole('button'), 'backgroundColor');
        expect(typeof background).toBe('string');
        expect(background).not.toMatch(/^#|^rgb/);
      }
    }
  });

  it('sets a pointer cursor, which is the standing rule for anything clickable', () => {
    const ui = mount(createComponent(Button, { label: 'Go' }));
    expect(prop(ui.getByRole('button'), 'cursor')).toBe('pointer');
  });

  it('shows a hover state without the caller writing one', () => {
    const ui = mount(createComponent(Button, { label: 'Go', variant: 'outlined' }));
    const button = ui.getByRole('button');
    hover(ui, button);
    expect(prop(button, 'backgroundColor')).toBe('controlBackgroundHovered');
  });

  it('dims a filled button on hover, since its ground is already the accent', () => {
    const ui = mount(createComponent(Button, { label: 'Go', variant: 'filled' }));
    const button = ui.getByRole('button');
    expect(prop(button, 'opacity')).toBeUndefined();
    hover(ui, button);
    expect(prop(button, 'opacity')).toBe(0.88);
  });

  it('grows with its size, from the spacing scale', () => {
    const small = mount(createComponent(Button, { label: 'A', size: 'small' }));
    const large = mount(createComponent(Button, { label: 'A', size: 'large' }));
    expect(Number(prop(small.getByRole('button'), 'paddingX'))).toBeLessThan(
      Number(prop(large.getByRole('button'), 'paddingX'))
    );
  });

  it('names a type role rather than a size and a weight', () => {
    const ui = mount(createComponent(Button, { label: 'A', size: 'large' }));
    const text = ui.getByText('A');
    expect(prop(text, 'textStyle')).toBe('bodyLarge');
    expect(prop(text, 'fontSize')).toBeUndefined();
  });

  it('keeps the label as the name when the content is something else', () => {
    const ui = mount(createComponent(Button, { label: 'Play', children: Text({ text: '\u25b6' }) }));
    expect(ui.getByRole('button')).toHaveSemantics({ name: 'Play' });
  });
});
