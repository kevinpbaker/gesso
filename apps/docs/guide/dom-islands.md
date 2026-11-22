---
description: 'DOM islands: real elements over boxes in the layout, for native fields a password manager fills, maps and embedded widgets.'
---

# DOM islands

Gesso draws the whole interface on a canvas, and most of the time that
is the point. Some things a canvas cannot be:

- A field that a password manager fills, that the browser autofills or
  that a phone fills with a one-time code. These tools look for a real
  `<input>` in a real `<form>`.
- A map, a payment field, a code editor or a sign-in widget from
  another vendor. They come as DOM and expect to stay DOM.

A DOM island is a box in the layout that a real DOM element covers. The
render worker owns the box: it lays the box out, puts it in the Tab
order, gives it a semantics record and clips it to its scroll
container. The main thread owns the element: it makes the element and
puts it over the box on every frame.

Try it in the playground: **Examples, DOM islands**.

## A native field

`NativeInput` from `gesso-components` is a text field whose text is a
native `<input>`. The canvas draws the label, the frame, the focus ring
and the message. Fields with the same `form` are in one `<form>` on the
page, so Chrome sees a username field and a password field as one
sign-in form.

```tsx
<NativeInput form="sign-in" name="email" type="email" autocomplete="username"
             label="Email" value={email} onChange={value => auth.send.setEmail(value)} />
<NativeInput form="sign-in" name="password" type="password" autocomplete="current-password"
             label="Password" value={password} onChange={value => auth.send.setPassword(value)}
             onSubmit={signIn} />
```

The shell must register the island. A shell that does not name it does
not load it:

```ts
// main.ts
import { createApp, nativeInputIsland } from 'gesso-framework';

createApp({ islands: [nativeInputIsland] }).mount('#app');
```

Enter in a field submits its form with `requestSubmit()`. A password
manager watches for that submission. The page does not navigate, and
the render worker calls the field's `onSubmit`. A sign-in button drawn
on the canvas must submit the form too. If it only sends a channel
command, the person is signed in, but the browser never offers to save
the password:

```tsx
const islands = ctx.inject(IslandService);

function signIn(): void {
  islands.submitForm('sign-in');
  auth.send.signIn();
}
```

When the sign-in works, remove the form (show the next screen). Chrome
reads a submission followed by the form going away as a successful
sign-in.

The page must load the font that the theme uses. If it does not, the
element draws its text in a fallback font next to the canvas.

## Your own island

An island kind is a token in the contract module, which both workers
import, like a channel:

```ts
// stores.contract.ts
export const StoreMap = island<{ lat: number; lng: number }, { picked: string }>('store-map');
```

The shell registers a factory for the token. The factory makes the
element and, if you give one, receives each change to the props:

```ts
// main.ts
createApp({
  islands: [nativeInputIsland, provideIsland(StoreMap, () => import('./map').then(module => module.mapFactory))]
}).mount('#app');
```

```ts
// map.ts, on the main thread
export const mapFactory: IslandFactory<{ lat: number; lng: number }, { picked: string }> = {
  create(props, context) {
    const element = context.document.createElement('div');
    const map = new VendorMap(element, props);
    map.on('pick', id => context.emit({ picked: id }));
    return {
      element,
      update: next => map.moveTo(next),
      wheel: 'own',
      dispose: () => map.destroy()
    };
  }
};
```

The render worker puts the island in the tree:

```tsx
<Island
  of={StoreMap}
  props={{ lat, lng }}
  onEvent={event => stores.send.pick(event.picked)}
  width="fill"
  height={320}
  label="Store map"
/>
```

- Props go to the element as plain data, on the next frame.
- What the element emits goes to `onEvent` on the next frame. From
  there, call a channel command as any handler does.
- For a message that is not props ("fly to this store"), use an
  `islandController()`: give it to the island as `controller` and call
  `post(message)`. The element gets it in `receive`.
- `elementIsland(create)` is a factory for an element that you make
  once and do not update.

## Where the element goes

On every frame after layout, the runtime sends the shell the island's
box, its clip and what covers it. The shell moves the element with a
transform and snaps it to device pixels. Then it cuts the element with
a `clip-path` to the part of the box that shows.

- **Scroll containers clip it**, as they clip canvas content.
- **Overlays cut it.** A menu, a popover, a tooltip, a toast or a dialog
  that opens over an island cuts the element away where it covers it.
  A press in that area goes to the canvas and reaches the menu. A
  modal's scrim covers the whole island.
- **Sticky headers cut it.** A sticky node in the island's scroll
  container cuts it, so a form that scrolls under an app bar stays
  under it.
- **A transparent backdrop does not hide it.** The backdrop that a menu
  spreads to close on an outside press makes the island ignore the
  pointer. The element stays visible, and the press closes the menu.

Limits:

- Cuts are rectangles. A menu's rounded corner and its shadow are cut
  square.
- Canvas content that is not an overlay and not sticky (for example, an
  absolutely positioned sibling) does not cut an island. The island
  draws over it.
- A scaled ancestor scales the element's box but not its content.
  Rotation is not supported.

## The lag while it moves

The element is one frame behind its box while the box moves. The
canvas reaches the screen from the render worker. The element reaches
the screen from the main thread, which applies the placement on its
next frame. These two paths do not synchronize.

Measured in headless Chrome with `node scripts/check-dom-islands.ts`:

| Wheel input       | Scroll per frame | Element behind its box    |
| ----------------- | ---------------- | ------------------------- |
| 20 px every 16 ms | 6 px             | 6 px median, 8 px worst   |
| 80 px every 16 ms | 26 px            | 25 px median, 31 px worst |

In each case the element is 1.0 frame behind. When the box stops, the
element is exactly over it on the next frame. A browser that composites
on a real display can show a different number.

Two things reduce the lag:

- **Placements leave before paint.** The runtime sends them after
  layout and before it draws, so they reach the main thread as early in
  the frame as possible.
- **Stand-ins.** With `standIn: 'moving'`, the shell hides the element
  while its box moves, and the canvas draws the island's children in
  its place. The element comes back on the first still frame.
  `standIn: 'unfocused'` also hides the element when it does not have
  the focus. `NativeInput` uses `unfocused`. Only the field that you
  type in shows its DOM text, and the canvas draws every other field in
  the same font. While a form scrolls, no field moves away from its
  frame.

For an element that the canvas cannot draw (a map, a video call), the
lag stays. Keep such islands out of fast-scrolling content if you can.

## Focus, keys and screen readers

- An island is a tab stop. When Tab reaches it, the element gets DOM
  focus. Tab and Shift+Tab in the element go back to the app's focus
  order. Escape also goes back if the element did not use it. All other
  keys stay with the element.
- A click, an autofill or a screen reader that puts focus in the element
  moves the app's focus to the island. Focus rings and `FocusService`
  stay correct.
- A wheel over the element scrolls the canvas, so a list keeps
  scrolling when the pointer is over a field in it. A factory that
  returns `wheel: 'own'` keeps the wheel (a map).
- The semantics mirror points at the real element with `aria-owns`. A
  screen reader reads the real field in the tree's order, with the role
  and name that the element gives itself.

## What islands are not

- Islands work in the worker configuration (`createApp`). The
  single-thread configuration (`createSyncApp`) does not place islands
  yet.
- An island is one tab stop. An element with its own internal Tab order
  (a whole form from another vendor) gets the focus as one stop.
- The size of the island comes from the layout, not from the element.
  An element that needs to size itself is not supported yet.
