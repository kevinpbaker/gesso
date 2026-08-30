import { map } from 'rxjs';
import { Checkbox, Dialog, Menu, Select, TextInput, Toast } from '../components';
import { FocusStore } from '../framework/app/FocusStore';
import { darkTheme } from '../ui/environment/UiTheme';
import { interactive } from '../ui/modifiers';

import { Box, Button, Column, EditableText, Grid, LazyColumn, Row, ScrollView, Text } from '../ui/composition';
import { auto, fr, percent, repeat } from '../ui/layout';
import type { UiNode } from '../ui/graph/UiNode';
import { OverlayStore } from '../framework/overlay/OverlayStore';
import type { UiElement } from '../ui/composition';
import { Component } from '../framework/Component';
import { createComponent } from '../framework/createComponent';
import { Define, Inject, Input } from '../framework/decorators';
import { state } from '../framework/State';
import { createDemoBitmap } from './demoBitmap';
import { input } from '../framework/Input';
import { Store } from '../framework/store/Store';
import { Action, Projection, State } from '../framework/store/decorators';
import { HeavyStore } from './HeavyStore';
import { FindStore } from '../framework/app/FindStore';

/**
 * Demo store used by the framework playground.
 *
 * Owned by the single-thread app runtime and injected into components
 * with `@Inject()`. Actions are the only way to mutate store state.
 */
export class DemoStore extends Store {
  @State() clicks = state(0);

  /**
   * Derived read model. Exposed to components as an Observable that
   * emits only when the projected value actually changes, which is
   * what a data worker will send over the wire in Phase E.
   */
  @Projection()
  get summary(): { clicks: number; parity: string } {
    return {
      clicks: this.clicks.value,
      parity: this.clicks.value % 2 === 0 ? 'even' : 'odd'
    };
  }

  @Action()
  increment(): void {
    this.clicks.value++;
  }
}

/**
 * A component that demonstrates local `@State()` driven by a click.
 *
 * The button carries a declarative `onClick` prop, so the handler is
 * registered on the input dispatcher during reconciliation. Pressing
 * it mutates local state, whose emission flows through the binding
 * pipeline to the canvas with no re-render.
 */
@Define('local-counter')
export class LocalCounter extends Component {
  @State() count = state(0);

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
  @Inject(DemoStore) demo!: DemoStore;

  override render(): UiElement {
    return Row(
      { gap: 12, y: 'center' },
      Text({
        text: this.demo.projection.summary.pipe(map(s => `Store count: ${s.clicks} (${s.parity})`)),
        color: '#e5e7eb'
      }),
      Button(
        {
          onClick: () => this.demo.dispatch('increment'),
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
  @State() ticks = state(0);

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
 * Drives a store that lives in a data worker.
 *
 * The button dispatches an action that burns 1.5 seconds of CPU. It
 * runs in the data worker, so neither this thread nor the main thread
 * notices: the heartbeat above keeps its cadence throughout.
 */
@Define('heavy-panel')
export class HeavyPanel extends Component {
  @Inject(HeavyStore) heavy!: HeavyStore;

  override render(): UiElement {
    return Column(
      { gap: 8, x: 'start' },
      Row(
        { gap: 12, y: 'center' },
        Text({
          text: this.heavy.projection.status.pipe(
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
            onClick: () => this.heavy.dispatch('compute'),
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
  @State() name = state('Ada');
  @State() notes = state('Type here. Enter makes a new line; the field grows with it.');

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
 * opened through the OverlayStore. The button sits inside a short
 * scroll view near the bottom of the page, so the menu flips upward
 * when there is no room below and follows the button as the list
 * scrolls; a press anywhere else closes it.
 */
@Define('menu-demo')
export class MenuDemo extends Component {
  @Inject(OverlayStore) overlays!: OverlayStore;

  private anchor: UiNode | null = null;
  private noteAnchor: UiNode | null = null;
  private choice = state('Nothing chosen yet');

  /**
   * A popover with no backdrop: it stays open while the page and the
   * list scroll, and the engine keeps it beside its button.
   */
  private toggleNote(): void {
    if (this.overlays.isOpen('menu-demo-note')) {
      this.overlays.dispatch('close', 'menu-demo-note');
      return;
    }
    this.overlays.dispatch('open', {
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
    this.overlays.dispatch('open', {
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
              this.overlays.dispatch('close', 'menu-demo');
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
 * Modifiers (roadmap B1): behaviour attached to an element.
 *
 * The options are module constants because a modifier's arguments are
 * compared by identity, as props are — rebuilt objects would re-attach
 * the modifier on every render. Toggling the plain box's modifier off
 * shows the override layer handing the declared colour back.
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
  private attached = state(true);

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
      )
    );
  }
}

/**
 * The Inputs tier (roadmap C3): a sign-in form built from
 * `@nodal/components` with no hand-rolled widget and no colour in it.
 *
 * Every control is themed through the control tokens, carries its own
 * role, name and states, and is operable from the keyboard. Submitting
 * with an empty field puts the caret in it through `FocusStore`, which
 * is the thing a component could not do before C0.
 */
@Define('sign-in-form-demo')
export class SignInFormDemo extends Component {
  @Inject(FocusStore) focus!: FocusStore;

  @State() email = state('');
  @State() passcode = state('');
  @State() remember = state(true);
  @State() emailError = state('');
  @State() passcodeError = state('');
  @State() status = state('');

  private emailField: UiNode | null = null;
  private passcodeField: UiNode | null = null;

  private submit(): void {
    const missingEmail = this.email.value.trim().length === 0;
    const missingPasscode = this.passcode.value.trim().length === 0;
    this.emailError.value = missingEmail ? 'Enter your email address' : '';
    this.passcodeError.value = missingPasscode ? 'Enter your passcode' : '';
    this.status.value = missingEmail || missingPasscode ? '' : `Signed in as ${this.email.value}`;
    // The caret goes to the first field that failed, which is what a
    // form has to be able to do and what FocusStore exists for.
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
      Text({ text: 'Sign in (C3 · @nodal/components)', color: 'text', fontSize: 16, fontWeight: 600 }),
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
  @State() dialogOpen = state(false);
  @State() menuOpen = state(false);
  @State() payment = state('card');
  @State() toastOpen = state(false);
  @State() lastCommand = state('nothing yet');

  private menuAnchor: UiNode | null = null;

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
          ref: (node: UiNode | null) => (this.menuAnchor = node),
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
 * Images (WebGPU roadmap G5): a bitmap decoded on the rendering thread
 * — drawn here with OffscreenCanvas, in an application it would come
 * from `createImageBitmap(blob)` — shown under every `objectFit`
 * inside rounded, clipping boxes.
 */
@Define('image-demo')
export class ImageDemo extends Component {
  @State() image = state<ImageBitmap | undefined>(undefined);

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

@Define('framework-demo-root')
export class FrameworkDemoRoot extends Component {
  @Inject(DemoStore) demo!: DemoStore;

  /**
   * The four most recent ticks, newest first, keyed by tick number.
   *
   * Every emission mounts one new component, unmounts the one that
   * fell off the end, and reorders the three that survived — so the
   * list exercises keyed component identity, not just creation.
   */
  private recentTicks() {
    return this.demo
      .select(s => s.clicks.value)
      .pipe(
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
      Box({ width: 120, height: 120, backgroundColor: '#f59e0b', borderRadius: 8 }),
      createComponent(ModifierDemo),
      createComponent(SignInFormDemo),
      createComponent(OverlayTierDemo),
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
 * Find (roadmap F2): the bar Ctrl/Cmd+F opens.
 *
 * The framework owns the search — `FindStore` is the reactive face of
 * `UiFindController` — and this is all an app has to write for it: a
 * field bound to `search`, a count, and two steps. The matches light up
 * on the page as you type and the active one scrolls into view, which
 * is the part a canvas cannot get from the browser.
 */
@Define('find-bar')
export class FindBar extends Component {
  @Inject(FindStore) find!: FindStore;

  private query = state('');

  private search(value: string): void {
    this.query.value = value;
    this.find.search(value);
  }

  override render(): UiElement {
    return Row(
      {
        visible: this.find.open,
        position: 'absolute',
        top: 12,
        right: 12,
        gap: 8,
        y: 'center',
        padding: 8,
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        borderWidth: 1,
        borderRadius: 8
      },
      EditableText({
        ref: node => this.find.setField(node),
        value: this.query,
        placeholder: 'Find on page',
        onInput: event => this.search(event.value),
        // Enter is the app's in a single-line field, so it steps here.
        onKeyDown: event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (event.modifiers.shift) {
              this.find.previous();
            } else {
              this.find.next();
            }
          }
        },
        width: 180,
        textWrap: 'none',
        color: '#ffffff',
        fontSize: 13,
        padding: 6,
        borderRadius: 4,
        backgroundColor: '#111827',
        borderWidth: 1,
        borderColor: '#374151'
      }),
      Text({
        text: this.find.matchCount.pipe(
          map(count => (count === 0 ? (this.query.value.length === 0 ? '' : 'no matches') : `of ${count}`))
        ),
        color: '#9ca3af',
        fontSize: 12,
        width: 70
      }),
      stepButton('‹', () => this.find.previous()),
      stepButton('›', () => this.find.next()),
      stepButton('✕', () => this.find.close())
    );
  }
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
