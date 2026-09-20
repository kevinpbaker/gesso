import { describe, expect, it } from 'vitest';

import { createComponent, internalState } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, type UiChild, type UiNode } from 'gesso-core';
import { Chip } from './Chip';

function mount(root: Parameters<typeof renderTest>[0]) {
  return renderTest(root, { width: 400, height: 400 });
}

/**
 * The chip at its own size, in a corner of the window. A root fills the
 * window, so a chip mounted bare is 400 pixels square and the pointer
 * cannot leave it.
 */
function placed(chip: UiChild) {
  return mount(Column({ padding: 8, x: 'start', width: 400, height: 400 }, chip));
}

/** The pointer over the middle of a node, through the hit tester. */
function hover(ui: ReturnType<typeof mount>, node: UiNode): void {
  const box = ui.getLayout(node);
  ui.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
  ui.frame();
}

/** The pointer away from everything. */
function leave(ui: ReturnType<typeof mount>): void {
  ui.fireEvent.pointerMove(399, 399);
  ui.frame();
}

/** The property as the node resolved it, after the modifiers wrote theirs. */
function prop(node: UiNode, name: string): unknown {
  return node.properties.get(name);
}

describe('Chip', () => {
  it('is a toggle button: the label is the name, and selected is the pressed state', () => {
    const off = mount(createComponent(Chip, { label: 'Metal' }));
    expect(off.getByRole('button')).toHaveSemantics({ role: 'button', name: 'Metal', states: [] });
    expect(off.getByText('Metal')).toBeTruthy();

    const on = mount(createComponent(Chip, { label: 'Metal', selected: true }));
    expect(on.getByRole('button')).toHaveSemantics({ name: 'Metal', states: ['pressed'] });
  });

  it('follows a selected cell as it changes, without re-rendering', () => {
    const selected = internalState(false);
    const ui = mount(createComponent(Chip, { label: 'Metal', selected }));
    const chip = ui.getByRole('button');
    expect(chip).toHaveSemantics({ states: [] });

    selected.value = true;
    ui.frame();
    expect(chip).toHaveSemantics({ states: ['pressed'] });
    expect(prop(chip, 'backgroundColor')).toBe('controlForeground');
  });

  it('reports the value it would take, and does not move until the application writes it', () => {
    const presses: boolean[] = [];
    const ui = mount(createComponent(Chip, { label: 'Metal', selected: false, onPress: next => presses.push(next) }));
    const chip = ui.getByRole('button');

    ui.fireEvent.click(chip);
    ui.frame();
    expect(presses).toEqual([true]);
    // Controlled: nothing wrote back, so it is where the application left it.
    expect(chip).toHaveSemantics({ states: [] });
  });

  it('manages itself when given defaultSelected', () => {
    const presses: boolean[] = [];
    const ui = mount(
      createComponent(Chip, { label: 'Metal', defaultSelected: true, onPress: next => presses.push(next) })
    );
    const chip = ui.getByRole('button');
    expect(chip).toHaveSemantics({ states: ['pressed'] });

    ui.fireEvent.click(chip);
    ui.frame();
    expect(chip).toHaveSemantics({ states: [] });
    expect(presses).toEqual([false]);
  });

  it('is a plain button when given neither form: never on, and a press says so', () => {
    const presses: boolean[] = [];
    const ui = mount(createComponent(Chip, { label: 'Clear filters', onPress: next => presses.push(next) }));
    const chip = ui.getByRole('button');

    ui.fireEvent.click(chip);
    ui.frame();
    ui.fireEvent.click(chip);
    ui.frame();
    expect(presses).toEqual([true, true]);
    expect(chip).toHaveSemantics({ states: [] });
  });

  it('throws when given both forms, naming itself', () => {
    expect(() => mount(createComponent(Chip, { label: 'Metal', selected: true, defaultSelected: true }))).toThrow(
      /Chip/
    );
  });

  it('toggles from Space and from Enter, which the element handles', () => {
    const ui = mount(createComponent(Chip, { label: 'Metal', defaultSelected: false }));
    const chip = ui.getByRole('button');

    ui.fireEvent.focus(chip);
    ui.fireEvent.press(' ');
    ui.frame();
    expect(chip).toHaveSemantics({ states: ['pressed'] });

    ui.fireEvent.press('Enter');
    ui.frame();
    expect(chip).toHaveSemantics({ states: [] });
  });

  it('refuses a press while disabled, and says so', () => {
    const presses: boolean[] = [];
    const ui = mount(createComponent(Chip, { label: 'Metal', disabled: true, onPress: next => presses.push(next) }));
    const chip = ui.getByRole('button');

    ui.fireEvent.click(chip);
    ui.fireEvent.focus(chip);
    ui.fireEvent.press(' ');
    ui.frame();
    expect(presses).toEqual([]);
    expect(chip).toHaveSemantics({ disabled: true });
    expect(prop(ui.getByText('Metal'), 'color')).toBe('controlForegroundDisabled');
  });

  it('lets the name say more than the word', () => {
    const ui = mount(createComponent(Chip, { label: 'Metal', name: 'Show Metal, 119,205 tracks' }));
    expect(ui.getByRole('button')).toHaveSemantics({ name: 'Show Metal, 119,205 tracks' });
    expect(ui.getByText('Metal')).toBeTruthy();
  });

  it('follows a name that changes with the state', () => {
    const selected = internalState(false);
    const name = internalState('Show Metal');
    const ui = mount(createComponent(Chip, { label: 'Metal', selected, name }));
    expect(ui.getByRole('button')).toHaveSemantics({ name: 'Show Metal' });

    selected.value = true;
    name.value = 'Metal, showing';
    ui.frame();
    expect(ui.getByRole('button')).toHaveSemantics({ name: 'Metal, showing', states: ['pressed'] });
  });

  it('shows a count beside the word and puts it in the name', () => {
    const ui = mount(createComponent(Chip, { label: 'Metal', count: '119,205' }));
    expect(ui.getByText('119,205')).toBeTruthy();
    expect(ui.getByRole('button')).toHaveSemantics({ name: 'Metal, 119,205' });
  });

  it('carries a description for what the word cannot say', () => {
    const ui = mount(createComponent(Chip, { label: 'no bots', description: "Drop edits the wiki marks as a bot's" }));
    expect(prop(ui.getByRole('button'), 'description')).toBe("Drop edits the wiki marks as a bot's");
  });

  it('names a palette entry rather than a colour, on every axis and in both states', () => {
    for (const variant of ['filled', 'outlined'] as const) {
      for (const selected of [false, true]) {
        const ui = mount(createComponent(Chip, { label: 'Go', variant, selected }));
        const chip = ui.getByRole('button');
        for (const property of ['backgroundColor', 'borderColor']) {
          const value = prop(chip, property);
          if (value !== undefined) {
            expect(typeof value).toBe('string');
            expect(value).not.toMatch(/^#|^rgb/);
          }
        }
        const words = prop(ui.getByText('Go'), 'color');
        expect(typeof words).toBe('string');
        expect(words).not.toMatch(/^#|^rgb/);
      }
    }
  });

  it('inverts when a filled chip is on, and rings when an outlined one is', () => {
    const filled = mount(createComponent(Chip, { label: 'Go', selected: true }));
    expect(prop(filled.getByRole('button'), 'backgroundColor')).toBe('controlForeground');
    expect(prop(filled.getByText('Go'), 'color')).toBe('controlBackground');
    expect(prop(filled.getByRole('button'), 'borderWidth')).toBe(0);

    const outlined = mount(createComponent(Chip, { label: 'Go', variant: 'outlined', selected: true }));
    expect(prop(outlined.getByRole('button'), 'backgroundColor')).toBe('selectionBackground');
    expect(prop(outlined.getByRole('button'), 'borderColor')).toBe('controlAccent');
    expect(prop(outlined.getByRole('button'), 'borderWidth')).toBe(1);

    const resting = mount(createComponent(Chip, { label: 'Go', variant: 'outlined' }));
    expect(prop(resting.getByRole('button'), 'backgroundColor')).toBe('transparent');
    expect(prop(resting.getByRole('button'), 'borderColor')).toBe('controlBorder');
  });

  it('sets a pointer cursor, which is the standing rule for anything clickable', () => {
    const ui = mount(createComponent(Chip, { label: 'Go' }));
    expect(prop(ui.getByRole('button'), 'cursor')).toBe('pointer');
  });

  it('hovers to the control token while off, and restores its ground when the pointer leaves', () => {
    const ui = placed(createComponent(Chip, { label: 'Go', selected: false }));
    const chip = ui.getByRole('button');
    hover(ui, chip);
    expect(prop(chip, 'backgroundColor')).toBe('controlBackgroundHovered');
    expect(prop(chip, 'opacity')).toBe(1);
    leave(ui);
    expect(prop(chip, 'backgroundColor')).toBe('controlBackground');
    expect(prop(chip, 'opacity')).toBeUndefined();
  });

  it('dims a filled chip that is on, since its ground is already the foreground', () => {
    const ui = mount(createComponent(Chip, { label: 'Go', selected: true }));
    const chip = ui.getByRole('button');
    hover(ui, chip);
    expect(prop(chip, 'backgroundColor')).toBe('controlForeground');
    expect(prop(chip, 'opacity')).toBe(0.88);
    expect(prop(ui.getByText('Go'), 'color')).toBe('controlBackground');
  });

  it('changes its hover with its state while the pointer stays', () => {
    const selected = internalState(false);
    const ui = mount(createComponent(Chip, { label: 'Go', selected }));
    const chip = ui.getByRole('button');
    hover(ui, chip);
    expect(prop(chip, 'backgroundColor')).toBe('controlBackgroundHovered');

    // The chip goes on under the pointer: the hovered ground follows,
    // which is the case the private chips could not express.
    selected.value = true;
    ui.frame();
    expect(prop(chip, 'backgroundColor')).toBe('controlForeground');
    expect(prop(chip, 'opacity')).toBe(0.88);
  });

  it('hovers an outlined chip that is on to the control token, over its wash', () => {
    const ui = mount(createComponent(Chip, { label: 'Go', variant: 'outlined', selected: true }));
    const chip = ui.getByRole('button');
    hover(ui, chip);
    expect(prop(chip, 'backgroundColor')).toBe('controlBackgroundHovered');
    expect(prop(chip, 'opacity')).toBeUndefined();
  });

  it('grows with its size, from the spacing scale, and names a type role', () => {
    const small = mount(createComponent(Chip, { label: 'A', size: 'small' }));
    const medium = mount(createComponent(Chip, { label: 'A', size: 'medium' }));
    expect(Number(prop(small.getByRole('button'), 'paddingX'))).toBeLessThan(
      Number(prop(medium.getByRole('button'), 'paddingX'))
    );
    expect(prop(small.getByText('A'), 'textStyle')).toBe('bodySmall');
    expect(prop(medium.getByText('A'), 'textStyle')).toBe('body');
    expect(prop(small.getByText('A'), 'fontSize')).toBeUndefined();
  });

  it('takes a type role of its own, for a code or a figure', () => {
    const ui = mount(createComponent(Chip, { label: 'de', textStyle: 'label' }));
    expect(prop(ui.getByText('de'), 'textStyle')).toBe('label');
  });

  it('draws a glyph before the word when given a path', () => {
    const ui = placed(createComponent(Chip, { label: 'Liked', icon: 'M12 21l-8-8a5 5 0 0 1 8-6 5 5 0 0 1 8 6z' }));
    const chip = ui.getByRole('button');
    const words = ui.getByText('Liked');
    // The glyph sits to the left of the word, inside the chip.
    const wordBox = ui.getLayout(words);
    const chipBox = ui.getLayout(chip);
    expect(wordBox.x).toBeGreaterThan(chipBox.x + 16);
  });
});
