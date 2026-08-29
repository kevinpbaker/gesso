import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../../graph/UiNodeType';
import type { UiNode } from '../../graph/UiNode';
import { LayoutHarness } from '../LayoutTestUtils';
import { Constraints } from '../LayoutTypes';
import type { LayoutBox } from '../LayoutTypes';
import { caseFingerprint, layoutCases } from './cases';
import type { CaseNode, LayoutCase } from './cases';
import type { ExpectedFixtures } from './expectedFixtures';
import type { MeasuredBox } from './toHtml';
// Vite's ?raw import keeps this spec free of node:fs and its types.
import expectedJson from './expected.json?raw';

/**
 * Chrome lays out in 1/64 px units and rounds when distributing
 * fractional free space; Nodal computes in floats. Anything under a
 * tenth of a pixel is agreement.
 */
const TOLERANCE = 0.1;

const REGENERATE = 'Run `pnpm fixtures:layout` to regenerate src/ui/layout/conformance/expected.json.';

const fixtures = loadFixtures();

describe('LayoutEngine conformance with Chrome', () => {
  it('has an expectation for every case, and no stale ones', () => {
    const defined = layoutCases.map(layoutCase => layoutCase.name).sort();
    const recorded = Object.keys(fixtures.cases).sort();
    expect(recorded, REGENERATE).toEqual(defined);
  });

  it('was generated from the current case definitions', () => {
    const stale = layoutCases
      .filter(layoutCase => fixtures.cases[layoutCase.name]?.fingerprint !== caseFingerprint(layoutCase))
      .map(layoutCase => layoutCase.name);
    expect(stale, REGENERATE).toEqual([]);
  });

  for (const layoutCase of layoutCases) {
    const expected = fixtures.cases[layoutCase.name];
    if (expected === undefined) {
      // The first test reports this; skip rather than fail twice.
      continue;
    }
    const run = () => {
      const actual = layoutWithNodal(layoutCase);
      const mismatches = compare(actual, expected.boxes);
      if (mismatches.length > 0) {
        throw new Error(
          `${layoutCase.name}: ${mismatches.length} box(es) differ from Chrome\n${mismatches.join('\n')}`
        );
      }
    };
    if (layoutCase.divergence !== undefined) {
      // A known disagreement. `it.fails` passes while the engine still
      // disagrees and fails the moment it agrees, so the note cannot
      // outlive the bug it describes.
      it.fails(`${layoutCase.name} — known divergence: ${layoutCase.divergence}`, run);
    } else {
      it(layoutCase.name, run);
    }
  }
});

// ---------------------------------------------------------------------------
// Nodal side
// ---------------------------------------------------------------------------

const NODE_TYPES: Record<CaseNode['type'], UiNodeType> = {
  row: UiNodeType.Row,
  column: UiNodeType.Column,
  box: UiNodeType.Box,
  text: UiNodeType.Text
};

function layoutWithNodal(layoutCase: LayoutCase): MeasuredBox[] {
  const harness = new LayoutHarness();
  const paths = new Map<UiNode, string>();
  const root = buildNode(harness, layoutCase.root, 'root', paths);
  harness.layout(root, Constraints.loose(layoutCase.viewport.width, layoutCase.viewport.height));

  // Records hold absolute layout-root coordinates, the same frame the
  // page script reports (relative to the case's viewport element).
  const boxes: MeasuredBox[] = [];
  const visit = (node: UiNode): void => {
    const box: LayoutBox = harness.box(node);
    boxes.push({ path: paths.get(node)!, ...box });
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(root);
  return boxes;
}

function buildNode(harness: LayoutHarness, definition: CaseNode, path: string, paths: Map<UiNode, string>): UiNode {
  // UiGraph owns a node called 'root' already; keep case ids out of its way.
  const node = harness.createNode(`case:${path}`, NODE_TYPES[definition.type]);
  paths.set(node, path);
  for (const [name, value] of Object.entries(definition.props)) {
    if (value !== undefined) {
      node.setProperty(name, value);
    }
  }
  definition.children.forEach((child, index) => {
    harness.append(node, buildNode(harness, child, `${path}/${index}`, paths));
  });
  return node;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function compare(actual: readonly MeasuredBox[], expected: readonly MeasuredBox[]): string[] {
  const expectedByPath = new Map(expected.map(box => [box.path, box]));
  const lines: string[] = [];
  for (const box of actual) {
    const reference = expectedByPath.get(box.path);
    if (reference === undefined) {
      lines.push(`  ${box.path}: Chrome reported no box`);
      continue;
    }
    const differing = (['x', 'y', 'width', 'height'] as const).filter(
      key => Math.abs(box[key] - reference[key]) > TOLERANCE
    );
    if (differing.length > 0) {
      lines.push(`  ${box.path}: nodal ${format(box)} vs chrome ${format(reference)}  (${differing.join(', ')})`);
    }
  }
  if (actual.length !== expected.length) {
    lines.push(`  box count: nodal ${actual.length} vs chrome ${expected.length}`);
  }
  return lines;
}

function format(box: MeasuredBox): string {
  const n = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
  return `[${n(box.x)}, ${n(box.y)} ${n(box.width)}×${n(box.height)}]`;
}

function loadFixtures(): ExpectedFixtures {
  return JSON.parse(expectedJson) as ExpectedFixtures;
}
