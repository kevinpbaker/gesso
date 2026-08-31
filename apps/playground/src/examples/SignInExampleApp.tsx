import { combineLatest, type Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import type { UiSemanticState } from '@gesso/core';
import { type ComponentContext, type Inputs, internalState } from '@gesso/framework';
import { SignIn } from './signin/SignInContract';
import {
  BORDER,
  BORDER_STRONG,
  CHALK,
  DANGER as BRAND_DANGER,
  GROUND,
  gessoTheme,
  POSITIVE,
  SURFACE,
  SURFACE_OVERLAY,
  SURFACE_RAISED,
  TEXT,
  TEXT_FAINT,
  TEXT_MUTED
} from './brand';

/**
 * A passcode sign-in screen and the account screen behind it.
 *
 * This is the kind of screen a banking or device app puts first: no
 * text field, a keypad, six dots, and unambiguous states — checking,
 * wrong code, locked out, signed in. It is written entirely in JSX as
 * functional components over one store, and runs in the render worker
 * like any other Gesso app. There is no text input yet (roadmap F2),
 * which is also why a passcode rather than a password: everything here
 * is pointer-operable today.
 *
 * The passcode is 246813.
 */

const PASSCODE = '246813';
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 15;
const CHECK_DELAY_MS = 600;

type AuthStatus = 'idle' | 'checking' | 'wrong' | 'locked' | 'signedIn';

export interface AuthView {
  readonly status: AuthStatus;
  readonly entered: number;
  readonly attemptsLeft: number;
  readonly lockSecondsLeft: number;
  readonly rememberDevice: boolean;
  readonly signedInAt: number | null;
}

/**
 * The sign-in application: one plain class, no framework in sight.
 *
 * Where the notes example has a repository, rules and a view model as
 * three layers, this has one — and that is the point. The framework
 * asks only for observables of plain data; how many layers produce
 * them is the application's business. A keypad needs none.
 *
 * A single `view` key rather than one per field: §3.2 of
 * `decisions/0030-thread-model.md` says to split finely, and the
 * reason is diff cost over large values. Six scalars are not that.
 */
export class AuthApp {
  readonly digits = internalState('');
  readonly status = internalState<AuthStatus>('idle');
  readonly attempts = internalState(0);
  readonly lockSecondsLeft = internalState(0);
  readonly rememberDevice = internalState(true);
  readonly signedInAt = internalState<number | null>(null);

  private lockTimer: ReturnType<typeof setInterval> | null = null;

  // Declared after the cells it reads: field initializers run in
  // order, so the cells exist by the time this one runs.
  readonly view: Observable<AuthView> = combineLatest([
    this.status,
    this.digits,
    this.attempts,
    this.lockSecondsLeft,
    this.rememberDevice,
    this.signedInAt
  ]).pipe(
    map(([status, digits, attempts, lockSecondsLeft, rememberDevice, signedInAt]) => ({
      status,
      entered: digits.length,
      attemptsLeft: MAX_ATTEMPTS - attempts,
      lockSecondsLeft,
      rememberDevice,
      signedInAt
    }))
  );

  /** A keypad press. Ignored while checking or locked; submits on the sixth digit. */
  press(digit: string): void {
    const status = this.status.value;
    if (status === 'checking' || status === 'locked' || status === 'signedIn') {
      return;
    }
    if (status === 'wrong') {
      this.status.value = 'idle';
      this.digits.value = '';
    }
    if (this.digits.value.length >= CODE_LENGTH) {
      return;
    }
    this.digits.value += digit;
    if (this.digits.value.length === CODE_LENGTH) {
      this.status.value = 'checking';
      // Stands in for the round trip to an auth service.
      setTimeout(() => this.verify(), CHECK_DELAY_MS);
    }
  }
  backspace(): void {
    if (this.status.value === 'wrong') {
      this.status.value = 'idle';
      this.digits.value = '';
      return;
    }
    if (this.status.value === 'idle') {
      this.digits.value = this.digits.value.slice(0, -1);
    }
  }
  toggleRemember(): void {
    this.rememberDevice.value = !this.rememberDevice.value;
  }
  signOut(): void {
    this.signedInAt.value = null;
    this.digits.value = '';
    this.attempts.value = 0;
    this.status.value = 'idle';
  }

  private verify(): void {
    if (this.digits.value === PASSCODE) {
      this.attempts.value = 0;
      this.signedInAt.value = Date.now();
      this.status.value = 'signedIn';
      return;
    }
    this.attempts.value++;
    if (this.attempts.value >= MAX_ATTEMPTS) {
      this.lock();
      return;
    }
    this.status.value = 'wrong';
  }

  private lock(): void {
    this.digits.value = '';
    this.status.value = 'locked';
    this.lockSecondsLeft.value = LOCKOUT_SECONDS;
    this.lockTimer = setInterval(() => {
      this.lockSecondsLeft.value--;
      if (this.lockSecondsLeft.value <= 0 && this.lockTimer !== null) {
        clearInterval(this.lockTimer);
        this.lockTimer = null;
        this.attempts.value = 0;
        this.status.value = 'idle';
      }
    }, 1000);
  }
}

// ---------------------------------------------------------------------------
// Palette. The named entries come from the theme and resolve at paint;
// the literals are this screen's own.
// ---------------------------------------------------------------------------

const BG = GROUND;
const CARD = SURFACE;
const CARD_BORDER = BORDER;
const KEY = SURFACE_RAISED;
const KEY_HOVER = SURFACE_OVERLAY;
const KEY_PRESSED = BORDER_STRONG;
const KEY_TEXT = TEXT;
const MUTED = TEXT_MUTED;
const FAINT = TEXT_FAINT;
const DOT_EMPTY = BORDER_STRONG;
const DANGER = BRAND_DANGER;
const SUCCESS = POSITIVE;

// ---------------------------------------------------------------------------
// Sign-in screen
// ---------------------------------------------------------------------------

/** One of the six passcode dots; fills as digits are entered, turns red on a wrong code. */
function Dot(props: Inputs<{ index: number }>, ctx: ComponentContext) {
  const auth = ctx.channel(SignIn);
  const color = combineLatest([auth.view.view, props.index]).pipe(
    map(([view, index]) => {
      if (view.status === 'wrong') return DANGER;
      if (view.status === 'signedIn') return SUCCESS;
      return index < view.entered ? 'primary' : DOT_EMPTY;
    })
  );
  return <box width={14} height={14} borderRadius={7} backgroundColor={color} />;
}

/**
 * A keypad key. `label` is what it shows; `onPress` is what it does.
 * Hover and press are local state driven by the pointer events the
 * runtime routes to the key: enter/leave for hover, down/up for the
 * press, with a leave while pressed ending both.
 */
function Key(props: Inputs<{ label: string; onPress: () => void; dim?: boolean; name?: string }>) {
  const hovered = internalState(false);
  const pressed = internalState(false);
  const background = combineLatest([props.dim, hovered, pressed]).pipe(
    map(([dim, hover, press]) => {
      if (press) return dim ? KEY : KEY_PRESSED;
      if (hover) return dim ? KEY : KEY_HOVER;
      return dim ? 'transparent' : KEY;
    })
  );
  const color = combineLatest([props.dim, hovered]).pipe(map(([dim, hover]) => (dim && !hover ? MUTED : KEY_TEXT)));
  return (
    <button
      // A `button` announces itself; what it is *called* is its text,
      // which is a word for the digits and a glyph for the other two.
      label={props.name}
      onClick={() => props.onPress.value()}
      onPointerEnter={() => (hovered.value = true)}
      onPointerLeave={() => {
        hovered.value = false;
        pressed.value = false;
      }}
      onPointerDown={() => (pressed.value = true)}
      onPointerUp={() => (pressed.value = false)}
      width={84}
      height={56}
      borderRadius={12}
      backgroundColor={background}
      x="center"
      y="center"
      cursor="pointer">
      <text color={color} fontSize={22} fontWeight={500}>
        {props.label}
      </text>
    </button>
  );
}

/** The line under the dots: a prompt, the checking state, an error, or the lockout countdown. */
function StatusLine(_props: Inputs<{}>, ctx: ComponentContext) {
  const auth = ctx.channel(SignIn);
  const view = auth.view.view;
  const text = view.pipe(
    map(v => {
      switch (v.status) {
        case 'checking':
          return 'Checking…';
        case 'wrong':
          return `Incorrect passcode. ${v.attemptsLeft} attempt${v.attemptsLeft === 1 ? '' : 's'} left.`;
        case 'locked':
          return `Too many attempts. Try again in ${v.lockSecondsLeft}s.`;
        default:
          return 'Enter your 6-digit passcode';
      }
    })
  );
  const color = view.pipe(map(v => (v.status === 'wrong' || v.status === 'locked' ? DANGER : MUTED)));
  return (
    <text color={color} fontSize={13} textAlign="center" height={18}>
      {text}
    </text>
  );
}

/** A labelled switch. */
function Switch(props: Inputs<{ label: string; on: boolean; onToggle: () => void }>) {
  const trackColor = props.on.pipe(map(on => (on ? 'primary' : DOT_EMPTY)));
  const knobX = props.on.pipe(map(on => (on ? 'end' : 'start')));
  return (
    <row
      gap={10}
      y="center"
      role="switch"
      label={props.label}
      states={props.on.pipe(map((on): UiSemanticState[] => (on ? ['checked'] : [])))}
      onClick={() => props.onToggle.value()}
      cursor="pointer">
      <box width={36} height={20} borderRadius={10} backgroundColor={trackColor} x={knobX} y="center" padding={2}>
        <box width={16} height={16} borderRadius={8} backgroundColor={CHALK} />
      </box>
      <text color={MUTED} fontSize={13}>
        {props.label}
      </text>
    </row>
  );
}

function SignInScreen(_props: Inputs<{}>, ctx: ComponentContext) {
  const auth = ctx.channel(SignIn);
  const view = auth.view.view;
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <column
      width={360}
      padding={28}
      gap={20}
      backgroundColor={CARD}
      borderColor={CARD_BORDER}
      borderWidth={1}
      borderRadius={16}>
      <column gap={6} x="center" selfX="center">
        <box width={44} height={44} borderRadius={12} backgroundColor="primary" x="center" y="center">
          <text color={CHALK} fontSize={20} fontWeight={600}>
            N
          </text>
        </box>
        <text color={KEY_TEXT} fontSize={20} fontWeight={600} marginTop={8}>
          Welcome back
        </text>
        <text color={MUTED} fontSize={13}>
          Signed in as kevin
        </text>
      </column>

      <column gap={12} x="center" selfX="center">
        <row
          gap={12}
          role="group"
          label={view.pipe(map(v => `Passcode, ${v.entered} of ${CODE_LENGTH} digits entered`))}>
          {Array.from({ length: CODE_LENGTH }, (_, index) => (
            <Dot key={index} index={index} />
          ))}
        </row>
        <StatusLine />
      </column>

      <grid columns={[84, 84, 84]} gap={10} justifyContent="center" role="group" label="Passcode keypad">
        {digits.map(digit => (
          <Key key={digit} label={digit} onPress={() => auth.send.press(digit)} />
        ))}
        <Key key="forgot" label="?" name="Forgot passcode" dim onPress={() => {}} />
        <Key key="0" label="0" onPress={() => auth.send.press('0')} />
        <Key key="back" label="⌫" name="Delete" dim onPress={() => auth.send.backspace()} />
      </grid>

      <row x="space-between" y="center">
        <Switch
          label="Remember this device"
          on={view.pipe(map(v => v.rememberDevice))}
          onToggle={() => auth.send.toggleRemember()}
        />
        <text color="primary" fontSize={13} cursor="pointer">
          Forgot passcode?
        </text>
      </row>
    </column>
  );
}

// ---------------------------------------------------------------------------
// Account screen
// ---------------------------------------------------------------------------

interface Movement {
  readonly id: string;
  readonly title: string;
  readonly when: string;
  readonly amount: number;
}

const MOVEMENTS: readonly Movement[] = [
  { id: 'm1', title: 'Grassland Ventures payroll', when: 'Today, 09:12', amount: 4200 },
  { id: 'm2', title: 'Hydro One', when: 'Yesterday', amount: -132.4 },
  { id: 'm3', title: 'Transfer to savings', when: 'Mon', amount: -800 },
  { id: 'm4', title: 'Refund · Lee Valley Tools', when: 'Sun', amount: 89.99 },
  { id: 'm5', title: 'Bell Canada', when: 'Sat', amount: -96.05 }
];

function formatAmount(amount: number): string {
  const sign = amount < 0 ? '−' : '+';
  return `${sign}$${Math.abs(amount).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Stat(props: Inputs<{ label: string; value: string; tone?: string }>) {
  return (
    <column flexGrow={1} padding={14} gap={4} backgroundColor={KEY} borderRadius={12}>
      <text color={MUTED} fontSize={12}>
        {props.label}
      </text>
      <text color={props.tone.pipe(map(tone => tone ?? KEY_TEXT))} fontSize={20} fontWeight={600}>
        {props.value}
      </text>
    </column>
  );
}

function MovementRow(props: Inputs<{ movement: Movement }>) {
  const movement = props.movement;
  return (
    <row gap={12} y="center" paddingTop={10} paddingBottom={10}>
      <box
        width={36}
        height={36}
        borderRadius={18}
        backgroundColor={movement.pipe(map(m => (m.amount < 0 ? DOT_EMPTY : 'rgba(79, 160, 126, 0.2)')))}
        x="center"
        y="center">
        <text color={movement.pipe(map(m => (m.amount < 0 ? MUTED : SUCCESS)))} fontSize={14} fontWeight={600}>
          {movement.pipe(map(m => (m.amount < 0 ? '↓' : '↑')))}
        </text>
      </box>
      <column flexGrow={1} gap={2}>
        <text color={KEY_TEXT} fontSize={14}>
          {movement.pipe(map(m => m.title))}
        </text>
        <text color={FAINT} fontSize={12}>
          {movement.pipe(map(m => m.when))}
        </text>
      </column>
      <text color={movement.pipe(map(m => (m.amount < 0 ? KEY_TEXT : SUCCESS)))} fontSize={14} fontWeight={500}>
        {movement.pipe(map(m => formatAmount(m.amount)))}
      </text>
    </row>
  );
}

function AccountScreen(_props: Inputs<{}>, ctx: ComponentContext) {
  const auth = ctx.channel(SignIn);
  const signedInAt = auth.view.view.pipe(
    map(v => (v.signedInAt === null ? '' : new Date(v.signedInAt).toLocaleTimeString()))
  );
  const balance = MOVEMENTS.reduce((sum, m) => sum + m.amount, 12480.55);

  return (
    <column
      width={420}
      padding={28}
      gap={20}
      backgroundColor={CARD}
      borderColor={CARD_BORDER}
      borderWidth={1}
      borderRadius={16}>
      <row x="space-between" y="center">
        <column gap={2}>
          <text color={KEY_TEXT} fontSize={18} fontWeight={600}>
            Good to see you, Kevin
          </text>
          <text color={FAINT} fontSize={12}>
            {signedInAt.pipe(map(t => `Signed in at ${t}`))}
          </text>
        </column>
        <button
          onClick={() => auth.send.signOut()}
          padding={8}
          paddingLeft={14}
          paddingRight={14}
          borderRadius={8}
          backgroundColor={KEY}
          cursor="pointer">
          <text color={KEY_TEXT} fontSize={13}>
            Sign out
          </text>
        </button>
      </row>

      <row gap={10}>
        <Stat label="Chequing" value={`$${balance.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`} />
        <Stat label="This month" value={formatAmount(MOVEMENTS.reduce((s, m) => s + m.amount, 0))} tone={SUCCESS} />
      </row>

      <column gap={0}>
        <text color={MUTED} fontSize={12} fontWeight={600} marginBottom={4}>
          RECENT ACTIVITY
        </text>
        {MOVEMENTS.map(movement => (
          <MovementRow key={movement.id} movement={movement} />
        ))}
      </column>
    </column>
  );
}

// ---------------------------------------------------------------------------
// Root: which screen shows follows the store; each screen keeps its
// state while it is up, and remounts only when the answer changes.
// ---------------------------------------------------------------------------

export function SignInApp(_props: Inputs<{}>, ctx: ComponentContext) {
  const auth = ctx.channel(SignIn);
  const screen = auth.view.view.pipe(
    map(v => v.status === 'signedIn'),
    distinctUntilChanged(),
    map(signedIn => (signedIn ? <AccountScreen key="account" /> : <SignInScreen key="signin" />))
  );
  return (
    <scrollview theme={gessoTheme} backgroundColor={BG} x="center" y="center" padding={32}>
      {screen}
    </scrollview>
  );
}
