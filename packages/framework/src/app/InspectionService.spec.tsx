import { describe, expect, it } from 'vitest';

import { EditableText, transform, type UiChild, type UiNode } from 'gesso-core';
import { map } from 'rxjs';

import { Component } from '../Component';
import { controlled } from '../controlled';
import { Define, Input } from '../decorators';
import type { ComponentContext, Inputs } from '../FunctionComponent';
import { input } from '../Input';
import { InspectionService } from './InspectionService';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * A component asking what is under a point, as a design editor's canvas
 * does when a click picks a box instead of pressing it.
 */
describe('InspectionService', () => {
  it('names the nodes under a point, topmost first, and the line that wrote each', () => {
    let inspection!: InspectionService;
    function Canvas(_inputs: unknown, ctx: ComponentContext): UiChild {
      inspection = ctx.inject(InspectionService);
      return (
        <column padding={20}>
          <box width={200} height={100} backgroundColor="surface">
            <text text="Save" />
          </box>
        </column>
      );
    }
    const mounted = mountRuntime(
      <column>
        <Canvas />
      </column>
    );
    mounted.frame();

    const stack = inspection.nodesAt(30, 25);
    const report = inspection.inspect(stack[0]!);

    expect(stack.map(node => node.type).slice(0, 3)).toEqual(['text', 'box', 'column']);
    expect(report.type).toBe('text');
    expect(report.source?.fileName).toMatch(/InspectionService\.spec\.tsx$/);
    expect(report.owners[0]?.name).toBe('Canvas');
    // Outside it, the box is not there; the runtime's own root, also a box, is.
    expect(inspection.nodesAt(500, 500)).not.toContain(stack[1]);
    // Its box alone is the box the report has.
    expect(inspection.box(stack[1]!)).toEqual(inspection.inspect(stack[1]!).box);
    expect(inspection.box(stack[1]!)).toMatchObject({ x: 20, y: 20, width: 200, height: 100 });
  });

  it('tells where a node is seen under a scaled parent, and where it is laid out', () => {
    let inspection!: InspectionService;
    function Canvas(_inputs: unknown, ctx: ComponentContext): UiChild {
      inspection = ctx.inject(InspectionService);
      // A frame drawn at half its size, as a design tool fits one to its window.
      return (
        <column padding={20}>
          <column width={400} height={300} padding={40} transform={transform({ scaleX: 0.5, scaleY: 0.5 })}>
            <box width={200} height={100} backgroundColor="surface" />
          </column>
        </column>
      );
    }
    const mounted = mountRuntime(
      <column>
        <Canvas />
      </column>
    );
    mounted.frame();

    const box = inspection.nodesAt(50, 50).find(node => node.getProperty('width') === 200)!;

    expect(inspection.box(box)).toMatchObject({ x: 60, y: 60, width: 200, height: 100 });
    expect(inspection.screenBox(box)).toMatchObject({ x: 40, y: 40, width: 100, height: 50 });
  });

  it('previews a value over the element’s own until the preview ends', () => {
    let inspection!: InspectionService;
    function Canvas(_inputs: unknown, ctx: ComponentContext): UiChild {
      inspection = ctx.inject(InspectionService);
      return (
        <column>
          <box width={200} height={100} padding={8} />
        </column>
      );
    }
    const mounted = mountRuntime(<Canvas />);
    mounted.frame();
    const box = inspection.nodesAt(10, 10).find(node => node.type === 'box' && node.getProperty('width') === 200)!;

    inspection.preview(box, 'width', 320);
    inspection.preview(box, 'padding', 24);
    mounted.frame();
    expect(inspection.inspect(box).box.width).toBe(320);
    expect(box.getProperty('padding')).toBe(24);

    inspection.endPreview(box, 'width');
    mounted.frame();
    expect(inspection.inspect(box).box.width).toBe(200);
    expect(box.getProperty('padding')).toBe(24);

    inspection.endPreview(box);
    mounted.frame();
    expect(box.getProperty('padding')).toBe(8);
  });

  it('previews a component’s inputs over its parent’s, live, until the preview ends', () => {
    let inspection!: InspectionService;
    let turn!: () => void;
    /** A field drawn with its error under it, and a switch that owns what it was started at. */
    function Field(
      inputs: Inputs<{
        label: string;
        error?: string;
        on?: boolean;
        defaultOn?: boolean;
        onChange?: (on: boolean) => void;
      }>
    ): UiChild {
      const on = controlled({
        component: 'Field',
        name: 'on',
        source: inputs.on,
        initial: inputs.defaultOn,
        fallback: false,
        onChange: inputs.onChange
      });
      turn = () => on.change(!on.current());
      return (
        <column>
          <text text={inputs.label} />
          <text text={inputs.error.pipe(map(error => error ?? ''))} />
          <text text={on.value.pipe(map(value => (value ? 'on' : 'off')))} />
        </column>
      );
    }
    function Canvas(_inputs: unknown, ctx: ComponentContext): UiChild {
      inspection = ctx.inject(InspectionService);
      return (
        <column>
          <Field label="Email" on={true} />
        </column>
      );
    }
    const mounted = mountRuntime(
      <column>
        <Canvas />
      </column>
    );
    mounted.frame();
    const texts = (): string[] => {
      const out: string[] = [];
      const visit = (node: UiNode): void => {
        if (node.type === 'text') {
          out.push(String(node.getProperty('text')));
        }
        for (let child = node.firstChild; child !== null; child = child.nextSibling) {
          visit(child);
        }
      };
      visit(mounted.runtime.debugRoot());
      return out;
    };
    const label = inspection.nodesAt(5, 5).find(node => node.type === 'text')!;
    const anchor = inspection.inspect(label).owners.find(owner => owner.name === 'Field')!.anchorId;
    expect(texts()).toEqual(['Email', '', 'on']);

    // A person turns it off; jumped to a state written on, it is on again.
    turn();
    mounted.frame();
    expect(texts()).toEqual(['Email', '', 'off']);
    inspection.previewInputs(anchor, { error: 'We couldn’t find that email.', on: true });
    mounted.frame();
    expect(texts()).toEqual(['Email', 'We couldn’t find that email.', 'on']);

    // Ended, it is as written: no error, and on, as the parent passed it.
    turn();
    mounted.frame();
    inspection.endInputPreview(anchor);
    mounted.frame();
    expect(texts()).toEqual(['Email', '', 'on']);
  });

  it('gives a class component back its own default for an input its parent leaves out', () => {
    let inspection!: InspectionService;
    @Define('badge')
    class Badge extends Component {
      @Input() tone = input('neutral');
      override render(): UiChild {
        return <text text={this.tone} />;
      }
    }
    function Canvas(_inputs: unknown, ctx: ComponentContext): UiChild {
      inspection = ctx.inject(InspectionService);
      return (
        <column>
          <Badge />
        </column>
      );
    }
    const mounted = mountRuntime(
      <column>
        <Canvas />
      </column>
    );
    mounted.frame();
    const text = inspection.nodesAt(5, 5).find(node => node.type === 'text')!;
    const anchor = inspection.inspect(text).owners.find(owner => owner.name === 'badge')!.anchorId;

    inspection.previewInputs(anchor, { tone: 'danger' });
    mounted.frame();
    expect(text.getProperty('text')).toBe('danger');
    inspection.endInputPreview(anchor);
    mounted.frame();
    expect(text.getProperty('text')).toBe('neutral');
  });

  it('presses a node with no record of its own, and types into a field, as a person would', () => {
    let inspection!: InspectionService;
    const pressed: string[] = [];
    const typed: string[] = [];
    let row!: UiNode;
    function Canvas(_inputs: unknown, ctx: ComponentContext): UiChild {
      inspection = ctx.inject(InspectionService);
      // A list's row, pressable and not a control, inside a frame that watches every press (a prototype player).
      return (
        <column padding={20} onClick={() => pressed.push('frame')}>
          <box
            width={200}
            height={40}
            ref={(node: UiNode | null) => void (node !== null && (row = node))}
            onClick={() => pressed.push('row')}
          />
          {EditableText({ value: '', label: 'Email', onInput: event => typed.push(event.value) })}
        </column>
      );
    }
    const mounted = mountRuntime(<Canvas />);
    mounted.frame();

    expect(inspection.act(row, 'click')).toBe(true);
    const field = inspection.nodesAt(30, 75).find(node => node.type !== 'column')!;
    expect(inspection.act(field, 'setValue', 'ada@example.com')).toBe(true);

    expect(pressed).toEqual(['row', 'frame']);
    expect(typed.at(-1)).toBe('ada@example.com');
    // A row is no field: nothing is typed, and none other than the one named takes the text.
    expect(inspection.act(row, 'setValue', 'grace')).toBe(false);
    expect(typed.at(-1)).toBe('ada@example.com');
  });
});
