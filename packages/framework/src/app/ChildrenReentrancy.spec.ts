import { describe, expect, it } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';
import { Column, Row, Text, type UiNode } from 'gesso-core';
import { createComponent } from '../createComponent';
import type { ComponentContext, Inputs } from '../FunctionComponent';
import { mountRuntime } from './RuntimeTestUtils';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Keyed component children under churn: lists that add, drop and
 * reorder keys thousands of times, with component bodies that emit
 * into the very list being reconciled. After every step, every node
 * the graph registers must be reachable from the root and every
 * sibling chain consistent. Found two defects in one go: insertBefore
 * moved lastChild onto the inserted node, and a re-entrant emission
 * ran a second pass under the first. Set REENTRANT=0 to run without
 * the re-entrant emissions.
 */
describe('keyed children under churn', () => {
  it('keeps every registered node reachable and every chain consistent', () => {
    const pool = [
      'en',
      'ja',
      'pt',
      'ko',
      'ne',
      'de',
      'fr',
      'es',
      'it',
      'ru',
      'zh',
      'ar',
      'tr',
      'nl',
      'mg',
      'eu',
      'ce',
      'mul'
    ];
    const langs = new BehaviorSubject<string[]>(['en', 'ja']);
    const random = rng(7);
    let reentrant = import.meta.env.REENTRANT === '0' ? 1000 : 0;
    const history: string[] = [];
    function Chip(inputs: Inputs<{ label: string }>, _ctx: ComponentContext) {
      if (random() < 0.15 && reentrant < 400) {
        reentrant++;
        const current = langs.value.slice();
        current.sort(() => random() - 0.5);
        if (random() < 0.5) current.push(pool[Math.floor(random() * pool.length)]!);
        const list = [...new Set(current)];
        history.push(`  re-entrant -> [${list.join(',')}]`);
        langs.next(list);
      }
      return Row({ height: 20 }, Text({ text: inputs.label }));
    }
    function App(_inputs: Inputs<{}>, _ctx: ComponentContext) {
      return Column(
        { width: 400, height: 200 },
        Row({ gap: 4 }, langs.pipe(map(list => list.map(lang => createComponent(Chip, { label: lang }, lang)))))
      );
    }
    const mounted = mountRuntime(createComponent(App));
    const graph = (mounted.runtime as unknown as { graph: { nodes: Map<string, UiNode> } }).graph;
    let time = 0;
    const chainOf = (node: UiNode) => {
      const out: string[] = [];
      for (let c = node.firstChild; c !== null; c = c.nextSibling) out.push(c.id.slice(c.id.lastIndexOf(':') + 1));
      return `[${out.join(',')}] last=${node.lastChild?.id.slice(node.lastChild.id.lastIndexOf(':') + 1)}`;
    };
    const check = (step: number) => {
      const roots = [...graph.nodes.values()].filter(node => node.parent === null);
      if (roots.length !== 1) {
        throw new Error(`step ${step}: ${roots.length} parentless nodes: ${roots.map(r => r.id).join(', ')}`);
      }
      const reachable = new Set<UiNode>();
      const stack = [roots[0]!];
      while (stack.length > 0) {
        const node = stack.pop()!;
        reachable.add(node);
        let previous: UiNode | null = null;
        for (let child = node.firstChild; child !== null; child = child.nextSibling) {
          if (child.parent !== node || child.previousSibling !== previous) {
            throw new Error(
              `step ${step}: chain of ${node.id} broken at ${child.id}: ${chainOf(node)}\n${history.slice(-6).join('\n')}`
            );
          }
          previous = child;
          stack.push(child);
        }
        if (node.lastChild !== previous) {
          throw new Error(
            `step ${step}: lastChild of ${node.id} wrong: ${chainOf(node)}\n${history.slice(-6).join('\n')}`
          );
        }
      }
      for (const node of graph.nodes.values()) {
        if (!reachable.has(node)) {
          throw new Error(`step ${step}: registered but unreachable: ${node.id} (parent ${node.parent?.id ?? 'null'})`);
        }
      }
    };
    mounted.frame((time += 16));
    check(0);
    for (let step = 1; step <= 3000; step++) {
      const count = 1 + Math.floor(random() * 12);
      const next = pool
        .slice()
        .sort(() => random() - 0.5)
        .slice(0, count);
      history.push(`step ${step} -> [${next.join(',')}]`);
      langs.next(next);
      if (random() < 0.5) {
        history.push(`  frame`);
        mounted.frame((time += 16));
      }
      check(step);
    }
    expect(true).toBe(true);
  });
});
