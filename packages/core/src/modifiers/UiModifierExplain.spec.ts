import { describe, expect, it, vi } from 'vitest';

import { Box, Column } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';
import { UiGraph } from '../graph/UiGraph';
import { resetOverrideWarnings } from '../graph/UiPropertyOverrides';
import { LayoutEngine } from '../layout/LayoutEngine';
import { formatExplanation } from '../layout/LayoutExplanation';
import { Constraints } from '../layout/LayoutTypes';
import { CharacterCountTextMeasurer } from '../layout/TextMeasurer';
import { LayoutInspector } from '../rendering/LayoutInspector';
import { defineModifier } from './UiModifier';
import { hoverable } from './interaction';
import { focusRing } from './decoration';

/**
 * L8 made layout explain itself, and B1 then
 * let a modifier change the numbers it explains. These are the specs
 * that stop the explanation lying by omission, and the ones that stop a
 * throwing modifier taking the tree with it.
 */
const writer = defineModifier<{ property: string; value: unknown }>({
  name: 'writer',
  attach(host, args) {
    host.set(args.property, args.value);
  },
  update(host, args) {
    host.set(args.property, args.value);
  }
});

function build(root: UiChild) {
  const graph = new UiGraph();
  const builder = new UiGraphBuilder(graph, {});
  const engine = new LayoutEngine(new CharacterCountTextMeasurer({ glyphWidth: 1 }));
  builder.reconcileChildren(graph.root, [root]);
  const page = graph.root.firstChild!;
  engine.layout(page, Constraints.loose(400, 300));
  const rebuild = (next: UiChild): void => {
    builder.reconcileChildren(graph.root, [next]);
    engine.layout(page, Constraints.loose(400, 300));
  };
  return { graph, builder, engine, page, node: page.firstChild!, rebuild };
}

describe('a layout explanation with modifiers on the node', () => {
  it('names the modifier that decided a size, and what the element declared', () => {
    const { engine, node } = build(
      Column({}, Box({ width: 200, height: 20, modifiers: [writer({ property: 'width', value: 240 })] }))
    );

    const explanation = engine.explain(node);

    expect(explanation.sources?.width).toBe('set by writer (declared 200)');
    expect(explanation.width.reasons.at(-1)).toBe('set by writer (declared 200)');
    expect(explanation.box.width).toBe(240);
  });

  it('says so when the element declared nothing at all', () => {
    const { engine, node } = build(
      Column({}, Box({ height: 20, modifiers: [writer({ property: 'width', value: 60 })] }))
    );

    expect(engine.explain(node).sources?.width).toBe('set by writer (the element declared none)');
  });

  it('names every modifier writing one property, in list order', () => {
    resetOverrideWarnings();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine, node } = build(
      Column(
        {},
        Box({
          width: 200,
          height: 20,
          modifiers: [writer({ property: 'width', value: 240 }, 'a'), writer({ property: 'width', value: 300 }, 'b')]
        })
      )
    );

    expect(engine.explain(node).sources?.width).toBe('set by writer, then writer (declared 200)');
    expect(engine.explain(node).box.width).toBe(300);
    vi.restoreAllMocks();
  });

  it('reports a property that has nothing to do with layout', () => {
    const { engine, node } = build(
      Column(
        {},
        Box({
          width: 40,
          height: 20,
          backgroundColor: '#111',
          modifiers: [writer({ property: 'backgroundColor', value: '#f00' })]
        })
      )
    );

    // The line the axes do not carry: "why is it that colour" has the
    // same answer as "why is it that wide", and nothing else gives it.
    const printed = formatExplanation(engine.explain(node));

    // Quoted, because `describeLength` prints a length in every form it
    // has and JSON-quotes anything that is not one, which is what keeps
    // a colour distinguishable from a bare token.
    expect(printed).toContain('overrides: backgroundColor set by writer (declared "#111")');
    expect(node.properties.get('backgroundColor')).toBe('#f00');
  });

  it('has no sources at all when no modifier writes anything', () => {
    const { engine, node } = build(Column({}, Box({ width: 40, height: 20 })));

    expect(engine.explain(node).sources).toBeUndefined();
    expect(formatExplanation(engine.explain(node))).not.toContain('overrides:');
  });

  it('goes back to saying nothing when the modifier leaves', () => {
    const { engine, node, rebuild } = build(
      Column({}, Box({ width: 200, height: 20, modifiers: [writer({ property: 'width', value: 240 })] }))
    );
    expect(engine.explain(node).sources).toBeDefined();

    rebuild(Column({}, Box({ width: 200, height: 20 })));

    expect(engine.explain(node).sources).toBeUndefined();
  });
});

describe('the inspector label', () => {
  it('lists the modifiers attached to the hovered node', () => {
    const { builder, engine, node } = build(
      Column({}, Box({ width: 40, height: 20, modifiers: [hoverable(), focusRing()] }))
    );
    const inspector = new LayoutInspector(engine, {
      modifierNames: hovered => builder.modifiersFor(hovered)?.names ?? []
    });
    inspector.setEnabled(true);
    inspector.setHovered(node);

    const label = inspector.overlay(0).shapes.find(shape => shape.kind === 'label');

    expect(label?.kind === 'label' && label.text).toContain('interactive, focusRing');
  });

  it('says nothing about modifiers when there are none', () => {
    const { builder, engine, node } = build(Column({}, Box({ width: 40, height: 20 })));
    const inspector = new LayoutInspector(engine, {
      modifierNames: hovered => builder.modifiersFor(hovered)?.names ?? []
    });
    inspector.setEnabled(true);
    inspector.setHovered(node);

    const label = inspector.overlay(0).shapes.find(shape => shape.kind === 'label');

    expect(label?.kind === 'label' && label.text).toBe("box 'root:0:0' 40×20");
  });

  it('outlines a decoration in its own colour, outside the box', () => {
    const ring = defineModifier<void>({
      name: 'ring',
      attach(host) {
        host.decorate([{ kind: 'stroke', color: '#fff', lineWidth: 2, outset: 4 }]);
      }
    });
    const { builder, engine, node } = build(Column({}, Box({ width: 40, height: 20, modifiers: [ring(undefined)] })));
    const inspector = new LayoutInspector(engine, {
      modifierNames: hovered => builder.modifiersFor(hovered)?.names ?? []
    });
    inspector.setEnabled(true);
    inspector.setHovered(node);

    const box = engine.visibleBox(node);
    const strokes = inspector.overlay(0).shapes.filter(shape => shape.kind === 'stroke');
    const decoration = strokes.find(shape => shape.kind === 'stroke' && shape.width === box.width + 8);

    expect(decoration).toBeDefined();
    expect(decoration?.kind === 'stroke' && decoration.height).toBe(box.height + 8);
  });
});

describe('a modifier that throws', () => {
  it('is reported and detached rather than taking the build with it', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = defineModifier<void>({
      name: 'bad',
      attach(host) {
        host.set('width', 999);
        throw new Error('no');
      }
    });

    const { node } = build(Column({}, Box({ width: 200, height: 20, modifiers: [bad(undefined)] })));

    // The tree is intact and the half-written override is gone.
    expect(node.properties.get('width')).toBe(200);
    expect(node.overrides).toBeNull();
    expect(error.mock.calls[0]?.[0]).toContain("UI modifier 'bad' threw in attach on node 'root:0:0'");
    error.mockRestore();
  });

  it('leaves the modifiers beside it attached and working', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = defineModifier<void>({
      name: 'bad',
      attach() {
        throw new Error('no');
      }
    });

    const { builder, node } = build(
      Column(
        {},
        Box({ width: 200, height: 20, modifiers: [bad(undefined), writer({ property: 'height', value: 44 })] })
      )
    );

    expect(node.properties.get('height')).toBe(44);
    expect(builder.modifiersFor(node)?.names).toEqual(['writer']);
    error.mockRestore();
  });

  it('does not swallow an unknown property name, which is a typo and not a fault', () => {
    const typo = defineModifier<void>({
      name: 'typo',
      attach(host) {
        host.set('widht', 1);
      }
    });

    expect(() => build(Column({}, Box({ modifiers: [typo(undefined)] })))).toThrow(/unknown property 'widht'/);
  });

  it('contains a throw from update and drops the modifier', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const flaky = defineModifier<number>({
      name: 'flaky',
      attach(host, value) {
        host.set('height', value);
      },
      update() {
        throw new Error('no');
      }
    });

    const { builder, node, rebuild } = build(Column({}, Box({ width: 200, modifiers: [flaky(20)] })));
    expect(node.properties.get('height')).toBe(20);

    rebuild(Column({}, Box({ width: 200, modifiers: [flaky(30)] })));

    expect(node.properties.get('height')).toBeUndefined();
    expect(builder.modifiersFor(node)?.names).toEqual([]);
    expect(error.mock.calls[0]?.[0]).toContain("UI modifier 'flaky' threw in update");
    error.mockRestore();
  });

  it('releases the node even when detach itself throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rude = defineModifier<void>({
      name: 'rude',
      attach(host) {
        host.set('height', 44);
      },
      detach() {
        throw new Error('no');
      }
    });

    const { node, rebuild } = build(Column({}, Box({ width: 200, modifiers: [rude(undefined)] })));
    rebuild(Column({}, Box({ width: 200 })));

    expect(node.properties.get('height')).toBeUndefined();
    expect(error.mock.calls[0]?.[0]).toContain("UI modifier 'rude' threw in detach");
    error.mockRestore();
  });
});
