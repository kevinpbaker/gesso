import type { UiNode } from 'gesso-core';

import type { UiNodeReport } from './NodeReport';

/**
 * What is on the screen, as a component can ask: the nodes under a
 * point, and what each one is.
 *
 * The inspector already answers both, for the devtools panel, from the
 * runtime's hit tester and its node report. A tool built in Gesso that
 * points at Gesso needs the same answers from inside the tree: a design
 * editor whose canvas holds live frames, where a click picks the box
 * under it instead of pressing it and says which line wrote it. So the
 * runtime puts them here, as it puts frames in `FrameService`.
 * Injected like any service: `ctx.inject(InspectionService)`.
 */
export class InspectionService {
  private host: InspectionHost | null = null;

  /** Called by the runtime; not for components. */
  attach(host: InspectionHost): void {
    this.host = host;
  }

  /**
   * Every node under a point, topmost first, in the coordinates a
   * pointer event carries: the one a press would reach, then each one
   * it is painted over. Empty before the first frame.
   */
  nodesAt(x: number, y: number): readonly UiNode[] {
    return this.host?.nodesAt(x, y) ?? [];
  }

  /**
   * What the node is, as the inspector reports it: its box, its props,
   * the components that rendered it and, compiled for development, the
   * line that wrote it (`source`) and where each of those components
   * was used (`owners[].usedAt`).
   */
  inspect(node: UiNode): UiNodeReport {
    if (this.host === null) {
      throw new Error('InspectionService has nothing to inspect before the runtime has built its tree.');
    }
    return this.host.inspect(node);
  }

  /**
   * Where the node is drawn, as `inspect(node).box` reports it, without
   * the rest of the report: for an editor that reads the boxes of many
   * nodes as its view moves (a minimap of a board of frames), where
   * building each node's props, owners and source was most of the cost.
   */
  box(node: UiNode): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
    if (this.host === null) {
      throw new Error('InspectionService has nothing to measure before the runtime has built its tree.');
    }
    return this.host.box?.(node) ?? this.host.inspect(node).box;
  }

  /**
   * Where the node is seen on the screen: `box` with every transform
   * above it applied, so a node in a frame drawn at half its size is
   * half its size, where it is drawn. What an overlay laid over the
   * live tree is placed by (an outline on the component under the
   * pointer). `box` keeps the untransformed box, which is where the
   * node is in the layout: what an editor reading a zoomed board in
   * the board's own coordinates (a minimap) needs.
   */
  screenBox(node: UiNode): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
    if (this.host === null) {
      throw new Error('InspectionService has nothing to measure before the runtime has built its tree.');
    }
    return this.host.screenBox?.(node) ?? this.box(node);
  }

  /**
   * Draws a node as though it declared `value` for `property`, until
   * the preview is ended or the node leaves the tree.
   *
   * What a design editor shows while a value is being chosen: a padding
   * dragged or a colour hovered in a list is drawn at once, on the
   * live tree, and only written to the source when the designer lets go.
   * It wins over the element's own value and over its modifiers, and
   * ending it restores whichever of those was there, inheritance
   * included. The name and value are a prop's, as JSX would write them.
   */
  preview(node: UiNode, property: string, value: unknown): void {
    this.host?.preview?.(node, property, value);
  }

  /** Ends a preview of one property, or of every property previewed on the node. */
  endPreview(node: UiNode, property?: string): void {
    this.host?.endPreview?.(node, property);
  }

  /**
   * Draws a component as though its parent passed `inputs`, over what
   * the parent did pass, until the preview is ended or the component
   * leaves the tree. The component is named by its anchor, as
   * `inspect(node).owners[].anchorId` gives it.
   *
   * What a design editor shows when a component on a played screen is
   * jumped to one of its states (Filled, Error, Disabled): the same
   * instance, still live, given that state's inputs, and the inputs it
   * was written with back when the preview ends. A later preview of the
   * same component replaces this one. The names and values are props',
   * as JSX would write them. An anchor no component holds is ignored.
   */
  previewInputs(anchorId: string, inputs: Readonly<Record<string, unknown>>): void {
    this.host?.previewInputs?.(anchorId, inputs);
  }

  /** Ends a preview of a component's inputs: its parent's are its own again. */
  endInputPreview(anchorId: string): void {
    this.host?.previewInputs?.(anchorId, null);
  }

  /**
   * Presses a node, or replaces the text of the field it is, as a
   * person would: a click at the middle of where it is drawn, which
   * its handlers and every handler above it get, or the edit a
   * keyboard makes once it has focus. The path the accessibility
   * mirror's actions take, for any node in the tree, record or not.
   *
   * What a design editor's agent does to play a prototype in its live
   * frames: a row pressed, an email typed, by a node it found with
   * `nodesAt` or by walking the tree. False when it did not take: a
   * node no longer in the tree, or a field that could not have focus
   * because an open dialog's trap holds it, or takes no text.
   */
  act(node: UiNode, action: 'click' | 'setValue', value?: string): boolean {
    if (this.host?.act === undefined) {
      throw new Error('InspectionService cannot act before the runtime has built its tree.');
    }
    return this.host.act(node, action, value);
  }
}

/** What the runtime gives the service. */
export interface InspectionHost {
  nodesAt(x: number, y: number): readonly UiNode[];
  inspect(node: UiNode): UiNodeReport;
  /** The node's box alone, as `inspect` reports it. */
  box?(node: UiNode): { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** The node's box with the transforms above it applied. */
  screenBox?(node: UiNode): { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  preview?(node: UiNode, property: string, value: unknown): void;
  endPreview?(node: UiNode, property?: string): void;
  /** Null ends the preview. */
  previewInputs?(anchorId: string, inputs: Readonly<Record<string, unknown>> | null): void;
  act?(node: UiNode, action: 'click' | 'setValue', value?: string): boolean;
}
