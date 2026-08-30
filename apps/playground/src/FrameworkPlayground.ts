import { map } from 'rxjs';
import {
  Accordion,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  Divider,
  FindBar,
  Icon,
  Image,
  LazyList,
  Menu,
  ProgressBar,
  Select,
  Spinner,
  SplitPane,
  Tabs,
  TextInput,
  Toast,
  Toolbar,
  Tree,
  type DataTableSort,
  type TreeNode
} from '@gesso/components';
import {
  FocusService,
  AnimationService,
  OverlayService,
  Component,
  createComponent,
  Channel,
  Define,
  Inject,
  Input,
  internalState,
  input,
  type ChannelReplica
} from '@gesso/framework';
import {
  darkTheme,
  lightTheme,
  animateLayout,
  focusRing,
  interactive,
  spring,
  tween,
  Box,
  Button,
  Column,
  EditableText,
  Grid,
  LazyColumn,
  Row,
  ScrollView,
  Text,
  auto,
  fr,
  percent,
  repeat,
  type UiNode,
  type UiElement
} from '@gesso/core';

import { createDemoBitmap } from './demoBitmap';
import { Heavy } from './HeavyWork';
import { Ticker, type TickerCommands, type TickerView } from './TickerChannel';
import type { HeavyCommands, HeavyStatus } from './HeavyWork';

/**
 * Demo store used by the framework playground.
 *
 * Owned by the single-thread app runtime and injected into components
 * with `@Inject()`. Actions are the only way to mutate store state.
 */
/**
 * Shared state that never leaves this thread, as a service.
 *
 * The counterpart to `Heavy` and `Ticker` below, which are channels.
 * A service is a plain class the runtime hands out and a component
 * simply calls; a channel is application state on another thread,
 * reached through view keys and commands. The playground shows both,
 * because knowing which of the two a thing is is the decision the
 * thread model asks an application to make.
 */
export class DemoCounter {
  readonly clicks = internalState(0);

  readonly summary = this.clicks.pipe(map(clicks => ({ clicks, parity: clicks % 2 === 0 ? 'even' : 'odd' })));

  increment(): void {
    this.clicks.value++;
  }
}

/**
 * A component that demonstrates local state driven by a click.
 *
 * The button carries a declarative `onClick` prop, so the handler is
 * registered on the input dispatcher during reconciliation. Pressing
 * it mutates local state, whose emission flows through the binding
 * pipeline to the canvas with no re-render.
 */
@Define('local-counter')
export class LocalCounter extends Component {
  readonly count = internalState(0);

  increment(): void {
    this.count.value++;
  }

  override render(): UiElement {
    return Row(
      { gap: 12, y: 'center' },
      Text({
        text: this.count.pipe(map(c => `Local count: ${c}`)),
        color: '#e5e7eb'
      }),
      Button(
        {
          onClick: () => this.increment(),
          color: '#ffffff',
          backgroundColor: '#10b981',
          width: 44,
          height: 32,
          borderRadius: 4
        },
        Text({ text: '+1', color: '#ffffff' })
      )
    );
  }
}

/**
 * A component that demonstrates store injection and dispatched actions.
 *
 * Clicking dispatches a store action; the store's state emission
 * reaches this component's text binding and the keyed list below
 * through the same selector pipeline.
 */
@Define('store-counter')
export class StoreCounter extends Component {
  @Inject(DemoCounter) demo!: DemoCounter;

  override render(): UiElement {
    return Row(
      { gap: 12, y: 'center' },
      Text({
        text: this.demo.summary.pipe(map(s => `Store count: ${s.clicks} (${s.parity})`)),
        color: '#e5e7eb'
      }),
      Button(
        {
          onClick: () => this.demo.increment(),
          color: '#ffffff',
          backgroundColor: '#1f6feb',
          width: 80,
          height: 32,
          borderRadius: 4
        },
        Text({ text: 'Add', color: '#ffffff' })
      )
    );
  }
}

/**
 * A component rendered from inside an observable list.
 *
 * Instances of this class are created and destroyed by emissions of
 * the store selector below, which is the capability Phase A added:
 * before it, a component reaching UiGraphBuilder from inside an
 * observable child threw.
 */
@Define('tick-item')
export class TickItem extends Component {
  @Input() label = input('');

  override render(): UiElement {
    return Row(
      { gap: 8, y: 'center' },
      Box({ width: 10, height: 10, backgroundColor: '#38bdf8', borderRadius: 5 }),
      Text({ text: this.label, color: '#cbd5f5' })
    );
  }
}

/**
 * A component that animates continuously from a timer it owns.
 *
 * The timer runs on whichever thread the component runtime lives on.
 * In the worker configuration that is the render worker, so blocking
 * the main thread leaves this ticking; in the single-thread
 * configuration it freezes along with everything else. That contrast
 * is the whole point of the two routes.
 */
@Define('heartbeat')
export class Heartbeat extends Component {
  readonly ticks = internalState(0);

  private timer: ReturnType<typeof setInterval> | null = null;

  override onMount(): void {
    this.timer = setInterval(() => {
      this.ticks.value++;
    }, 100);
  }

  override onUnmount(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  override render(): UiElement {
    return Column(
      { gap: 6, x: 'start' },
      Text({
        text: this.ticks.pipe(map(t => `Heartbeat: ${t} (10/sec while the UI thread is free)`)),
        color: '#e5e7eb'
      }),
      Box({
        // A bar that sweeps back and forth, so a stalled frame is
        // obvious at a glance rather than needing a number read.
        width: this.ticks.pipe(map(t => 40 + Math.abs(((t % 60) - 30) * 8))),
        height: 12,
        backgroundColor: '#38bdf8',
        borderRadius: 6
      })
    );
  }
}

/**
 * The barrier contract, live (roadmap A2).
 *
 * Nothing here knows where the data comes from: `Ticker` is a name and
 * a shape, and its view keys arrive as input cells exactly as props
 * do. The application behind it — a plain view model over a plain
 * subject — lives in the data worker and shares nothing with this file
 * but the token.
 */
@Define('channel-demo')
export class ChannelDemo extends Component {
  @Channel(Ticker) ticker!: ChannelReplica<TickerView, TickerCommands>;

  override render(): UiElement {
    return Row(
      { gap: 12, y: 'center' },
      Text({ text: this.ticker.view.label, color: '#9ca3af' }),
      Button(
        {
          onClick: () => this.ticker.send.step(10),
          color: '#ffffff',
          backgroundColor: '#0ea5e9',
          width: 90,
          height: 26,
          borderRadius: 4
        },
        Text({ text: '+10', color: '#ffffff' })
      ),
      Button(
        {
          onClick: () => this.ticker.send.reset(),
          color: '#ffffff',
          backgroundColor: '#64748b',
          width: 90,
          height: 26,
          borderRadius: 4
        },
        Text({ text: 'Reset', color: '#ffffff' })
      )
    );
  }
}

/**
 * Drives a store that lives in a data worker.
 *
 * The button dispatches an action that burns 1.5 seconds of CPU. It
 * runs in the data worker, so neither this thread nor the main thread
 * notices: the heartbeat above keeps its cadence throughout.
 */
@Define('heavy-panel')
export class HeavyPanel extends Component {
  @Channel(Heavy) heavy!: ChannelReplica<{ status: HeavyStatus }, HeavyCommands>;

  override render(): UiElement {
    return Column(
      { gap: 8, x: 'start' },
      Row(
        { gap: 12, y: 'center' },
        Text({
          text: this.heavy.view.status.pipe(
            map(status =>
              status === undefined
                ? 'Data worker: connecting…'
                : `Data worker: ${status.runs} runs · checksum ${status.checksum} · last ${status.lastDurationMs}ms`
            )
          ),
          color: '#e5e7eb'
        }),
        Button(
          {
            onClick: () => this.heavy.send.compute(),
            color: '#ffffff',
            backgroundColor: '#a855f7',
            width: 150,
            height: 32,
            borderRadius: 4
          },
          Text({ text: 'Burn 1.5s', color: '#ffffff' })
        )
      )
    );
  }
}

@Define('text-showcase')
export class TextShowcase extends Component {
  /**
   * Text as a layout citizen (roadmap L1), in one card: a title clamped
   * to two lines with an ellipsis, a paragraph that wraps at the card's
   * content width, and a label/value row whose different font sizes
   * share a baseline.
   */
  override render(): UiElement {
    return Column(
      {
        width: 340,
        padding: 16,
        gap: 10,
        backgroundColor: '#1f2937',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#374151'
      },
      Text({
        text: 'A title long enough that it cannot possibly fit on two lines of this card, so it is clamped with an ellipsis',
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 600,
        maxLines: 2,
        textOverflow: 'ellipsis'
      }),
      Text({
        text: "Text now wraps at the width layout gives it. Flex measures items at max-content for their base size, resolves the main axis, and measures again at the final size, so this paragraph's height is known before the card is placed.",
        color: '#d1d5db',
        fontSize: 13
      }),
      Row(
        { gap: 8, y: 'baseline' },
        Text({ text: 'Frame', color: '#9ca3af', fontSize: 12 }),
        Text({ text: '2.4 ms', color: '#ffffff', fontSize: 24, fontWeight: 600 }),
        Text({ text: 'worst 4.1 ms', color: '#9ca3af', fontSize: 12 })
      )
    );
  }
}

/**
 * Text editing (roadmap F2): a single-line field and a multi-line one.
 * Both are `EditableText` nodes; the runtime owns the caret, selection,
 * composition and undo, and reports every change through `onInput`.
 * The fields here are controlled — the value written back is the value
 * shown — and the character count follows the same cell.
 */
@Define('text-field-demo')
export class TextFieldDemo extends Component {
  readonly name = internalState('Ada');
  readonly notes = internalState('Type here. Enter makes a new line; the field grows with it.');

  override render(): UiElement {
    return Column(
      {
        width: 340,
        padding: 16,
        gap: 10,
        backgroundColor: '#1f2937',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#374151'
      },
      Text({ text: 'Text fields (F2)', color: '#ffffff', fontSize: 16, fontWeight: 600 }),
      EditableText({
        value: this.name,
        placeholder: 'Your name',
        onInput: event => (this.name.value = event.value),
        color: '#ffffff',
        fontSize: 14,
        textWrap: 'none',
        padding: 8,
        borderRadius: 6,
        backgroundColor: '#111827',
        borderWidth: 1,
        borderColor: '#374151'
      }),
      EditableText({
        value: this.notes,
        multiline: true,
        placeholder: 'Notes',
        onInput: event => (this.notes.value = event.value),
        color: '#d1d5db',
        fontSize: 13,
        padding: 8,
        minHeight: 60,
        borderRadius: 6,
        backgroundColor: '#111827',
        borderWidth: 1,
        borderColor: '#374151'
      }),
      Text({
        text: this.notes.pipe(map(text => `${text.length} characters · hello, ${this.name.value || 'stranger'}`)),
        color: '#9ca3af',
        fontSize: 12
      })
    );
  }
}

/**
 * Overlays (roadmap L2): a menu anchored to a button through a `ref`,
 * opened through the OverlayService. The button sits inside a short
 * scroll view near the bottom of the page, so the menu flips upward
 * when there is no room below and follows the button as the list
 * scrolls; a press anywhere else closes it.
 */
@Define('menu-demo')
export class MenuDemo extends Component {
  @Inject(OverlayService) overlays!: OverlayService;

  private anchor: UiNode | null = null;
  private noteAnchor: UiNode | null = null;
  private choice = internalState('Nothing chosen yet');

  /**
   * A popover with no backdrop: it stays open while the page and the
   * list scroll, and the engine keeps it beside its button.
   */
  private toggleNote(): void {
    if (this.overlays.isOpen('menu-demo-note')) {
      this.overlays.close('menu-demo-note');
      return;
    }
    this.overlays.open({
      id: 'menu-demo-note',
      anchor: this.noteAnchor,
      placement: 'right-start',
      offset: 8,
      content: Column(
        { backgroundColor: '#3b2f0b', borderColor: '#a16207', borderWidth: 1, borderRadius: 6, padding: 8, width: 200 },
        Text({
          text: 'Pinned: no backdrop, so scrolling underneath keeps working and I follow my button.',
          color: '#fde68a',
          fontSize: 12
        })
      )
    });
  }

  private open(): void {
    this.overlays.open({
      id: 'menu-demo',
      anchor: this.anchor,
      placement: 'bottom-start',
      offset: 4,
      dismissOnOutsidePress: true,
      content: Column(
        {
          backgroundColor: '#1f2937',
          borderColor: '#374151',
          borderWidth: 1,
          borderRadius: 6,
          padding: 4,
          gap: 2,
          width: 180
        },
        ...['Rename', 'Duplicate', 'Move to…', 'Delete'].map(label =>
          Button({
            text: label,
            color: label === 'Delete' ? '#f87171' : '#e5e7eb',
            fontSize: 13,
            padding: 8,
            borderRadius: 4,
            onClick: () => {
              this.choice.value = `Chose “${label}”`;
              this.overlays.close('menu-demo');
            }
          })
        )
      )
    });
  }

  override render(): UiElement {
    return Column(
      { gap: 8 },
      Text({ text: 'Anchored menu: opens below, flips up near the edge, follows the scroll.', color: '#9ca3af' }),
      Row(
        { gap: 12, y: 'center' },
        ScrollView(
          { width: 220, height: 72, backgroundColor: '#111827', borderRadius: 6, padding: 8, gap: 8 },
          Text({ text: 'Scroll me ↓', color: '#6b7280', fontSize: 12 }),
          Text({ text: 'The button is below.', color: '#6b7280', fontSize: 12 }),
          Button({
            ref: (node: UiNode | null) => {
              this.anchor = node;
            },
            text: 'Actions ▾',
            color: '#ffffff',
            backgroundColor: '#1f6feb',
            padding: 8,
            borderRadius: 4,
            onClick: () => this.open()
          }),
          Button({
            ref: (node: UiNode | null) => {
              this.noteAnchor = node;
            },
            text: 'Pin a note',
            color: '#fde68a',
            backgroundColor: '#3b2f0b',
            padding: 8,
            borderRadius: 4,
            onClick: () => this.toggleNote()
          }),
          Text({ text: 'More content underneath.', color: '#6b7280', fontSize: 12 })
        ),
        Text({ text: this.choice, color: '#d1d5db' })
      )
    );
  }
}

/**
 * Root component for the framework playground.
 *
 * Composes static and dynamic content to verify that the framework
 * component runtime, store injection, local state, and Canvas2D
 * renderer all work together in a single-thread app.
 */
/**
 * Overflow (roadmap L4): a rounded card clips a box that spills past
 * it, and a list with a sticky header scrolls under it while Tab moves
 * focus through rows that scroll themselves into view.
 */
/**
 * Modifiers (roadmap B1 and B3): behaviour attached to an element, and
 * the one thing a modifier may put on screen.
 *
 * The options are module constants because a modifier's arguments are
 * compared by identity, as props are — rebuilt objects would re-attach
 * the modifier on every render. Toggling the plain box's modifier off
 * shows the override layer handing the declared colour back.
 *
 * The three buttons on the second row carry `focusRing()`: Tab through
 * them and the ring follows, and the one inside the little scroller is
 * clipped by it when it is only half in view — which is the whole
 * argument for decorations being painted inside a node's own paint
 * pass rather than over the finished frame.
 */
const CARD_INTERACTION = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: '#1f2937', borderColor: '#60a5fa' },
  pressed: { backgroundColor: '#0b1220', borderColor: '#93c5fd' }
});

const BUTTON_STYLES = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: '#1d4ed8' },
  pressed: { backgroundColor: '#1e3a8a' }
});

@Define('modifier-demo')
export class ModifierDemo extends Component {
  private attached = internalState(true);

  private card(attached: boolean): UiElement {
    return Box(
      {
        modifiers: attached ? [CARD_INTERACTION] : [],
        width: 160,
        height: 56,
        padding: 10,
        backgroundColor: '#111827',
        borderColor: '#374151',
        borderWidth: 1,
        borderRadius: 8
      },
      Text({ text: attached ? 'A plain box' : 'Detached', color: '#e5e7eb', fontSize: 12 })
    );
  }

  override render(): UiElement {
    return Column(
      { gap: 8, x: 'start' },
      Text({ text: 'Modifiers (B1)', color: '#e5e7eb', fontWeight: 600 }),
      Text({
        text: 'Hover and press: one modifier writes visualState and the colours, and detaching restores what the element declared.',
        color: '#9ca3af',
        fontSize: 12,
        maxLines: 2
      }),
      Row(
        { gap: 12, y: 'center' },
        Button({
          text: 'Hover me',
          modifiers: [BUTTON_STYLES],
          padding: 10,
          backgroundColor: '#2563eb',
          borderRadius: 6,
          color: '#ffffff'
        }),
        // The list of modifiers is static per element, as props are, so
        // detaching means rendering a different element — an observable
        // child, which is the framework's existing answer to structural
        // change.
        this.attached.pipe(map(on => this.card(on))),
        stepButton('Attach / detach', () => {
          this.attached.value = !this.attached.value;
        })
      ),
      Text({
        text: 'Focus rings (B3): Tab through these. The ring is a decoration, so the one in the scroller is cut off with its row.',
        color: '#9ca3af',
        fontSize: 12,
        maxLines: 2
      }),
      Row(
        { gap: 12, y: 'start' },
        ringButton('First'),
        ringButton('Second'),
        Column(
          { width: 150, height: 64, overflow: 'scroll', borderRadius: 8, backgroundColor: '#0b1220', padding: 6 },
          ...Array.from({ length: 5 }, (_, i) => ringButton(`Row ${i + 1}`, 'row'))
        )
      )
    );
  }
}

/** A button that shows the focus ring and nothing else. */
function ringButton(text: string, key?: string): UiElement {
  return Button({
    key: key === undefined ? undefined : `${key}-${text}`,
    text,
    modifiers: [focusRing()],
    padding: 8,
    marginBottom: 4,
    flexShrink: 0,
    backgroundColor: '#1f2937',
    borderRadius: 6,
    color: '#e5e7eb',
    fontSize: 12
  });
}

/**
 * The Inputs tier (roadmap C3): a sign-in form built from
 * `@gesso/components` with no hand-rolled widget and no colour in it.
 *
 * Every control is themed through the control tokens, carries its own
 * role, name and states, and is operable from the keyboard. Submitting
 * with an empty field puts the caret in it through `FocusService`, which
 * is the thing a component could not do before C0.
 */
@Define('sign-in-form-demo')
export class SignInFormDemo extends Component {
  @Inject(FocusService) focus!: FocusService;

  readonly email = internalState('');
  readonly passcode = internalState('');
  readonly remember = internalState(true);
  readonly emailError = internalState('');
  readonly passcodeError = internalState('');
  readonly status = internalState('');

  private emailField: UiNode | null = null;
  private passcodeField: UiNode | null = null;

  private submit(): void {
    const missingEmail = this.email.value.trim().length === 0;
    const missingPasscode = this.passcode.value.trim().length === 0;
    this.emailError.value = missingEmail ? 'Enter your email address' : '';
    this.passcodeError.value = missingPasscode ? 'Enter your passcode' : '';
    this.status.value = missingEmail || missingPasscode ? '' : `Signed in as ${this.email.value}`;
    // The caret goes to the first field that failed, which is what a
    // form has to be able to do and what FocusService exists for.
    const offending = missingEmail ? this.emailField : missingPasscode ? this.passcodeField : null;
    if (offending !== null) {
      this.focus.focus(offending);
    }
  }

  override render(): UiElement {
    return Column(
      {
        width: 340,
        padding: 16,
        gap: 10,
        theme: darkTheme,
        backgroundColor: 'surface',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'border'
      },
      Text({ text: 'Sign in (C3 · @gesso/components)', color: 'text', fontSize: 16, fontWeight: 600 }),
      createComponent(TextInput, {
        label: 'Email',
        placeholder: 'you@example.com',
        ref: this.setEmailField,
        value: this.email,
        error: this.emailError,
        required: true,
        onChange: (value: string) => (this.email.value = value),
        onSubmit: () => this.submit()
      }),
      createComponent(TextInput, {
        label: 'Passcode',
        placeholder: 'six digits',
        ref: this.setPasscodeField,
        value: this.passcode,
        error: this.passcodeError,
        required: true,
        onChange: (value: string) => (this.passcode.value = value),
        onSubmit: () => this.submit()
      }),
      createComponent(Checkbox, {
        label: 'Remember this device',
        checked: this.remember,
        onChange: (value: boolean) => (this.remember.value = value)
      }),
      Row(
        { gap: 8, y: 'center' },
        Button({
          text: 'Sign in',
          padding: 10,
          borderRadius: 6,
          backgroundColor: 'controlAccent',
          color: 'controlBackground',
          onClick: () => this.submit()
        }),
        Text({ text: this.status, color: 'textMuted', fontSize: 12 })
      )
    );
  }

  /** Refs, so a failed submit knows which node to focus. */
  setEmailField = (node: UiNode | null): void => {
    this.emailField = node;
  };
  setPasscodeField = (node: UiNode | null): void => {
    this.passcodeField = node;
  };
}

/**
 * The Overlays tier (roadmap C4): everything that floats.
 *
 * A dialog that traps the keyboard and hands it back, a select
 * operable without a pointer, and a menu — all placed by L2's engine,
 * so each one flips and shifts at the edge of the viewport on its own.
 */
@Define('overlay-tier-demo')
export class OverlayTierDemo extends Component {
  readonly dialogOpen = internalState(false);
  readonly menuOpen = internalState(false);
  readonly payment = internalState('card');
  readonly toastOpen = internalState(false);
  readonly lastCommand = internalState('nothing yet');

  /**
   * The button the menu hangs off, as a cell rather than a field.
   *
   * `render()` runs once and the `ref` below fires after it, so a plain
   * field hands `Menu` the `null` it held at that moment and never
   * corrects it — and an unanchored entry falls back to the edge
   * offsets, which is why the menu used to open in the top-left corner
   * of the screen. A cell is an Observable, so the prop follows the ref.
   */
  private readonly menuAnchor = internalState<UiNode | null>(null);

  override render(): UiElement {
    return Column(
      {
        width: 340,
        padding: 16,
        gap: 10,
        theme: darkTheme,
        backgroundColor: 'surface',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'border'
      },
      Text({ text: 'Overlays (C4)', color: 'text', fontSize: 16, fontWeight: 600 }),
      createComponent(Select, {
        label: 'Payment',
        value: this.payment,
        onChange: (value: string) => (this.payment.value = value),
        options: [
          { value: 'card', label: 'Card' },
          { value: 'bank', label: 'Bank transfer' },
          { value: 'cash', label: 'Cash', disabled: true }
        ]
      }),
      Row(
        { gap: 8, y: 'center' },
        Button({
          text: 'Open dialog',
          padding: 8,
          borderRadius: 6,
          backgroundColor: 'controlAccent',
          color: 'controlBackground',
          onClick: () => (this.dialogOpen.value = true)
        }),
        Button({
          ref: (node: UiNode | null) => (this.menuAnchor.value = node),
          text: 'Actions',
          padding: 8,
          borderRadius: 6,
          backgroundColor: 'controlBackground',
          color: 'controlForeground',
          borderWidth: 1,
          borderColor: 'controlBorder',
          onClick: () => (this.menuOpen.value = !this.menuOpen.value)
        })
      ),
      Text({ text: this.lastCommand.pipe(map(text => `Last: ${text}`)), color: 'textMuted', fontSize: 12 }),
      createComponent(Dialog, {
        open: this.dialogOpen,
        title: 'Delete this note?',
        description: 'Tab stays inside; Escape closes and the button that opened it takes the caret back.',
        onClose: () => (this.dialogOpen.value = false),
        content: Row(
          { gap: 8 },
          Button({
            text: 'Cancel',
            padding: 8,
            borderRadius: 6,
            backgroundColor: 'controlBackground',
            color: 'controlForeground',
            borderWidth: 1,
            borderColor: 'controlBorder',
            onClick: () => (this.dialogOpen.value = false)
          }),
          Button({
            text: 'Delete',
            padding: 8,
            borderRadius: 6,
            backgroundColor: 'danger',
            color: 'controlBackground',
            onClick: () => {
              this.lastCommand.value = 'deleted';
              this.dialogOpen.value = false;
              this.toastOpen.value = true;
            }
          })
        )
      }),
      createComponent(Menu, {
        open: this.menuOpen,
        anchor: this.menuAnchor,
        label: 'Actions',
        items: [
          { value: 'rename', label: 'Rename' },
          { value: 'duplicate', label: 'Duplicate' },
          { value: 'archive', label: 'Archive', disabled: true }
        ],
        onSelect: (value: string) => (this.lastCommand.value = value),
        onOpenChange: (open: boolean) => (this.menuOpen.value = open)
      }),
      createComponent(Toast, {
        open: this.toastOpen,
        message: 'Note deleted',
        onClose: () => (this.toastOpen.value = false)
      })
    );
  }
}

/**
 * The Structure tier (roadmap C5): the chrome a screen is made of.
 *
 * Tabs choose what the split pane shows, the toolbar groups its
 * buttons under one name, and the divider between the panes is
 * draggable because B2 let a modifier measure its own track.
 */
@Define('structure-tier-demo')
export class StructureTierDemo extends Component {
  readonly tab = internalState('stories');
  readonly split = internalState(0.4);
  readonly open = internalState<readonly string[]>(['what']);

  override render(): UiElement {
    return Column(
      { width: 340, gap: 10, theme: darkTheme },
      createComponent(Card, {
        title: 'Structure (C5)',
        children: Column(
          { gap: 10 },
          createComponent(Toolbar, {
            label: 'Story actions',
            children: Row(
              { gap: 6 },
              toolButton('Reload'),
              toolButton('Copy'),
              createComponent(Divider, { direction: 'column', height: 20 }),
              toolButton('Share')
            )
          }),
          createComponent(Tabs, {
            tabs: [
              { value: 'stories', label: 'Stories' },
              { value: 'props', label: 'Props' },
              { value: 'notes', label: 'Notes', disabled: true }
            ],
            value: this.tab,
            onChange: (value: string) => (this.tab.value = value),
            children: Box(
              { height: 90, borderRadius: 6, borderWidth: 1, borderColor: 'border', overflow: 'hidden' },
              createComponent(SplitPane, {
                split: this.split,
                min: 0.2,
                max: 0.8,
                onSplitChange: (value: number) => (this.split.value = value),
                first: Box(
                  { padding: 8, backgroundColor: 'controlBackground' },
                  Text({ text: this.tab.pipe(map(name => `${name} list`)), color: 'controlForeground', fontSize: 12 })
                ),
                second: Box(
                  { padding: 8 },
                  Text({
                    text: this.split.pipe(map(value => `Drag the divider · ${Math.round(value * 100)}%`)),
                    color: 'textMuted',
                    fontSize: 12,
                    maxLines: 2
                  })
                )
              })
            )
          }),
          createComponent(Accordion, {
            exclusive: true,
            open: this.open,
            onOpenChange: (next: readonly string[]) => (this.open.value = next),
            sections: [
              {
                value: 'what',
                label: 'What this tier is',
                content: Text({
                  text: 'Tabs, toolbar, split pane, accordion, card and divider — all themed, all keyboard operable.',
                  color: 'textMuted',
                  fontSize: 12
                })
              },
              {
                value: 'find',
                label: 'Find bar',
                content: Text({
                  text: 'Ctrl/Cmd+F opens the library find bar; the playground no longer has its own.',
                  color: 'textMuted',
                  fontSize: 12
                })
              }
            ]
          })
        )
      })
    );
  }
}

function toolButton(label: string): UiElement {
  return Button({
    text: label,
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'controlBackground',
    color: 'controlForeground',
    borderWidth: 1,
    borderColor: 'controlBorder',
    fontSize: 12,
    label
  });
}

/**
 * The Data tier (roadmap C6): a hundred thousand rows, sorted, with the
 * header and every row sharing one set of column tracks.
 *
 * This is the card the tier's two engine deferrals were for. The rows
 * are `subgrid: 'columns'` items of the grid the header sits in, so
 * their columns are the header's; the table's `count` and `revision`
 * are Observables, so a sort tells the window that index 5 means a
 * different row now. The status bar's layout figure stays flat while it
 * scrolls, because layout costs the visible window and not the data.
 */
@Define('data-tier-demo')
export class DataTierDemo extends Component {
  readonly sort = internalState<DataTableSort | null>({ column: 'name', direction: 'ascending' });
  readonly selected = internalState(-1);
  readonly open = internalState<readonly string[]>(['src']);
  readonly file = internalState<string | null>('components');

  private readonly people = buildPeople(100000);

  override render(): UiElement {
    return Column(
      { width: 340, gap: 10, theme: darkTheme },
      createComponent(Card, {
        title: 'Data (C6)',
        children: Column(
          { gap: 10 },
          Text({
            text: `${this.people.length.toLocaleString()} rows — press a header to sort, arrows to walk them.`,
            color: 'textMuted',
            fontSize: 12
          }),
          createComponent(DataTable<Person>, {
            label: 'People',
            height: 220,
            rowHeight: 26,
            columns: PEOPLE_COLUMNS,
            rows: this.people,
            sort: this.sort,
            onSortChange: (next: DataTableSort | null) => (this.sort.value = next),
            selectedRow: this.selected,
            onSelect: (index: number) => (this.selected.value = index)
          }),
          Row(
            { gap: 10, y: 'start' },
            createComponent(Tree, {
              label: 'Files',
              width: 150,
              height: 130,
              nodes: FILE_TREE,
              expanded: this.open,
              onExpandedChange: (next: readonly string[]) => (this.open.value = next),
              selectedKey: this.file,
              onSelect: (key: string | null) => (this.file.value = key)
            }),
            createComponent(LazyList, {
              label: 'Log',
              flexGrow: 1,
              height: 130,
              count: 50000,
              estimatedItemExtent: 22,
              defaultSelectedIndex: 0,
              item: (index: number) =>
                Row(
                  { paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3 },
                  Text({ text: `line ${index.toLocaleString()}`, fontSize: 12, selectable: false })
                )
            })
          )
        )
      })
    );
  }
}

interface Person {
  readonly name: string;
  readonly team: string;
  readonly score: number;
}

const TEAMS = ['Layout', 'Render', 'Input', 'Docs'];
const NAMES = ['Ana', 'Ravi', 'Mikael', 'Jun', 'Noor', 'Elif', 'Tom', 'Sara'];

function buildPeople(count: number): readonly Person[] {
  const people: Person[] = [];
  for (let index = 0; index < count; index++) {
    people.push({
      name: `${NAMES[index % NAMES.length]} ${index}`,
      team: TEAMS[index % TEAMS.length],
      score: (index * 37) % 1000
    });
  }
  return people;
}

const PEOPLE_COLUMNS = [
  {
    key: 'name',
    header: 'Name',
    width: fr(1),
    compare: (a: Person, b: Person) => a.name.localeCompare(b.name),
    cell: (person: Person) => Text({ text: person.name, fontSize: 12, selectable: false })
  },
  {
    key: 'team',
    header: 'Team',
    width: 70,
    compare: (a: Person, b: Person) => a.team.localeCompare(b.team),
    cell: (person: Person) => Text({ text: person.team, fontSize: 12, selectable: false })
  },
  {
    key: 'score',
    header: 'Score',
    width: 66,
    align: 'end' as const,
    compare: (a: Person, b: Person) => a.score - b.score,
    cell: (person: Person) => Text({ text: String(person.score), fontSize: 12, selectable: false })
  }
];

const FILE_TREE: readonly TreeNode[] = [
  {
    key: 'src',
    label: 'src',
    children: [
      { key: 'components', label: 'components', children: [{ key: 'DataTable', label: 'DataTable.ts' }] },
      { key: 'ui', label: 'ui', children: [{ key: 'layout', label: 'layout' }] }
    ]
  },
  { key: 'docs', label: 'docs', children: [{ key: 'decisions', label: 'decisions' }] }
];

@Define('scroll-demo')
export class ScrollDemo extends Component {
  override render(): UiElement {
    return Column(
      { gap: 8 },
      Text({
        text: 'Overflow: the rounded card clips; the list has a sticky header, overlay scrollbars, and Tab scrolls the focused row into view.',
        color: '#9ca3af'
      }),
      Row(
        { gap: 16, y: 'start' },
        Box(
          {
            width: 160,
            height: 100,
            overflow: 'hidden',
            borderRadius: 16,
            backgroundColor: '#111827',
            position: 'relative'
          },
          Box({
            position: 'absolute',
            left: -40,
            top: -30,
            width: 140,
            height: 140,
            backgroundColor: '#f59e0b',
            borderRadius: 70
          }),
          Box({
            position: 'absolute',
            left: 90,
            top: 40,
            width: 120,
            height: 120,
            backgroundColor: '#3b82f6',
            borderRadius: 60
          }),
          Text({ text: 'clipped', color: '#ffffff', fontSize: 12, position: 'absolute', left: 8, bottom: 8 })
        ),
        Column(
          { width: 220, height: 140, overflow: 'scroll', backgroundColor: '#111827', borderRadius: 6 },
          Row(
            { position: 'sticky', top: 0, padding: 6, backgroundColor: '#1f2937', flexShrink: 0 },
            Text({ text: 'Sticky header — Tab through the rows', color: '#e5e7eb', fontSize: 12 })
          ),
          ...Array.from({ length: 14 }, (_, i) =>
            Button({
              text: `Row ${i + 1}`,
              color: '#d1d5db',
              fontSize: 13,
              padding: 6,
              flexShrink: 0,
              backgroundColor: i % 2 === 0 ? '#0f172a' : '#111827'
            })
          )
        ),
        // Nested rounded clips: a rounded card inside a rounded scroller.
        // Both corners have to cut — the scroller's on the outside, the
        // card's on the inside — as the card scrolls past the edge.
        Column(
          { width: 150, height: 140, overflow: 'scroll', backgroundColor: '#111827', borderRadius: 24, scrollY: 18 },
          Box(
            {
              width: 150,
              height: 110,
              overflow: 'hidden',
              borderRadius: 12,
              backgroundColor: '#1f2937',
              flexShrink: 0,
              position: 'relative'
            },
            Box({
              position: 'absolute',
              left: -30,
              top: -30,
              width: 110,
              height: 110,
              backgroundColor: '#10b981',
              borderRadius: 55
            }),
            Box({
              position: 'absolute',
              left: 80,
              top: 50,
              width: 110,
              height: 110,
              backgroundColor: '#f59e0b',
              borderRadius: 55
            }),
            Text({ text: 'nested', color: '#ffffff', fontSize: 12, position: 'absolute', left: 8, bottom: 8 })
          ),
          Box({ width: 150, height: 120, backgroundColor: '#374151', flexShrink: 0 })
        )
      )
    );
  }
}

/**
 * The Media tier (roadmap C7): a picture, icons, a spinner and two
 * progress bars.
 *
 * The picture is fetched and decoded by the `ImageResolver` the
 * `MediaService` holds — in the render worker, which is what "off the
 * main thread" means for a Gesso app — and the icons are rasterised
 * from paths at whatever colour the card's theme resolves. Switching
 * the card between the light and dark themes redraws them, which is
 * the one thing in the library that cannot resolve a palette name at
 * paint: a raster has its colour baked in.
 */
const ICONS: readonly { path: string; label: string }[] = [
  // Stroked, on the 24-unit grid: a check, a plus, a search and a bell.
  { path: 'M4 12.5 L9.5 18 L20 6', label: 'Done' },
  { path: 'M12 5 L12 19 M5 12 L19 12', label: 'Add' },
  { path: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M16 16 L21 21', label: 'Search' },
  { path: 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6 M10 20a2 2 0 0 0 4 0', label: 'Alerts' }
];

/**
 * The picture the card fetches, served by the dev server out of
 * `public/`.
 *
 * A real URL rather than a data URL on purpose: an SVG data URL would
 * have been smaller and self-contained, but `createImageBitmap` cannot
 * decode SVG in Chrome ("The source image could not be decoded"), and
 * a demo that quietly showed a placeholder would have hidden that from
 * whoever writes the first `Image` in an application.
 */
const SWATCH_PNG = '/swatch.png';

@Define('media-tier-demo')
export class MediaTierDemo extends Component {
  readonly progress = internalState(0.35);
  readonly dark = internalState(true);

  override render(): UiElement {
    return Column(
      { width: 340, gap: 10, theme: this.dark.pipe(map(on => (on ? darkTheme : lightTheme))) },
      createComponent(Card, {
        title: 'Media (C7)',
        children: Column(
          { gap: 12 },
          Text({
            text: 'A fetched picture, icons rasterised from paths, and the first two animations.',
            color: 'textMuted',
            fontSize: 12
          }),
          Row(
            { gap: 12, y: 'center' },
            createComponent(Image, {
              src: SWATCH_PNG,
              alt: 'A gradient swatch',
              width: 120,
              height: 68,
              borderRadius: 8,
              objectFit: 'cover'
            }),
            Column(
              { gap: 10, flexGrow: 1 },
              Row(
                { gap: 10, y: 'center' },
                ...ICONS.map(icon =>
                  createComponent(Icon, {
                    path: icon.path,
                    label: icon.label,
                    size: 20,
                    style: 'stroke',
                    strokeWidth: 2,
                    color: 'controlAccent'
                  })
                )
              ),
              Row(
                { gap: 10, y: 'center' },
                createComponent(Spinner, { size: 20, label: 'Working' }),
                Text({ text: 'Working…', color: 'controlForeground', fontSize: 12 })
              )
            )
          ),
          createComponent(ProgressBar, { value: this.progress, label: 'Upload', width: percent(100) }),
          createComponent(ProgressBar, { label: 'Indexing', width: percent(100) }),
          Row(
            { gap: 8 },
            stepButton('More', () => {
              this.progress.value = Math.min(1, this.progress.value + 0.15);
            }),
            stepButton('Less', () => {
              this.progress.value = Math.max(0, this.progress.value - 0.15);
            }),
            // The icons are rasters, so this is what proves they follow
            // the theme rather than resolving a palette name at paint.
            stepButton('Light / dark', () => {
              this.dark.value = !this.dark.value;
            })
          )
        )
      })
    );
  }
}

/**
 * Images (WebGPU roadmap G5): a bitmap decoded on the rendering thread
 * — drawn here with OffscreenCanvas, in an application it would come
 * from `createImageBitmap(blob)` — shown under every `objectFit`
 * inside rounded, clipping boxes.
 */
@Define('image-demo')
export class ImageDemo extends Component {
  readonly image = internalState<ImageBitmap | undefined>(undefined);

  onMount(): void {
    void createDemoBitmap().then(bitmap => {
      this.image.value = bitmap;
    });
  }

  override render(): UiElement {
    const fits = ['fill', 'cover', 'contain', 'none'] as const;
    return Column(
      { gap: 8 },
      Text({ text: 'Images: one bitmap under each objectFit, clipped by its rounded box.', color: '#9ca3af' }),
      Row(
        { gap: 12 },
        ...fits.map(fit =>
          Box(
            {
              width: 120,
              height: 80,
              overflow: 'hidden',
              borderRadius: 10,
              backgroundColor: '#111827',
              borderWidth: 1,
              borderColor: '#374151',
              image: this.image,
              objectFit: fit,
              position: 'relative'
            },
            Text({ text: fit, color: '#ffffff', fontSize: 11, position: 'absolute', left: 6, bottom: 4 })
          )
        )
      )
    );
  }
}

/**
 * Grid (roadmap L6): the two layouts every application needs and flex
 * cannot express without hand-aligned widths — a settings form whose
 * label column is as wide as its widest label, and a table whose header
 * and body share one set of tracks — plus a tile board with spans.
 */
@Define('grid-demo')
export class GridDemo extends Component {
  private static readonly ROWS: readonly [string, string, string, string][] = [
    ['1042', 'Nightly build', 'passed', '2m 14s'],
    ['1043', 'Deploy preview for the marketing site redesign', 'running', '48s'],
    ['1044', 'Lint', 'failed', '9s'],
    ['1045', 'Unit tests', 'passed', '1m 02s']
  ];

  private cell(text: string, extra: Record<string, unknown> = {}): UiElement {
    return Text({ text, fontSize: 13, color: '#d1d5db', padding: 6, ...extra });
  }

  override render(): UiElement {
    const statusColor: Record<string, string> = { passed: '#22c55e', running: '#f59e0b', failed: '#ef4444' };
    return Column(
      { gap: 8 },
      Text({
        text: 'Grid: the label column is auto, the control column 1fr; the table header and body share tracks; tiles span cells.',
        color: '#9ca3af'
      }),
      Row(
        { gap: 16, y: 'start' },
        Grid(
          {
            width: 300,
            columns: [auto, fr(1)],
            gap: 8,
            y: 'center',
            padding: 12,
            backgroundColor: '#111827',
            borderRadius: 6
          },
          Text({ text: 'Name', color: '#e5e7eb', fontSize: 13 }),
          Box({ height: 28, backgroundColor: '#1f2937', borderRadius: 4 }),
          Text({ text: 'Email address', color: '#e5e7eb', fontSize: 13 }),
          Box({ height: 28, backgroundColor: '#1f2937', borderRadius: 4 }),
          Text({ text: 'Notifications', color: '#e5e7eb', fontSize: 13 }),
          Row(
            { gap: 6 },
            Button({ text: 'Email', fontSize: 12, padding: 6, color: '#d1d5db', backgroundColor: '#1f2937' }),
            Button({ text: 'Push', fontSize: 12, padding: 6, color: '#d1d5db', backgroundColor: '#1f2937' })
          ),
          Button({
            text: 'Save',
            column: 2,
            selfX: 'end',
            fontSize: 12,
            padding: 6,
            color: '#ffffff',
            backgroundColor: '#3b82f6'
          })
        ),
        Grid(
          { columns: repeat(3, fr(1)), rows: [40, 40], gap: 6, width: 220 },
          Box({ columnSpan: 2, rowSpan: 2, backgroundColor: '#3b82f6', borderRadius: 6 }),
          Box({ backgroundColor: '#f59e0b', borderRadius: 6 }),
          Box({ backgroundColor: '#22c55e', borderRadius: 6 })
        )
      ),
      Grid(
        {
          columns: [auto, fr(1), auto, auto],
          width: 540,
          backgroundColor: '#111827',
          borderRadius: 6,
          overflow: 'hidden'
        },
        ...['Id', 'Job', 'Status', 'Duration'].map(h =>
          this.cell(h, { color: '#9ca3af', fontWeight: 600, backgroundColor: '#1f2937' })
        ),
        ...GridDemo.ROWS.flatMap(([id, job, status, duration], i) => {
          const backgroundColor = i % 2 === 0 ? '#0f172a' : '#111827';
          return [
            this.cell(id, { backgroundColor }),
            this.cell(job, { backgroundColor }),
            this.cell(status, { backgroundColor, color: statusColor[status] }),
            this.cell(duration, { backgroundColor, selfX: 'end' })
          ];
        })
      )
    );
  }
}

/**
 * Virtualization (roadmap L5): a hundred thousand rows, of which only
 * the visible ones plus an overscan band exist as nodes. The status bar
 * shows layout cost staying flat while it scrolls.
 */
@Define('lazy-list-demo')
export class LazyListDemo extends Component {
  override render(): UiElement {
    const count = 100000;
    return Column(
      { gap: 8 },
      Text({ text: `LazyColumn: ${count.toLocaleString()} rows, only the visible ones are nodes.`, color: '#9ca3af' }),
      LazyColumn(
        { width: 360, height: 180, count, estimatedExtent: 28, backgroundColor: '#111827', borderRadius: 6 },
        index =>
          Row(
            { padding: 6, gap: 10, y: 'center', backgroundColor: index % 2 === 0 ? '#0f172a' : '#111827' },
            Box({ width: 12, height: 12, borderRadius: 6, backgroundColor: `hsl(${(index * 7) % 360} 70% 55%)` }),
            Text({ text: `Row ${index.toLocaleString()}`, color: '#d1d5db', fontSize: 13, flexGrow: 1 }),
            Text({ text: index % 3 === 0 ? 'three lines' : 'one', color: '#6b7280', fontSize: 11 })
          )
      )
    );
  }
}

/**
 * Animation (roadmap F4): the three things §F4 says it is done when.
 *
 * A **reorder** whose rows animate to their new places — keyed
 * children, so the nodes survive the shuffle, and `animateLayout` on
 * each one, which reads the old box from B2's `LayoutNotifier` and
 * springs the node home from it. A **declarative transition**, where
 * nothing in the element knows it is animated: the props are the same
 * bound values they would be without it, and `transition` says how
 * they travel. And a **reduced-motion** switch, so the accessibility
 * half is visible rather than asserted.
 *
 * The dialog that fades and scales is in the Overlays card above; it
 * is the `Dialog` component's own entrance, so every dialog in the
 * library has it.
 */
@Define('animation-demo')
export class AnimationDemo extends Component {
  @Inject(AnimationService) animations!: AnimationService;

  readonly order = internalState([0, 1, 2, 3, 4]);
  readonly expanded = internalState(false);

  private shuffle(): void {
    const next = [...this.order.value];
    // One rotation plus a swap: every row moves, and two of them swap
    // past each other, which is where a FLIP either looks right or
    // very obviously does not.
    next.push(next.shift()!);
    [next[1], next[2]] = [next[2], next[1]];
    this.order.value = next;
  }

  override render(): UiElement {
    const rows = this.order.pipe(
      map(order =>
        order.map(id =>
          Row(
            {
              key: id,
              // The list is what animates; each row carries the
              // modifier, so a row that is not in the list is not
              // paying for it.
              modifiers: [animateLayout(undefined)],
              padding: 8,
              gap: 10,
              y: 'center',
              backgroundColor: 'controlBackground',
              borderRadius: 6,
              borderWidth: 1,
              borderColor: 'border'
            },
            Box({ width: 10, height: 10, borderRadius: 5, backgroundColor: ROW_COLORS[id] }),
            Text({ text: ROW_LABELS[id], color: 'controlForeground', fontSize: 13 })
          )
        )
      )
    );

    return Column(
      { width: 340, gap: 10, theme: darkTheme },
      createComponent(Card, {
        title: 'Animation (F4)',
        children: Column(
          { gap: 12 },
          Text({
            text: 'Reorder springs each row from where it was; the panel below is animated by a transition prop alone.',
            color: 'textMuted',
            fontSize: 12
          }),
          Column({ gap: 6 }, rows),
          Row(
            { gap: 8 },
            labelButton('Shuffle', () => this.shuffle()),
            labelButton('Toggle', () => (this.expanded.value = !this.expanded.value)),
            // Stands in for the shell's `prefers-reduced-motion` query,
            // which lands on exactly this call after crossing the
            // worker boundary as a `reducedMotion` message.
            labelButton('Motion', () => this.animations.applyReducedMotion(!this.animations.reducedMotion.value))
          ),
          Text({
            text: this.animations.reducedMotion.pipe(map(on => (on ? 'Reduced motion: on' : 'Reduced motion: off'))),
            color: 'textMuted',
            fontSize: 11
          }),
          Box(
            {
              // Not one animation call anywhere: three bound values and
              // a statement of how each one travels.
              transition: {
                opacity: 200,
                height: spring('gentle'),
                transform: tween(260)
              },
              width: percent(100),
              height: this.expanded.pipe(map(on => (on ? 96 : 32))),
              opacity: this.expanded.pipe(map(on => (on ? 1 : 0.35))),
              transform: this.expanded.pipe(map(on => ({ x: 150, y: 16, scaleX: on ? 1 : 0.9, scaleY: 1 }))),
              backgroundColor: 'controlAccent',
              borderRadius: 6
            },
            Text({
              text: 'transition: { opacity, height, transform }',
              color: 'controlBackground',
              fontSize: 11,
              padding: 8
            })
          )
        )
      })
    );
  }
}

const ROW_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'];
const ROW_LABELS = ['Inbox', 'Drafts', 'Sent', 'Archive', 'Trash'];

@Define('framework-demo-root')
/**
 * A component that fails on purpose, so the error overlay has
 * something to report.
 *
 * It reads a property off nothing, which is the shape of most real
 * ones. It is built by the observable below rather than mounted with
 * the page, so the throw happens while a frame is being built — the
 * case that is otherwise invisible, because it never passes through a
 * message handler and lands only in a worker's console.
 */
@Define('broken-child')
export class BrokenChild extends Component {
  override render(): UiElement {
    const notes = undefined as unknown as { title: string }[];
    return Text({ text: notes[0].title, color: '#e5e7eb' });
  }
}

/**
 * Two ways to break this app, for looking at what happens when one
 * does (`@gesso/devtools`, ROADMAP F7).
 *
 * The two buttons are the two halves of `RuntimeErrorSource` a person
 * can reach from here: a handler throws inside the message the shell
 * sent, and the child below throws while a frame is being built. The
 * first leaves the application running; the second leaves the frame
 * half-applied, and the overlay says so.
 */
@Define('break-demo')
export class BreakDemo extends Component {
  readonly broken = internalState(false);

  override render(): UiElement {
    return Column(
      { gap: 8, x: 'start' },
      Text({ text: 'Errors', color: '#ffffff', fontSize: 16, fontWeight: 600 }),
      Text({
        text: 'A canvas app keeps its last good frame on screen when it fails. These break it on purpose.',
        color: '#9ca3af'
      }),
      Row(
        { gap: 8 },
        labelButton('Throw in a handler', () => {
          throw new Error('Thrown from a click handler.');
        }),
        labelButton('Throw in a render', () => {
          this.broken.value = true;
        })
      ),
      this.broken.pipe(map(broken => (broken ? [createComponent(BrokenChild)] : [])))
    );
  }
}

export class FrameworkDemoRoot extends Component {
  @Inject(DemoCounter) demo!: DemoCounter;

  /**
   * The four most recent ticks, newest first, keyed by tick number.
   *
   * Every emission mounts one new component, unmounts the one that
   * fell off the end, and reorders the three that survived — so the
   * list exercises keyed component identity, not just creation.
   */
  private recentTicks() {
    return this.demo.clicks.pipe(
      map(count => {
        const ticks: number[] = [];
        for (let tick = count; tick > count - 4 && tick > 0; tick--) {
          ticks.push(tick);
        }
        return ticks.map(tick => createComponent(TickItem, { label: `Tick #${tick}` }, tick));
      })
    );
  }

  override render(): UiElement {
    // A scrolling page: content taller than the viewport scrolls instead
    // of being flex-shrunk into it, and the anchored menu below has to
    // follow its button through two nested scroll containers. The find
    // bar floats over it, so opening one does not reflow the page.
    return Box(
      { width: percent(100), height: percent(100), position: 'relative' },
      this.page(),
      createComponent(FindBar)
    );
  }

  private page(): UiElement {
    return ScrollView(
      { padding: 24, gap: 20 },
      Text({ text: 'Framework Playground', color: '#ffffff', fontSize: 24, fontWeight: 600 }),
      Text({
        text: 'Click the buttons: input, components, stores and Canvas2D are wired end to end.',
        color: '#9ca3af'
      }),
      createComponent(ChannelDemo),
      createComponent(BreakDemo),
      Box({ width: 120, height: 120, backgroundColor: '#f59e0b', borderRadius: 8 }),
      createComponent(ModifierDemo),
      createComponent(SignInFormDemo),
      createComponent(OverlayTierDemo),
      createComponent(StructureTierDemo),
      createComponent(DataTierDemo),
      createComponent(MediaTierDemo),
      createComponent(AnimationDemo),
      createComponent(TextShowcase),
      createComponent(TextFieldDemo),
      createComponent(LocalCounter),
      createComponent(StoreCounter),
      createComponent(Heartbeat),
      createComponent(HeavyPanel),
      createComponent(MenuDemo),
      createComponent(ScrollDemo),
      createComponent(ImageDemo),
      createComponent(LazyListDemo),
      createComponent(GridDemo),
      Text({ text: 'Keyed components from an observable list (click Add):', color: '#9ca3af' }),
      Column({ gap: 6, x: 'start' }, this.recentTicks())
    );
  }
}

/**
 * A button wide enough for a word, where `stepButton` is sized for a
 * single glyph.
 */
function labelButton(label: string, onClick: () => void): UiElement {
  return Button({
    text: label,
    onClick,
    color: '#e5e7eb',
    fontSize: 13,
    height: 28,
    paddingLeft: 12,
    paddingRight: 12,
    textAlign: 'center',
    verticalAlign: 'middle',
    borderRadius: 4,
    backgroundColor: '#374151'
  });
}

function stepButton(label: string, onClick: () => void): UiElement {
  return Button({
    text: label,
    onClick,
    color: '#e5e7eb',
    fontSize: 14,
    width: 26,
    height: 26,
    // A Button draws its own `text` in its content box, so the glyph is
    // centred with textAlign/verticalAlign; `x` and `y` align children,
    // and this button has none.
    textAlign: 'center',
    verticalAlign: 'middle',
    borderRadius: 4,
    backgroundColor: '#374151'
  });
}
