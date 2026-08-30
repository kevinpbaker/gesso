import { BehaviorSubject } from 'rxjs';

export type PlaygroundDirection = 'column' | 'row';

/**
 * Reactive playground state.
 *
 * Every control on the page is a BehaviorSubject. The definition
 * produced by createDefinition() binds these directly through the
 * UiGraph binding system, so a control change flows through
 * RxJS → UiBinding → UiGraph → dirty node → scheduler → layout.
 */
export class PlaygroundState {
  readonly width$ = new BehaviorSubject(400);
  readonly height$ = new BehaviorSubject(300);

  /**
   * When true the root column fills the preview viewport instead
   * of honoring explicit width/height, so resizing the preview
   * re-constrains the tree.
   */
  readonly fitPreview$ = new BehaviorSubject(true);

  readonly padding$ = new BehaviorSubject(20);
  readonly gap$ = new BehaviorSubject(10);
  readonly direction$ = new BehaviorSubject<PlaygroundDirection>('column');

  /** flexGrow of the growing box inside the child row. */
  readonly flexGrow$ = new BehaviorSubject(1);

  /** Paint-only property: must not invalidate layout. */
  readonly color$ = new BehaviorSubject('#1f6feb');

  /**
   * Derived paint property. In the worker route this is computed in the
   * data worker to demonstrate heavy observable pipelines running off the
   * render thread; other routes keep it at its initial value.
   */
  readonly computedColor$ = new BehaviorSubject('#60a5fa');

  /** Fixed box width in the child row. */
  readonly boxWidth$ = new BehaviorSubject(100);
  /** Fixed box height in the child row. */
  readonly boxHeight$ = new BehaviorSubject(100);

  /** Min/max width demo applied to the nested column. */
  readonly minWidth$ = new BehaviorSubject(120);
  readonly maxWidth$ = new BehaviorSubject(320);

  /** Scroll offset of the scroll view. */
  readonly scrollY$ = new BehaviorSubject(0);

  /** Keyed item order. Items keep identity when this changes. */
  readonly order$ = new BehaviorSubject<string[]>(['a', 'b', 'c']);

  /** Stress-test subtree size (0 disables it). */
  readonly stressCount$ = new BehaviorSubject(0);

  /**
   * The parity section's bitmap, decoded asynchronously by the route
   * that mounts the state; undefined until then, and on routes that
   * never set it (the boxes then show their backgrounds).
   */
  readonly image$ = new BehaviorSubject<ImageBitmap | undefined>(undefined);

  /**
   * The parity section's icon, rasterised from a path by the Media
   * tier's own `IconRasterizer` rather than drawn by hand — so what the
   * compare route diffs is the thing `Icon` produces, not a
   * look-alike.
   */
  readonly icon$ = new BehaviorSubject<ImageBitmap | undefined>(undefined);
}
