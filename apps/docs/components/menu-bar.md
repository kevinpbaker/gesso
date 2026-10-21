---
description: 'MenuBar: titles along a strip, focus that stays on the bar while a panel is open, and the reason that is not Menu.'
---

# MenuBar

Titles along a strip, one panel open at a time, and the arrows walking
between them. The bar an application puts at the top of a window when
its commands outgrow a toolbar.

It is a peer of [Menu](/components/menu) rather than a mode on it, and
the difference is where the keyboard lives. `Menu` traps focus inside
its panel, which is right for a popup opened by a button and wrong for
a bar: with focus in the panel, ArrowLeft has nowhere to go, and
walking to the menu next door with the arrows is most of what makes a
bar a bar. So this keeps focus on the strip and draws the open menu as
an overlay that does not take the keyboard.

Reach for `Menu` when something opens a list beside itself. Reach for
this when a window has a permanent row of them.

<LiveExample id="menubar" height="300" />

<<< @/src/examples/MenuBarExample.tsx#menu-bar

## Naming the command type in JSX

`MenuBar` is generic over what a command is. In JSX, write the type
with an instantiation expression first, `const CommandBar =
MenuBar<Command>`, and use `<CommandBar ... />`. Written inline,
`<MenuBar<Command> ... />` types the command as `unknown`: TypeScript
hands a JSX library the component without its type argument, so the
attributes are computed from the uninstantiated function and every
callback that takes a `Command` is refused. `createComponent(MenuBar<Command>, ...)`,
as above, is the same instantiation expression.

## One tab stop, not one per menu

A bar is a single stop with a roving highlight inside it, so Tab past
it costs one press however many menus it grows. That is `tabStop` and
`focusable` doing their two different jobs: the strip is focusable and
the titles are not stops of their own.

Because the highlight lives in the bar's state rather than on a node,
the runtime's focus ring can only go round the whole strip; it cannot
say which title the arrows are on. So the title draws that itself, a
ring in the focus ring's colour inside its own box, while the bar has
focus a key put there. Left and Right then visibly move along a closed
bar. A click on a title is not a reason to mark it, as it is not a
reason to draw a ring.

Left and Right move toward the arrow pressed. Under
`textDirection="rtl"` the titles run from the right, so Left is the next
menu and Right the one before, on a closed bar and an open one alike.

## Props

| Prop            | What it is                                                                             |
| --------------- | -------------------------------------------------------------------------------------- |
| `menus`         | The menus, left to right. Each has a `label`, an optional `mnemonic` and its `entries` |
| `labelOf`       | What a command is called, which a row shows and type-ahead matches                     |
| `enabled`       | Whether a command can be chosen right now. Omitted means all of them are               |
| `acceleratorOf` | A command's shortcut, already written the way it should be read                        |
| `checkedOf`     | Whether a command that is a setting is on. Undefined for a plain action                |
| `onChoose`      | Called with the command that was chosen                                                |
| `onDismiss`     | Called when the bar is done with the keyboard                                          |
| `f10Key`        | Whether F10 reaches the bar from anywhere. Defaults to true                            |
| `altKey`        | Whether Alt alone and Alt with a mnemonic do. Defaults to true, except on macOS        |
| `barRef`        | The bar itself, for an application that focuses it some other way                      |
| `label`         | What a screen reader calls the bar. Defaults to "Main menu"                            |

The component is generic in the command type, so an application's own
identifiers go in without a cast and come back out of `onChoose` as
themselves.

`acceleratorOf` hands back a string rather than a key description,
because what a shortcut is _called_ depends on the platform and on what
the application has decided to call its modifiers. A component that
guessed would be wrong on somebody's machine in a way they could not
correct.

**A setting gets a tick.** `checkedOf` is for the commands that are
switched on and off rather than done: show gridlines, or one of light,
dark and match the system. True draws a tick, false leaves its place
empty, and undefined says the command is a plain action. A menu with
any setting in it keeps a column for ticks on every row, so its labels
stay in one line. The row is a `menuitemcheckbox` with the `checked`
state, which is what a screen reader needs to say "checked" rather than
leave it to the tick. Like `labelOf`, it is read when the menu opens.

**Choosing also dismisses.** `onChoose` is followed by `onDismiss`,
because picking a command closes the bar and gives the keyboard back.
That holds whichever way the command was chosen, with the keys or with
the pointer.
They are two different facts and an application that wires both to the
same place will see the second overwrite the first.

## The keys

| Key             | With nothing open      | With a menu open                  |
| --------------- | ---------------------- | --------------------------------- |
| `←` `→`         | Move along the bar     | Close this menu and open the next |
| `↓`             | Open, from the top     | Next entry, wrapping              |
| `↑`             | Open, from the bottom  | Previous entry, wrapping          |
| `Home` `End`    | First or last menu     | First or last entry               |
| `Enter` `Space` | Open                   | Choose, and close                 |
| `Escape`        | Give the keyboard back | Close to the bar                  |
| `F10`           | Give the keyboard back | Close, and give it back           |
| `Alt` alone     | Give the keyboard back | Close, and give it back           |
| A letter        | Open the menu it names | Jump to the entry it starts       |
| `Tab`           | Leave the bar          | Close, and leave                  |

Escape twice rather than once, and the order matters: the first closes
the menu and leaves the bar focused, the second gives the keyboard
back. F10 and Alt leave in one press, because somebody pressing them is
leaving the menus rather than backing out of one. Closing straight through loses the place of anybody who opened
the wrong menu, which is most people, most of the time.

A letter that names nothing is not claimed, and neither is Tab from the
closed bar. A bar that swallowed every key would be a bar you cannot
get out of.

## Reaching the bar from anywhere

A bar that can only be reached by tabbing to it is a bar at the far end
of every form on the page. So three keys reach it from wherever focus
is, the way they do in a Windows application:

| Key, with focus elsewhere | What it does                                     |
| ------------------------- | ------------------------------------------------ |
| `F10`                     | Focus the bar, on the title it was last left on  |
| `Alt`, pressed alone      | The same                                         |
| `Alt` and a mnemonic      | Focus the bar and open the menu the letter names |

Leaving puts focus back where it was. F10 or Alt again, Escape on the
closed bar, or choosing a command all return it to the control that had
it before, and to nothing if nothing did. Focus that left the bar some
other way, by Tab or by a click, stays where it went.

**Alone means alone.** Alt counts only when nothing came between its
press and its release. Alt and Left, or Alt held through a click, are
chords and leave the bar alone as Alt comes up. Shift+F10 is a context
menu's key and is not taken either.

**The page has first say.** The keys are heard at the root after the
focused control and everything above it, as an application's shortcuts
are, and taken only when the bar acted on them. A control that binds
F10 or an Alt chord itself keeps it, and a modal dialog's focus trap
keeps the bar behind it out of reach.

**Turning them off.** `f10Key: false` and `altKey: false` leave those
keys to the application: a debugger that steps with F10, or an editor
whose Alt chords mean something else. A page with more than one bar
should leave them on for one only, since the first bar to hear a key
takes it.

**On macOS, Alt is off by default.** There is no such convention on a
Mac: the menus live in the system's bar, and Option and a letter is
how somebody types "ø". The default follows the platform the runtime
reports, and `altKey: true` turns it on anyway. F10 is on everywhere.

**In a render worker, claim the keys on the main thread too.** The
browser has defaults of its own for these keys: F10 and a lone Alt open
a Windows browser's menu, and Alt and a letter opens one of its menus
by that letter. A bar in a worker hears a key a message after the
browser has acted on it, so its claim comes too late to stop it. Tell
the shell which keys are the application's, and it cancels the
browser's default on the spot, for the press and the release alike:

```ts
createApp({
  renderWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  interceptKey: event => event.key === 'F10' || event.key === 'Alt' || (event.altKey && event.key.length === 1)
});
```

An app on the main thread needs none of this: there, the bar's claim
cancels the default directly.

## One highlight, not two

Hovering a row moves the _same_ highlight the arrows move. A menu with
a keyboard highlight on one row and a hover highlight on another cannot
say what Enter will do. Disabled entries are skipped by both, on the
rule the whole model follows: the highlight only ever rests where Enter
would work.

With a menu already open, moving the pointer along the bar opens the
one underneath it. Without that, a bar is something you have to click
four times to read.

## A menu longer than the window

A panel is given the room under its title and no more. A menu with
thirty commands in a short window is cut at the window's edge, and its
rows scroll inside the frame, which holds still. The wheel scrolls it;
the keys keep the highlighted row in view as they walk past the edge,
including the last row that ArrowUp on the bar opens on. Hovering does
not scroll: a row half under the edge that the pointer brushes does not
pull the list out from under it.

## The keyboard without the chrome

`menuBarStep` is the state machine underneath, exported on its own. It
takes a state and a key and returns the next state, plus what the key
chose and whether the bar is done with the keyboard, and it returns
`null` for a key it does not claim.

Reach for it when you are drawing your own bar and want the traversal
that everybody gets wrong exactly once. It holds no state and touches
nothing, which is what lets every rule in the table above be a line in
a spec rather than a click in a browser.
