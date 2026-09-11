import { BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  contextMenu,
  dragSource,
  draggable,
  dropTarget,
  focusRing,
  interactive,
  percent,
  pinchable,
  reorderable,
  shortcut,
  shortcuts,
  UiShortcutRegistry,
  type UiChild,
  type UiFocusEvent,
  type UiNode,
  type ZoomState
} from '@gesso/core';
import { Card, Image, Menu } from '@gesso/components';
import {
  createComponent,
  internalState,
  type ComponentContext,
  type Inputs,
  type InternalState
} from '@gesso/framework';

/**
 * The four gestures the applications were missing, on one page.
 *
 * `EXCELLENCE_ROADMAP.md` X11 names them: somewhere to put a drag down,
 * a pinch, a registry of shortcuts something can list, and a context
 * menu the framework raises rather than the application guessing at.
 * Each pane is the smallest thing that shows one of them working, and
 * the panes double as routes so the palette has something to change
 * between.
 *
 * Every one of them is a modifier. There is no `<DropZone>` and no
 * `<Pinchable>` on this page, because a gesture is behaviour attached
 * to an element and that is exactly what `MODIFIERS_ROADMAP.md` says a
 * modifier is for. The only component here that is not the library's is
 * the palette, which is a list of what the registry says is live.
 */

/** The three panes, which stand in for routes. */
const PANES = [
  { id: 'photo', label: 'Photo' },
  { id: 'board', label: 'Board' },
  { id: 'files', label: 'Files' }
] as const;

type PaneId = (typeof PANES)[number]['id'];

/** Hover and press for the plain buttons on this page, shared for identity. */
const CONTROL = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: 'controlBackgroundHovered' },
  pressed: { backgroundColor: 'controlBackgroundPressed' }
});

const RING = focusRing();

export function InputExampleApp(_inputs: Inputs<Record<string, never>>, _ctx: ComponentContext): UiChild {
  /**
   * One registry for the page.
   *
   * Built here, in a body that runs once, and handed to every
   * `shortcut` on the page. It listens to nothing on its own: the
   * `shortcuts` modifier on the root feeds it, which is what lets it
   * stay a plain object rather than something a service has to inject.
   */
  const registry = new UiShortcutRegistry();
  const pane = internalState<PaneId>('photo');
  const paletteOpen = internalState(false);
  /** What holds focus, so the palette can list what is scoped to it. */
  const focused = internalState<UiNode | null>(null);

  const goTo = (id: PaneId): void => {
    pane.value = id;
    paletteOpen.value = false;
  };

  const body = pane.pipe(
    map(id => [
      id === 'photo'
        ? createComponent(PhotoPane, { registry }, 'photo')
        : id === 'board'
          ? createComponent(
              BoardPane,
              { registry, onFocusChange: (node: UiNode | null) => (focused.value = node) },
              'board'
            )
          : createComponent(FilesPane, { registry }, 'files')
    ])
  );

  /**
   * The commands that belong to the application rather than to a pane.
   *
   * They hang off a zero-sized element because a shortcut's lifetime is
   * its element's, and these should live exactly as long as the page.
   * A pane's own commands are registered inside the pane, so they stop
   * existing when it does, which is the thing a root `onKeyDown`
   * switching on the route cannot do.
   */
  const applicationKeys = (
    <box
      key="keys"
      width={0}
      height={0}
      modifiers={[
        shortcut({
          registry,
          keys: 'Mod+K',
          label: 'Show every shortcut',
          group: 'Application',
          scoped: false,
          run: () => (paletteOpen.value = !paletteOpen.value)
        }),
        shortcut({
          registry,
          keys: 'g p',
          label: 'Go to the photo',
          group: 'Navigate',
          scoped: false,
          run: () => goTo('photo')
        }),
        shortcut({
          registry,
          keys: 'g b',
          label: 'Go to the board',
          group: 'Navigate',
          scoped: false,
          run: () => goTo('board')
        }),
        shortcut({
          registry,
          keys: 'g f',
          label: 'Go to the files',
          group: 'Navigate',
          scoped: false,
          run: () => goTo('files')
        })
      ]}
    />
  );

  return (
    <column
      width={percent(100)}
      height={percent(100)}
      backgroundColor="background"
      padding={20}
      gap={14}
      modifiers={[shortcuts({ registry })]}>
      {applicationKeys}
      <row width={percent(100)} y="center" gap={12}>
        <text text="Gestures and shortcuts" fontSize={20} color="text" />
        <box flexGrow={1} />
        <row gap={6}>{PANES.map(entry => tab(entry.id, entry.label, pane, goTo))}</row>
      </row>
      <text
        text="Ctrl+K lists every command that is live right now. Type g then b to go to the board. Right-click a row for a menu."
        fontSize={12}
        color="textMuted"
      />
      {createComponent(Palette, { registry, open: paletteOpen, focused, onClose: () => (paletteOpen.value = false) })}
      {body}
    </column>
  );
}

/** One pane selector, which is this page's idea of a route link. */
function tab(id: PaneId, label: string, current: InternalState<PaneId>, goTo: (id: PaneId) => void): UiChild {
  return (
    <button
      key={id}
      paddingX={12}
      paddingY={6}
      borderRadius={8}
      borderWidth={1}
      borderColor="border"
      backgroundColor={current.pipe(map(value => (value === id ? 'selectionBackground' : 'controlBackground')))}
      cursor="pointer"
      label={`Show the ${label.toLowerCase()}`}
      onClick={() => goTo(id)}
      modifiers={[CONTROL, RING]}>
      <text
        text={label}
        fontSize={12}
        color={current.pipe(map(value => (value === id ? 'selectionForeground' : 'text')))}
      />
    </button>
  );
}

interface PaneProps {
  readonly registry: UiShortcutRegistry;
}

// ---------------------------------------------------------------------------
// Photo: pinch, and Ctrl with the wheel
// ---------------------------------------------------------------------------

/**
 * A photo that zooms about the point the gesture is on.
 *
 * `pinchable` is the whole of it. Two fingers on a touchscreen, or Ctrl
 * with the wheel on anything with one, which is also what a trackpad
 * pinch arrives as in a browser. The readout is the modifier's own
 * `onChange`, so what is on screen is the gesture's answer rather than
 * a description of one.
 */
function PhotoPane(inputs: Inputs<PaneProps>, _ctx: ComponentContext): UiChild {
  const registry = inputs.registry.value;
  const zoom = new BehaviorSubject<ZoomState>({ scale: 1, rotation: 0, translateX: 0, translateY: 0 });
  const rotate = internalState(false);

  /**
   * The photo, rebuilt when rotation is switched.
   *
   * A modifier list is static per element, so changing an option that
   * is read at attach means rendering a different element. Both keys
   * are spelled out so the reconciler treats them as different.
   */
  const photo = (turning: boolean): UiChild => (
    <Image
      key={turning ? 'rotating' : 'plain'}
      src="/transitions/guitar-player.webp"
      alt="A guitarist mid-phrase"
      width={percent(100)}
      height={percent(100)}
      objectFit="cover"
      rootModifiers={[pinchable({ maxScale: 6, rotate: turning, onChange: state => zoom.next(state) })]}
    />
  );

  return (
    <row width={percent(100)} flex={1} gap={16} x="stretch">
      <box
        key="keys"
        width={0}
        height={0}
        modifiers={[
          shortcut({
            registry,
            keys: 'r',
            label: 'Let a pinch rotate the photo',
            group: 'Photo',
            scoped: false,
            run: () => (rotate.value = !rotate.value)
          })
        ]}
      />
      {createComponent(Card, {
        width: 420,
        title: 'Pinch, or Ctrl and the wheel',
        children: (
          <column gap={10} width={percent(100)}>
            <box
              width={percent(100)}
              height={240}
              borderRadius={12}
              borderWidth={1}
              borderColor="border"
              backgroundColor="surface"
              overflow="hidden">
              {rotate.pipe(map(turning => [photo(turning)]))}
            </box>
            <text
              text={zoom.pipe(map(state => `${state.scale.toFixed(2)}x, ${Math.round(state.rotation)} degrees`))}
              fontSize={12}
              color="textMuted"
            />
            <text
              text={rotate.pipe(
                map(turning =>
                  turning
                    ? 'Rotation is on: a twist turns the photo. Press r to turn it off.'
                    : 'Rotation is off, which is the default, because a pinch is never quite parallel. Press r to turn it on.'
                )
              )}
              fontSize={12}
              color="textMuted"
            />
          </column>
        )
      })}
      {createComponent(Card, {
        width: 320,
        title: 'What the gesture is',
        children: (
          <column gap={8} width={percent(100)}>
            <text
              text="The point under the fingers stays under the fingers. A viewer that scaled about its own centre would slide whatever you were looking at off the edge."
              fontSize={12}
              color="textMuted"
            />
            <text
              text="A two-finger drag moves the photo at the same time, because a pinch and a pan are one gesture rather than two fighting over one transform."
              fontSize={12}
              color="textMuted"
            />
            <text
              text="Zoom in and back out by the same number of notches and it lands exactly where it started."
              fontSize={12}
              color="textMuted"
            />
          </column>
        )
      })}
    </row>
  );
}

// ---------------------------------------------------------------------------
// Board: drag sources, drop targets, a reorderable list and a menu
// ---------------------------------------------------------------------------

interface BoardProps extends PaneProps {
  /**
   * Told which node holds focus, for the palette.
   *
   * A callback rather than the cell itself, because a prop is
   * *reactive*: handing a component a cell delivers what the cell holds
   * rather than the cell, so a child cannot write back through one. The
   * palette below takes the same state the other way round, as a value,
   * for exactly that reason.
   */
  readonly onFocusChange: (node: UiNode | null) => void;
}

/** What a chip carries between the two trays. */
const CHIP = 'playground/chip';

const CHIP_NAMES = ['Kettle', 'Ledger', 'Almanac', 'Beacon'] as const;

const ROW_NAMES = Array.from({ length: 14 }, (_, i) => `Row ${String(i + 1).padStart(2, '0')}`);

/**
 * Somewhere to put a drag down, and a list that reorders through it.
 *
 * The chips carry two modifiers, which is the split the pair was
 * written for: `draggable` moves a node and knows nothing about what it
 * is, `dragSource` knows what is being carried and moves nothing. The
 * trays are `dropTarget`s and light up through the modifier's own
 * `over` properties rather than through state this component would
 * otherwise have to keep and keep in step.
 *
 * The rows are `reorderable`, which is both at once over the same
 * session, and the list they sit in is a `dropTarget` with
 * `autoScroll`, so a row carried to the bottom edge takes the list with
 * it rather than running out of places to go.
 */
function BoardPane(inputs: Inputs<BoardProps>, _ctx: ComponentContext): UiChild {
  const registry = inputs.registry.value;
  const onFocusChange = inputs.onFocusChange.value;
  const trays = internalState<Readonly<Record<'todo' | 'done', readonly string[]>>>({
    todo: [...CHIP_NAMES],
    done: []
  });
  const order = internalState<readonly string[]>(ROW_NAMES);
  const held = internalState<string | null>(null);
  const chosen = internalState<string | null>(null);
  const menuFor = internalState<string | null>(null);
  const menuAt = internalState({ x: 0, y: 0 });
  const lastDrop = internalState('Nothing dropped yet.');

  const moveChip = (name: string, to: 'todo' | 'done'): void => {
    const from = to === 'todo' ? 'done' : 'todo';
    const current = trays.value;
    if (!current[from].includes(name)) {
      return;
    }
    trays.value =
      to === 'done'
        ? { todo: current.todo.filter(entry => entry !== name), done: [...current.done, name] }
        : { done: current.done.filter(entry => entry !== name), todo: [...current.todo, name] };
    lastDrop.value = `${name} moved to ${to === 'todo' ? 'To do' : 'Done'}.`;
  };

  const reorder = (from: number, to: number): void => {
    const next = [...order.value];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    order.value = next;
  };

  const removeChosen = (): void => {
    const row = chosen.value;
    if (row !== null) {
      order.value = order.value.filter(entry => entry !== row);
      chosen.value = null;
    }
  };

  const chip = (name: string): UiChild => (
    <box
      key={name}
      paddingX={10}
      paddingY={6}
      borderRadius={999}
      borderWidth={1}
      borderColor="border"
      backgroundColor="controlBackground"
      cursor="grab"
      modifiers={[
        // `lift`, not `zIndex`: zIndex reorders a node among its siblings,
        // and the chip's siblings are the other chips in its own tray. The
        // tray it is being carried into is painted after the one it left,
        // so a chip raised only by zIndex went behind it. Lifted, the chip
        // is drawn after everything on the screen.
        draggable({ keepOffset: false, dragging: { opacity: 0.7, lift: true } }),
        dragSource({ payload: { type: CHIP, data: name }, dragging: { borderColor: 'controlAccent' } })
      ]}>
      <text text={name} fontSize={12} color="text" selectable={false} />
    </box>
  );

  const tray = (id: 'todo' | 'done', title: string): UiChild => (
    <column
      key={id}
      flex={1}
      height={110}
      gap={8}
      padding={10}
      borderRadius={12}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface"
      modifiers={[
        dropTarget({
          accepts: CHIP,
          onDrop: payload => {
            moveChip(String(payload.data), id);
            return 'move';
          },
          // The state a drop zone has to show, written by the modifier
          // because the state is the modifier's: an application cannot
          // see "something I would take is over me" without keeping a
          // second copy of the drag.
          over: { borderColor: 'controlAccent', backgroundColor: 'selectionBackground' }
        })
      ]}>
      <text text={title} fontSize={12} color="textMuted" selectable={false} />
      <row gap={6}>{trays.pipe(map(state => state[id].map(chip)))}</row>
    </column>
  );

  const row = (name: string, index: number, isHeld: boolean, isChosen: boolean): UiChild => (
    <row
      key={name}
      width={percent(100)}
      height={34}
      paddingX={10}
      y="center"
      gap={10}
      borderRadius={8}
      backgroundColor={isChosen ? 'selectionBackground' : 'surface'}
      cursor="grab"
      focusable
      role="listitem"
      label={name}
      onClick={() => (chosen.value = name)}
      // What has focus is what the palette lists against, so a shortcut
      // scoped to the list shows up only while a row in it is focused.
      onFocus={(event: UiFocusEvent) => onFocusChange(event.target)}
      onBlur={() => onFocusChange(null)}
      modifiers={[
        reorderable({
          list: 'board',
          index,
          onMove: reorder,
          dragging: { backgroundColor: 'controlBackgroundHovered', zIndex: 1 },
          onDragChange: dragging => (held.value = dragging ? name : null)
        }),
        contextMenu({
          onOpen: at => {
            // Where before what: the menu reads `at` when it opens, and
            // opening is what writing `menuFor` does, so the point has
            // to be in place before the menu goes looking for it.
            menuAt.value = at;
            menuFor.value = name;
          }
        }),
        CONTROL,
        RING
      ]}>
      <text text={name} fontSize={12} color={isChosen ? 'selectionForeground' : 'text'} selectable={false} />
      <box flexGrow={1} />
      <text text={isHeld ? 'carrying' : ''} fontSize={11} color="textMuted" selectable={false} />
    </row>
  );

  return (
    <row width={percent(100)} flex={1} gap={16} x="stretch">
      <column flex={1} gap={10}>
        <text
          text="Drag a chip from one tray to the other. The tray it would land in says so."
          fontSize={12}
          color="textMuted"
        />
        <row width={percent(100)} gap={12} x="stretch">
          {tray('todo', 'To do')}
          {tray('done', 'Done')}
        </row>
        <text text={lastDrop} fontSize={12} color="textMuted" />
      </column>
      <column width={340} gap={8}>
        <text text="Carry a row. Hold it at the bottom edge and the list scrolls." fontSize={12} color="textMuted" />
        <scrollview
          height={230}
          width={percent(100)}
          padding={6}
          gap={4}
          borderRadius={12}
          borderWidth={1}
          borderColor="border"
          backgroundColor="background"
          role="list"
          label="Rows"
          modifiers={[
            // The reorder's own payload, so a row carried to the edge of
            // the list scrolls it. The zone takes nothing itself: the
            // row underneath the pointer is deeper and wins the drop.
            dropTarget({ accepts: 'gesso/reorder', onDrop: () => 'move', autoScroll: { edge: 40, speed: 700 } }),
            shortcut({
              registry,
              keys: 'Delete',
              label: 'Remove the chosen row',
              group: 'Board',
              when: () => chosen.value !== null,
              run: removeChosen
            })
          ]}>
          {combineLatest([order, held, chosen]).pipe(
            map(([rows, carrying, picked]) =>
              rows.map((name, index) => row(name, index, carrying === name, picked === name))
            )
          )}
        </scrollview>
        <text
          text={chosen.pipe(
            map(name => (name === null ? 'No row chosen. Click one.' : `${name} chosen. Delete removes it.`))
          )}
          fontSize={12}
          color="textMuted"
        />
      </column>
      <Menu
        open={menuFor.pipe(map(name => name !== null))}
        at={menuAt}
        items={MENU_ITEMS}
        label="Row commands"
        onOpenChange={(open: boolean) => {
          if (!open) {
            menuFor.value = null;
          }
        }}
        onSelect={(value: string) => {
          const name = menuFor.value;
          if (name === null) {
            return;
          }
          if (value === 'choose') {
            chosen.value = name;
          } else if (value === 'top') {
            reorder(order.value.indexOf(name), 0);
          } else {
            order.value = order.value.filter(entry => entry !== name);
          }
        }}
      />
    </row>
  );
}

const MENU_ITEMS = [
  { value: 'choose', label: 'Choose this row' },
  { value: 'top', label: 'Move to the top' },
  { value: 'remove', label: 'Remove' }
];

// ---------------------------------------------------------------------------
// Files: the drop that has no shell behind it yet
// ---------------------------------------------------------------------------

/**
 * The zone an OS file drop would land in.
 *
 * The message shape is defined and `UiDragSession.applyFileDrop` turns
 * one into an ordinary drag, so this zone is written exactly as the
 * trays are and cannot tell the two apart. What is missing is the shell
 * half: nothing on the main thread listens for the browser's `dragover`
 * and `drop` and posts a `fileDrop` message yet, because the shell is
 * another workstream's. Until it does, this zone lights up for a drag
 * that started inside the application and for nothing else.
 */
function FilesPane(inputs: Inputs<PaneProps>, _ctx: ComponentContext): UiChild {
  const registry = inputs.registry.value;
  const dropped = internalState<readonly string[]>([]);

  return (
    <row width={percent(100)} flex={1} gap={16} x="stretch">
      <box
        key="keys"
        width={0}
        height={0}
        modifiers={[
          shortcut({
            registry,
            keys: 'Mod+Backspace',
            label: 'Forget the dropped files',
            group: 'Files',
            scoped: false,
            run: () => (dropped.value = [])
          })
        ]}
      />
      {createComponent(Card, {
        width: 460,
        title: 'Files dragged in from the desktop',
        children: (
          <column gap={10} width={percent(100)}>
            <column
              width={percent(100)}
              height={140}
              x="center"
              y="center"
              borderRadius={12}
              borderWidth={1}
              borderColor="border"
              backgroundColor="surface"
              modifiers={[
                dropTarget({
                  accepts: 'gesso/files',
                  onDrop: payload => {
                    const files = payload.data as readonly { name: string }[];
                    dropped.value = [...dropped.value, ...files.map(file => file.name)];
                    return 'copy';
                  },
                  over: { borderColor: 'controlAccent', backgroundColor: 'selectionBackground' }
                })
              ]}>
              <text text="Drop files here" fontSize={12} color="textMuted" />
            </column>
            <text
              text={dropped.pipe(map(names => (names.length === 0 ? 'Nothing dropped yet.' : names.join(', '))))}
              fontSize={12}
              color="textMuted"
            />
            <text
              text="A zone that accepts gesso/files is a zone like any other: the session turns the shell's message into a drag and this one never learns where it came from. The shell that posts the message is the desktop adapter's work and does not exist yet."
              fontSize={12}
              color="textMuted"
            />
          </column>
        )
      })}
    </row>
  );
}

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------

interface PaletteProps {
  readonly registry: UiShortcutRegistry;
  readonly open: boolean;
  /** What holds focus, so a scoped shortcut is listed only where it fires. */
  readonly focused: UiNode | null;
  readonly onClose: () => void;
}

/**
 * Every command that would run right now, listed.
 *
 * It asks the registry the same question the key handler asks,
 * `active(focused)`, so it cannot offer a command that would not fire
 * and cannot hide one that would. That is the thing a root `onKeyDown`
 * switching on the route could never give an application: the keys only
 * ever existed inside the handler's control flow, so nothing could
 * enumerate them, and neither application has a help sheet as a result.
 */
function Palette(inputs: Inputs<PaletteProps>, _ctx: ComponentContext): UiChild {
  const registry = inputs.registry.value;

  const contents = combineLatest([inputs.open, inputs.focused]).pipe(
    map(([open, node]) => (open ? [panel(registry, node, () => inputs.onClose.value())] : []))
  );

  return <column width={percent(100)}>{contents}</column>;
}

function panel(registry: UiShortcutRegistry, focused: UiNode | null, close: () => void): UiChild {
  return (
    <column
      key="palette"
      width={percent(100)}
      gap={6}
      padding={12}
      borderRadius={12}
      borderWidth={1}
      borderColor="border"
      backgroundColor="surface">
      <row width={percent(100)} y="center">
        <text text="Every shortcut that is live" fontSize={13} color="text" />
        <box flexGrow={1} />
        <button
          paddingX={10}
          paddingY={4}
          borderRadius={8}
          borderWidth={1}
          borderColor="border"
          backgroundColor="controlBackground"
          cursor="pointer"
          label="Close the palette"
          onClick={close}
          modifiers={[CONTROL, RING]}>
          <text text="Close" fontSize={12} color="text" />
        </button>
      </row>
      {registry.active(focused).map(binding => (
        <row key={`${binding.group ?? ''}:${binding.keys}`} width={percent(100)} y="center" gap={10}>
          <box
            width={120}
            paddingX={8}
            paddingY={3}
            borderRadius={6}
            borderWidth={1}
            borderColor="border"
            backgroundColor="controlBackground">
            <text text={binding.display} fontSize={11} color="text" />
          </box>
          <text text={binding.label} fontSize={12} color="text" />
          <box flexGrow={1} />
          <text text={binding.group ?? ''} fontSize={11} color="textMuted" />
        </row>
      ))}
    </column>
  );
}
