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

## One tab stop, not one per menu

A bar is a single stop with a roving highlight inside it, so Tab past
it costs one press however many menus it grows. That is `tabStop` and
`focusable` doing their two different jobs: the strip is focusable and
the titles are not stops of their own.

## Props

| Prop            | What it is                                                                             |
| --------------- | -------------------------------------------------------------------------------------- |
| `menus`         | The menus, left to right. Each has a `label`, an optional `mnemonic` and its `entries` |
| `labelOf`       | What a command is called, which a row shows and type-ahead matches                     |
| `enabled`       | Whether a command can be chosen right now. Omitted means all of them are               |
| `acceleratorOf` | A command's shortcut, already written the way it should be read                        |
| `onChoose`      | Called with the command that was chosen                                                |
| `onDismiss`     | Called when the bar is done with the keyboard                                          |
| `barRef`        | The bar itself, for an application that focuses it from a shortcut                     |
| `label`         | What a screen reader calls the bar. Defaults to "Main menu"                            |

The component is generic in the command type, so an application's own
identifiers go in without a cast and come back out of `onChoose` as
themselves.

`acceleratorOf` hands back a string rather than a key description,
because what a shortcut is _called_ depends on the platform and on what
the application has decided to call its modifiers. A component that
guessed would be wrong on somebody's machine in a way they could not
correct.

**Choosing also dismisses.** `onChoose` is followed by `onDismiss`,
because picking a command closes the bar and gives the keyboard back.
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
| A letter        | Open the menu it names | Jump to the entry it starts       |
| `Tab`           | Leave the bar          | Close, and leave                  |

Escape twice rather than once, and the order matters: the first closes
the menu and leaves the bar focused, the second gives the keyboard
back. Closing straight through loses the place of anybody who opened
the wrong menu, which is most people, most of the time.

A letter that names nothing is not claimed, and neither is Tab from the
closed bar. A bar that swallowed every key would be a bar you cannot
get out of.

## One highlight, not two

Hovering a row moves the _same_ highlight the arrows move. A menu with
a keyboard highlight on one row and a hover highlight on another cannot
say what Enter will do. Disabled entries are skipped by both, on the
rule the whole model follows: the highlight only ever rests where Enter
would work.

With a menu already open, moving the pointer along the bar opens the
one underneath it. Without that, a bar is something you have to click
four times to read.

## The keyboard without the chrome

`menuBarStep` is the state machine underneath, exported on its own. It
takes a state and a key and returns the next state, plus what the key
chose and whether the bar is done with the keyboard, and it returns
`null` for a key it does not claim.

Reach for it when you are drawing your own bar and want the traversal
that everybody gets wrong exactly once. It holds no state and touches
nothing, which is what lets every rule in the table above be a line in
a spec rather than a click in a browser.
