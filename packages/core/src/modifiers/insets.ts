import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { UiInsetRegistry, type UiInsetEdge, type UiInsets } from '../environment/UiInsets';
import { defineModifier } from './UiModifier';

export interface PublishInsetArgs {
  /** Which edge this node is over. */
  readonly edge: UiInsetEdge;
  /**
   * How much space to claim, when the node's own box is not the
   * answer. Left out, the node publishes its measured height on a
   * horizontal edge and its width on a vertical one, which is what a
   * bar sitting across the bottom of a screen wants.
   */
  readonly extent?: number;
}

/**
 * Publishes the space this node occupies to the screens behind it.
 *
 * A floating bar, a toast rail, a docked player: anything drawn over
 * the content rather than in it takes room that the content has to be
 * kept clear of, and before this every screen worked that room out for
 * itself. In Segue seven screens each imported the queue channel, each
 * asked whether anything was playing, and each added the bar's height
 * from a constant, which is seven copies of a fact one component
 * already knew, and two more screens that used a different number.
 *
 * The bar publishes; the screens read. Neither knows about the other,
 * which is what makes it possible to add a second bar without editing
 * a screen.
 *
 * The contribution is retracted when the modifier detaches, so a bar
 * inside a `Presence` gives its room back as it leaves. It is
 * republished whenever the node's box changes, so a bar that grows
 * moves the content with it.
 *
 * Publishes into the nearest `UiInsetRegistry` the environment
 * carries. An application provides one on its root with the `insets`
 * prop; without one the registry the key defaults to is used, which
 * works for a single-window runtime and is what a spec gets.
 */
export const publishInset = defineModifier<PublishInsetArgs>({
  name: 'publishInset',
  attach(host, args) {
    const source = host.environment(UiEnvironmentKeys.insets);
    if (!(source instanceof UiInsetRegistry)) {
      // A source that is not a registry is somebody's read-only view of
      // one; there is nothing to publish into and nothing useful to do
      // about it beyond leaving the content where it is.
      return;
    }
    let write: ((next?: Partial<UiInsets>) => void) | null = null;
    const publish = (): void => {
      const box = host.layoutBox();
      if (box === null) {
        return;
      }
      const extent = args.extent ?? (args.edge === 'top' || args.edge === 'bottom' ? box.height : box.width);
      const insets = { [args.edge]: extent } as Partial<UiInsets>;
      if (write === null) {
        write = source.publish(insets);
      } else {
        write(insets);
      }
    };
    host.onLayout(publish);
    publish();
    host.own(() => {
      write?.();
      write = null;
    });
  }
});

export interface InsetPaddingArgs {
  /**
   * Padding to keep on each edge in addition to whatever is published
   * there. An edge left out is not written at all, so the element's
   * own padding on it stands.
   */
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

/**
 * Keeps a scrolling column clear of whatever is floating over it.
 *
 * The reading half of `publishInset`. `insetPadding({ bottom: 40 })`
 * is forty pixels of padding plus however much the bars, the keyboard
 * and the platform's safe area are currently taking at the bottom, and
 * it follows all three as they change.
 *
 * It writes `paddingBottom` and friends, so it composes with an
 * element that also sets `paddingX`: only the edges named here are
 * written.
 *
 * Physical edges rather than logical ones, because these are physical
 * facts. A soft keyboard is at the bottom of the screen in every
 * language, and a notch does not move when the reading does.
 */
export const insetPadding = defineModifier<InsetPaddingArgs>({
  name: 'insetPadding',
  attach(host, args) {
    const edges = (['top', 'right', 'bottom', 'left'] as const).filter(edge => args[edge] !== undefined);
    if (edges.length === 0) {
      return;
    }
    const properties: Record<UiInsetEdge, string> = {
      top: 'paddingTop',
      right: 'paddingRight',
      bottom: 'paddingBottom',
      left: 'paddingLeft'
    };
    const apply = (insets: UiInsets): void => {
      for (const edge of edges) {
        host.set(properties[edge], (args[edge] ?? 0) + insets[edge]);
      }
    };
    const source = host.environment(UiEnvironmentKeys.insets);
    let subscription = source.changes.subscribe(apply);
    // The registry is an environment value, so a subtree moved under a
    // different provider reads a different one. Rare, and cheap to be
    // right about: `onEnvironment` is exactly the notification a
    // modifier holding a value out of the environment needs.
    host.onEnvironment(() => {
      subscription.unsubscribe();
      subscription = host.environment(UiEnvironmentKeys.insets).changes.subscribe(apply);
    });
    host.own(() => subscription.unsubscribe());
  }
});
