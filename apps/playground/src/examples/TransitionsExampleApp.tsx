import { combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';

import {
  type ComponentContext,
  type Inputs,
  internalState,
  input,
  type OutletProps,
  route,
  RouterOutlet,
  RouterService,
  ShellService
} from '@gesso/framework';
import { Icon, Image, Video } from '@gesso/components';
import {
  fade,
  motion,
  percent,
  scaleFrom,
  sharedElement,
  slideDown,
  scrollPosition,
  slideUp,
  focusRing,
  interactive,
  type UiChild,
  type UiKeyboardEvent,
  type UiModifier,
  type UiPointerEvent
} from '@gesso/core';

import { CARDS, cardById, ICONS, type CardDesign } from './transitions/playlists';
import { likedPlaylist, likedTrack, savedPlaylist, toggle } from './transitions/library';
import { Catalogue, type PlaylistView, type TrackView } from './transitions/TransitionsContract';
import { SNAPSHOT } from './transitions/snapshot';
import { CHALK, INK, LINEN } from './brand';

/**
 * A replica of Maxi Ferreira's `view-transitions-live` demo — three
 * playlist cards that expand into a full screen — built on Gesso's
 * motion layer instead of the browser's View Transitions API, and then
 * made real: the three playlists are real Audius playlists, read on the
 * application worker and published over one channel.
 *
 * The original is worth knowing about, because the two solve the same
 * problem from opposite ends. In a document there is no old DOM left
 * to animate by the time the new one exists, so the browser
 * **snapshots** the old page, applies the change, snapshots the new
 * one, and cross-fades pseudo-elements between the two rasters; the
 * twelve `view-transition-name` declarations in the original are how
 * you tell it which snapshots pair up.
 *
 * Gesso keeps a retained scene graph, so both elements are real, live
 * and measurable at the same moment. `sharedElement({ name })` is
 * therefore not a snapshot at all — it is FLIP on the actual node: the
 * arriving element asks the registry where the element with that name
 * was standing, and springs from that box to its own. It is
 * interruptible (click a card, then Back before it lands), it costs no
 * raster, and everything inside it stays live the whole way.
 *
 * Three things are worth reading for.
 *
 *   - **Names are per playlist, not per screen.** The original adds a
 *     `.with-transition` class to the one card being navigated to, so
 *     that three cards do not all claim `playlist-image`. Here the
 *     name simply carries the id — `playlist-image-2` — and the
 *     coordination disappears. A name registry can do that; a CSS
 *     class cannot.
 *
 *   - **The card background morphs by geometry, everything else by
 *     transform.** A rounded rectangle changing aspect ratio cannot be
 *     scaled without stretching its corners into ellipses, so the
 *     background animates its own `left`/`top`/`width`/`height` and
 *     pays for a relayout per frame. Everything else — the title, the
 *     avatar, the picture, the controls — is a translate and a scale,
 *     which is paint-only. The original needs bespoke `object-fit`
 *     rules for exactly the same one element.
 *
 *   - **The video keeps playing across the navigation, and nothing
 *     here arranges that.** The original has to physically move its
 *     `<video>` element into the new DOM, because a second `<video>`
 *     on the same source would start from the beginning. Here the
 *     resolver reference-counts playback by source: the detail screen's
 *     `Video` resolves the file the card is still holding and gets the
 *     decode that is already running. See `VideoResolver`.
 *
 * And one thing about the data. A card's colours and its photograph are
 * design, and live in `transitions/playlists.ts`; everything a card
 * *says* comes from `Catalogue`, a channel the application worker
 * serves from Audius, starting on a committed snapshot so the first
 * frame is already real. The screens bind to the channel's observables
 * and never learn which of the two they are showing.
 */

const COLUMN_WIDTH = 600;
/** The card's own size, as the original draws it. */
const CARD_WIDTH = 552;
/**
 * Space kept either side of a card once the window is too narrow to
 * give it its full width, so it never runs into the edge.
 */
const GUTTER = 20;
const CARD_HEIGHT = 562;
const CARD_RADIUS = 32;
/** How tall the artwork is on a card and on a playlist page. */
const CARD_MEDIA_HEIGHT = 360;
const PAGE_MEDIA_HEIGHT = 480;
const HEADER_HEIGHT = 74;
/*
 * This screen is the light half of the brand: chalk ground for the
 * page, plain white for the cards and sheets that carry artwork, and
 * ink for text. The two greys are the brand's neutrals rather than
 * true greys — chalk and ink mixed — so nothing on the page goes cold
 * next to the linen mark. See `brand/README.md`.
 */
const PAGE_BACKGROUND = CHALK;
/** A card or a sheet lifted off the chalk ground. */
const CARD = '#ffffff';
/** Secondary and tertiary text, and the icons that behave like it. */
const MUTED = '#6f675c';
const FAINT = '#a09789';
/** The placeholder behind artwork that has not arrived, or does not exist. */
const ART_PLACEHOLDER = '#e9e2d6';
const MARK_VIEWBOX = 64;
const MARK_RADIUS = 12;
/** The heart, once it is full. */
const LIKED = '#ff5c7a';

/*
 * How a control answers the pointer. One shared value per look, because
 * a modifier's arguments are compared by identity: a fresh
 * `interactive(...)` per render would detach and re-attach on every
 * frame. Passing one to a `button` replaces its default interaction
 * rather than doubling it (see `Button` in `UiComponents.ts`).
 */
/**
 * The dark round controls over the artwork: lighten a step on hover,
 * settle back on press.
 *
 * Opaque greys rather than a lighter translucent black, which would be
 * the natural choice over a photograph. A translucent override paints
 * as nothing while the card's hover scale is active, though the same
 * value paints correctly on the playlist page where nothing above it is
 * transformed, and the declared translucent resting colour paints in
 * both places. That is a renderer question, recorded in
 * `docs/TRANSITIONS_ROADMAP.md`, and an opaque grey sidesteps it.
 */
const DARK_CONTROL_INTERACTION = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: '#3a3a3a' },
  pressed: { backgroundColor: '#262626' }
});
/** The white controls: the big play button and the add badge. */
const LIGHT_CONTROL_INTERACTION = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: '#f1ece3' },
  pressed: { backgroundColor: '#e6dfd3' }
});
/** A small icon button on a white sheet, such as a track's heart. */
const SHEET_CONTROL_INTERACTION = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: 'rgba(0, 0, 0, 0.06)' },
  pressed: { backgroundColor: 'rgba(0, 0, 0, 0.1)' }
});
const RING = focusRing();

/** A hex colour at an opacity, for a tint drawn from the playlist's own palette. */
function alpha(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Where the list was left, so Back returns to it.
 *
 * Module scope on purpose: the list screen is destroyed when a playlist
 * opens and built again when you come back, so anything remembered
 * inside it would go with it. The original keeps the same number in the
 * same place, and for the same reason (`prevPageScroll`).
 *
 * It buys more than convenience here. A shared element is picked up
 * from where it is *seen*, so the third card only morphs back into
 * itself if the list underneath it is where it was when you left.
 */
const listScroll = internalState(0);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const Home = route({ path: '/', component: HomeScreen });
export const Detail = route({ path: '/playlist/:id', component: DetailScreen });

export const ROUTES = { routes: [Home, Detail] };

// ---------------------------------------------------------------------------
// The catalogue, as a screen reads it
// ---------------------------------------------------------------------------

/**
 * What Audius says about one card's playlist, as the screen has it now.
 *
 * Always a value: the snapshot has every card, so a list that has not
 * yet been patched, or one whose live copy lost a card, still names
 * something. `distinctUntilChanged` keeps a patch to another card from
 * re-emitting this one.
 */
function playlistFor(ctx: ComponentContext, id: string): Observable<PlaylistView> {
  const fallback = SNAPSHOT.playlists.find(playlist => playlist.id === id) ?? SNAPSHOT.playlists[0]!;
  return ctx.channel(Catalogue).view.playlists.pipe(
    map(list => list.find(playlist => playlist.id === id) ?? fallback),
    distinctUntilChanged()
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** The play-count and duration line, which both screens show. */
function Stats(props: Inputs<{ card: CardDesign; playlist: PlaylistView }>): UiChild {
  const card = props.card.value;
  return (
    <row
      gap={8}
      x="center"
      y="center"
      modifiers={[sharedElement({ name: `playlist-stats-${card.id}`, scale: 'uniform' })]}>
      <row gap={4} y="center">
        <Icon path={ICONS.bars} size={14} color={card.secondaryText} />
        <text color={card.secondaryText} fontSize={13} selectable={false}>
          {props.playlist.pipe(map(playlist => playlist.plays))}
        </text>
      </row>
      <text color={card.secondaryText} fontSize={13} selectable={false}>
        -
      </text>
      <row gap={4} y="center">
        <Icon path={ICONS.clock} size={14} color={card.secondaryText} fillRule="evenodd" />
        <text color={card.secondaryText} fontSize={13} selectable={false}>
          {props.playlist.pipe(map(playlist => playlist.time))}
        </text>
      </row>
    </row>
  );
}

/**
 * Audius serves one picture from whichever of its mirrors answers, so
 * two requests for the same artwork return two urls that differ only
 * in host. This is the part that names the picture: the content id and
 * size after `/content/`, or the whole url for anything else.
 *
 * Found by watching the avatars vanish. The snapshot's url and the live
 * copy's named different hosts, so the picture was thrown away and
 * fetched again from a slower mirror, and the slot sat empty while it
 * loaded. Compared by content instead, the same picture stays put.
 */
function artworkKey(url: string): string {
  const at = url.indexOf('/content/');
  return at === -1 ? url : url.slice(at);
}

/**
 * The curator's picture, or their initial when Audius has none.
 *
 * The picture is an `Image`, which reads its source once, so a curator
 * who changes (the snapshot giving way to a live copy with a different
 * picture) is a new keyed node; `distinctUntilChanged` on the content
 * keeps the usual case, where the two agree, from rebuilding anything.
 * The shared name sits on the inner element either way, so it morphs
 * between the screens.
 */
function Avatar(props: Inputs<{ card: CardDesign; playlist: PlaylistView; size: number }>): UiChild {
  const card = props.card.value;
  const size = props.size.value;
  const shared = [sharedElement({ name: `playlist-avatar-${card.id}` })];
  const picture = props.playlist.pipe(
    map(playlist => playlist.curator),
    distinctUntilChanged((a, b) => artworkKey(a.avatar) === artworkKey(b.avatar) && a.name === b.name),
    map(curator =>
      curator.avatar !== '' ? (
        <Image
          key={artworkKey(curator.avatar)}
          src={curator.avatar}
          alt={curator.name}
          width={size}
          height={size}
          borderRadius={size / 2}
          objectFit="cover"
          // A tint of the card's text while the picture loads, so the
          // slot reads as a picture on its way rather than a hole.
          placeholderColor={alpha(card.text, 0.18)}
          rootModifiers={shared}
        />
      ) : (
        <box
          key="initial"
          width={size}
          height={size}
          borderRadius={size / 2}
          backgroundColor={CARD}
          x="center"
          y="center"
          role="image"
          label={curator.name}
          modifiers={shared}>
          <text color={INK} fontSize={size * 0.44} fontWeight={700} selectable={false}>
            {curator.name.slice(0, 1).toUpperCase()}
          </text>
        </box>
      )
    )
  );
  return (
    <box width={size} height={size} flexShrink={0}>
      {picture}
    </box>
  );
}

/**
 * A round control button, as the player row is made of.
 *
 * A real `button`: it has a label for a screen reader, answers hover
 * and press through `interactive`, shows the focus ring, and asks for
 * the pointer. `active` is for the controls that are toggles, and is
 * reported as the `pressed` state so the mirror says "pressed" rather
 * than leaving the person to guess from the colour of a heart.
 */
function Control(
  props: Inputs<{
    path: string;
    label: string;
    onClick: () => void;
    big?: boolean;
    stroke?: boolean;
    active?: boolean;
    /** The icon's colour while `active`; the resting colour otherwise. */
    activeColor?: string;
    rootModifiers?: readonly UiModifier[];
  }>
): UiChild {
  const big = input(props.big, false).value;
  const active = input(props.active, false);
  const size = big ? 70 : 46;
  const resting = big ? INK : CHALK;
  // An `Icon` reads its props once, so a glyph that changes is a new
  // `Icon`, keyed so the reconciler replaces the node rather than
  // handing new props to a body that has already run; `Image`'s
  // docblock says the same of a changing `src`. The child is an
  // Observable, and each toggle costs one rasterisation, which is what
  // a changed glyph costs whichever way it is asked for.
  const icon = combineLatest([props.path, input(props.stroke, false), active, input(props.activeColor, resting)]).pipe(
    map(([path, stroke, on, tint]) => (
      <Icon
        key={`${path}|${stroke ? 'stroke' : 'fill'}|${on ? 'on' : 'off'}`}
        path={path}
        size={big ? 26 : 20}
        color={on ? tint : resting}
        style={stroke ? 'stroke' : 'fill'}
        strokeWidth={2}
        fillRule="evenodd"
      />
    ))
  );
  return (
    <button
      width={size}
      height={size}
      borderRadius={size / 2}
      backgroundColor={big ? CARD : 'rgba(0, 0, 0, 0.8)'}
      x="center"
      y="center"
      cursor="pointer"
      label={props.label}
      states={active.pipe(map(on => (on ? ['pressed'] : [])))}
      onClick={(event: UiPointerEvent) => {
        // The controls sit inside the card, which is a button of its
        // own: a press here must not also open the playlist.
        event.stopPropagation();
        props.onClick.value();
      }}
      modifiers={[
        big ? LIGHT_CONTROL_INTERACTION : DARK_CONTROL_INTERACTION,
        RING,
        ...(props.rootModifiers.value ?? [])
      ]}>
      {/* In an array, because a lone Observable child of a `button` is
          read as its text label; see `jsx-runtime`. */}
      {[icon]}
    </button>
  );
}

/**
 * The `+` that saves a playlist to the library, and turns into a tick
 * once it has. On the card it is the 40px button in the header; on the
 * playlist page it is the 24px badge on the avatar. Same element, same
 * shared name, so it morphs between the two.
 */
function SaveBadge(props: Inputs<{ card: CardDesign; size: number; iconSize: number }>): UiChild {
  const card = props.card.value;
  const size = props.size.value;
  const saved = savedPlaylist(card.id);
  return (
    <button
      width={size}
      height={size}
      borderRadius={size / 2}
      backgroundColor={CARD}
      x="center"
      y="center"
      cursor="pointer"
      label={saved.pipe(map(on => (on ? 'Remove from your library' : 'Save to your library')))}
      states={saved.pipe(map(on => (on ? ['pressed'] : [])))}
      onClick={(event: UiPointerEvent) => {
        event.stopPropagation();
        toggle(saved);
      }}
      modifiers={[LIGHT_CONTROL_INTERACTION, RING, sharedElement({ name: `playlist-add-${card.id}` })]}>
      {[
        saved.pipe(
          map(on => (
            <Icon
              key={on ? 'check' : 'plus'}
              path={on ? ICONS.check : ICONS.plus}
              size={props.iconSize.value}
              color={INK}
              style="stroke"
              strokeWidth={3}
            />
          ))
        )
      ]}
    </button>
  );
}

/**
 * The row of player controls over the artwork: shuffle, play, like, and
 * on the playlist page a fourth that opens the playlist on Audius.
 *
 * Each button is its own shared element, not the row. A shared element
 * scales by the ratio of the two boxes, so a row named as one piece
 * whose width differed between the card and the page arrived squashed
 * and stretched back out, and every circle in it was an ellipse for the
 * whole of the morph. Measured exactly that, with the morph slowed
 * down. Named one by one, each button pairs with a box of its own size
 * and the morph is a pure translate, so a circle stays a circle all the
 * way. The button that exists only on the page has nothing to pair
 * with; it simply arrives, like the back button.
 *
 * Play is wired to nothing yet, on purpose: it will drive the queue once
 * there is one, and a button that pretended to play would be worse than
 * one plainly waiting for its player.
 */
function PlayerControls(
  props: Inputs<{ card: CardDesign; playlist: PlaylistView; full?: boolean }>,
  ctx: ComponentContext
): UiChild {
  const card = props.card.value;
  const full = input(props.full, false).value;
  const shell = ctx.inject(ShellService);
  const liked = likedPlaylist(card.id);
  const shared = (control: string): readonly UiModifier[] => [
    sharedElement({ name: `playlist-control-${control}-${card.id}` })
  ];
  const arrives: readonly UiModifier[] = [motion({ initial: fade, duration: 'slow' })];
  return (
    <box position="absolute" left={0} right={0} bottom={0} x="center">
      <row gap={20} y="center" paddingTop={28} paddingBottom={28}>
        <Control path={ICONS.shuffle} label="Shuffle" stroke onClick={() => {}} rootModifiers={shared('shuffle')} />
        <Control path={ICONS.play} label="Play" big onClick={() => {}} rootModifiers={shared('play')} />
        <Control
          path={liked.pipe(map(on => (on ? ICONS.heart : ICONS.heartOutline)))}
          stroke={liked.pipe(map(on => !on))}
          label={liked.pipe(map(on => (on ? 'Unlike this playlist' : 'Like this playlist')))}
          active={liked}
          activeColor={LIKED}
          onClick={() => toggle(liked)}
          rootModifiers={shared('like')}
        />
        {full
          ? [
              <Control
                key="open"
                path={ICONS.external}
                label="Open on Audius"
                stroke
                onClick={() => shell.openUrl(props.playlist.value.url)}
                rootModifiers={arrives}
              />
            ]
          : []}
      </row>
    </box>
  );
}

/**
 * The artwork: a picture or a playing video, and the controls over it.
 *
 * The two branches differ by one component. Everything about the
 * transition — the shared name, the fit, the rounded corner — is the
 * same for both, which is the point of `Video` having `Image`'s shape.
 */
function Artwork(props: Inputs<{ card: CardDesign; playlist: PlaylistView; height: number }>): UiChild {
  const card = props.card.value;
  const height = props.height.value;
  const media = card.media;
  const alt = props.playlist.pipe(map(playlist => playlist.title));
  const shared = [sharedElement({ name: `playlist-image-${card.id}` })];
  if (media.kind === 'video') {
    // Edge to edge, as the original's `video.playlist-image` is: full
    // width, cropped to fill, and rounded so its bottom corners meet
    // the card's. The radius is uniform because both renderers collapse
    // a per-corner radius to its largest corner — see
    // `uniformBorderRadius` — so the original's `0 0 2rem 2rem` is not
    // a thing this can draw yet.
    return (
      <Video
        src={media.url}
        alt={alt}
        width={percent(100)}
        height={height}
        objectFit="cover"
        borderRadius={CARD_RADIUS}
        rootModifiers={shared}
      />
    );
  }
  const width = Math.round((media.width / media.height) * height);
  return <Image src={media.url} alt={alt} width={width} height={height} objectFit="cover" rootModifiers={shared} />;
}

// ---------------------------------------------------------------------------
// The home screen
// ---------------------------------------------------------------------------

/**
 * One card in the list.
 *
 * Every element that continues onto the detail screen carries a
 * `sharedElement` with this playlist's id in its name. Nothing else
 * about the card knows a transition exists.
 */
function Card(props: Inputs<{ card: CardDesign; onOpen: (id: string) => void }>, ctx: ComponentContext): UiChild {
  const card = props.card.value;
  const playlist = playlistFor(ctx, card.id);
  const hovered = internalState(false);
  /**
   * Whether this card's background is morphing, which is the only time
   * the card is bigger than itself.
   *
   * Coming back from a playlist the background shrinks from the whole
   * page down to the card, so for those few hundred milliseconds it
   * covers the cards below — and has to be drawn over them. Paint order
   * is tree order among siblings, so without this the card below simply
   * paints on top and the page appears to shrink *behind* it.
   *
   * The framework reports the morph and the card decides what it means,
   * because what has to rise is the card and not the background inside
   * it: raising the background would lift it over the card's own title
   * and avatar, which is worse than the problem. See
   * `SharedElementArgs.onMorph`.
   */
  const morphing = internalState(false);
  return (
    <button
      width={percent(100)}
      maxWidth={CARD_WIDTH}
      height={CARD_HEIGHT}
      position="relative"
      zIndex={morphing.pipe(map(active => (active ? 1 : 0)))}
      x="center"
      cursor="pointer"
      label={playlist.pipe(map(entry => entry.title))}
      onClick={() => props.onOpen.value(card.id)}
      onPointerEnter={() => (hovered.value = true)}
      onPointerLeave={() => (hovered.value = false)}
      modifiers={[
        // The original's `.card:hover { transform: scale(0.97) }`, and
        // the cheapest possible thing this framework can do: one
        // paint-only channel on a spring.
        motion({
          state: hovered.pipe(map(over => (over ? scaleFrom(0.97) : null))),
          spring: 'gentle'
        })
      ]}>
      {/* The background is its own absolutely positioned element so it
          can morph by geometry: a card's 32px corners have to square
          off into the page rather than stretch. */}
      {/* Sized rather than pinned by insets: a geometry morph animates
          `width` and `height`, and an element held by `left` *and*
          `right` has no width of its own to animate. */}
      <box
        position="absolute"
        left={0}
        top={0}
        width={percent(100)}
        height={percent(100)}
        borderRadius={CARD_RADIUS}
        backgroundColor={card.background}
        modifiers={[
          sharedElement({
            name: `playlist-background-${card.id}`,
            morph: 'geometry',
            onMorph: active => (morphing.value = active)
          })
        ]}
      />
      {/* Positioned, so it paints above the absolutely positioned
          background: a positioned element sits in the positioned layer,
          which is above in-flow content. The original marks its card
          header, title, stats and media `position: relative` for
          exactly this reason. */}
      <column position="relative" width={percent(100)} height={percent(100)} x="center">
        <row width={percent(100)} gap={12} paddingLeft={30} paddingRight={30} paddingTop={20} paddingBottom={20}>
          <Avatar card={card} playlist={playlist} size={50} />
          {/* `x="start"` so each line hugs its text rather than
              stretching to the column: a shared element morphs by the
              ratio of the two boxes, and a name whose glyphs are 14px
              in both places but whose *box* is 378 wide here and 133
              on the page would be scaled 2.8x wide and shrunk back. It
              is the box that has to match, not just the type. The
              detail screen's column hugs for the same reason, by
              centring. */}
          <column flex={1} gap={2} y="center" x="start">
            <text
              color={card.text}
              fontSize={14}
              fontWeight={700}
              selectable={false}
              modifiers={[sharedElement({ name: `playlist-user-${card.id}`, scale: 'uniform' })]}>
              {playlist.pipe(map(entry => entry.curator.name.toUpperCase()))}
            </text>
            <text
              color={card.secondaryText}
              fontSize={13}
              selectable={false}
              modifiers={[sharedElement({ name: `playlist-date-${card.id}`, scale: 'uniform' })]}>
              {playlist.pipe(map(entry => entry.date))}
            </text>
          </column>
          <SaveBadge card={card} size={40} iconSize={20} />
        </row>
        <text
          color={card.text}
          fontSize={30}
          fontWeight={700}
          textAlign="center"
          selectable={false}
          modifiers={[sharedElement({ name: `playlist-title-${card.id}`, scale: 'uniform' })]}>
          {playlist.pipe(map(entry => entry.title))}
        </text>
        <box height={10} />
        <Stats card={card} playlist={playlist} />
        {/* The slack lives here, so the artwork is flush with the bottom
            of the card whatever the title wrapped to. */}
        <box flexGrow={1} minHeight={20} />
        <box position="relative" width={percent(100)} x="center">
          <Artwork card={card} playlist={playlist} height={CARD_MEDIA_HEIGHT} />
          <PlayerControls card={card} playlist={playlist} />
        </box>
      </column>
    </button>
  );
}

function HomeScreen(_props: Inputs<OutletProps>, ctx: ComponentContext): UiChild {
  const router = ctx.inject(RouterService);
  const catalogue = ctx.channel(Catalogue);
  const open = (id: string): void => router.go(Detail, { id });
  // One quiet line when Audius did not answer, and nothing at all
  // otherwise: the snapshot is the same shape as the live copy, so the
  // only thing worth saying is that it is a copy.
  const offline = catalogue.view.source.pipe(
    map(source =>
      source === 'offline'
        ? [
            <text key="offline" color={FAINT} fontSize={12} textAlign="center" textWrap="word" maxWidth={480}>
              Offline: showing a saved copy of the playlists.
            </text>
          ]
        : []
    )
  );
  return (
    // The two halves of remembering a scroll position, and they are
    // deliberately different mechanisms. `scrollPosition` reports where
    // the list has got to — the runtime moves that offset behind the
    // application's back, so nothing else could say. `scrollY` puts it
    // back, as an ordinary binding, so a list built again after Back is
    // laid out where it was left *before it paints* — which is also
    // what lets the card morph back from where it was actually seen.
    <scrollview
      scrollY={listScroll}
      modifiers={[scrollPosition({ onChange: at => (listScroll.value = at.y) })]}
      width={percent(100)}
      height={percent(100)}>
      <column
        width={percent(100)}
        paddingTop={HEADER_HEIGHT + 20}
        paddingBottom={40}
        paddingLeft={GUTTER}
        paddingRight={GUTTER}
        gap={20}
        x="center">
        {CARDS.map(card => (
          <Card key={card.id} card={card} onOpen={open} />
        ))}
        <column width={percent(100)} maxWidth={CARD_WIDTH} gap={10} paddingTop={20} x="center">
          <text color={MUTED} fontSize={13} textAlign="center" textWrap="word" maxWidth={480}>
            A replica of Maxi Ferreira’s View Transitions demo, built on Gesso’s motion layer: shared elements are FLIP
            over the live scene graph rather than snapshots, the video decodes in the render worker through WebCodecs,
            and the playlists are read from Audius on the application worker.
          </text>
          <text color={FAINT} fontSize={12} textAlign="center" textWrap="word" maxWidth={480}>
            Original concept by Ehsan Rahimi. Photographs by Atikh Bana and Te NGuyen; video by Anna Shvets. Music from
            Audius, where every track belongs to the artist who uploaded it.
          </text>
          {offline}
        </column>
      </column>
    </scrollview>
  );
}

// ---------------------------------------------------------------------------
// The detail screen
// ---------------------------------------------------------------------------

/**
 * One track. The heart is a toggle; the row itself is not yet a button,
 * because pressing a track has to play it and there is no player yet.
 * The more menu waits for the same reason: its items are things done to
 * a playing track.
 */
function TrackRow(props: Inputs<{ track: TrackView }>): UiChild {
  const track = props.track.value;
  const liked = likedTrack(track.id);
  return (
    <row width={percent(100)} gap={20} paddingLeft={20} paddingRight={20} paddingTop={10} paddingBottom={10} y="center">
      {track.art !== '' ? (
        <Image
          src={track.art}
          alt={track.title}
          width={60}
          height={60}
          borderRadius={6}
          objectFit="cover"
          placeholderColor={ART_PLACEHOLDER}
        />
      ) : (
        <box width={60} height={60} borderRadius={6} backgroundColor={ART_PLACEHOLDER} flexShrink={0} />
      )}
      <column flex={1} gap={4}>
        <text color={INK} fontSize={14} fontWeight={700} selectable={false} maxLines={1} textOverflow="ellipsis">
          {track.title}
        </text>
        <text color={MUTED} fontSize={13} selectable={false} maxLines={1} textOverflow="ellipsis">
          {track.artist}
        </text>
      </column>
      <text color={FAINT} fontSize={13} selectable={false}>
        {track.duration}
      </text>
      <button
        width={36}
        height={36}
        borderRadius={18}
        x="center"
        y="center"
        cursor="pointer"
        label={liked.pipe(map(on => (on ? `Unlike ${track.title}` : `Like ${track.title}`)))}
        states={liked.pipe(map(on => (on ? ['pressed'] : [])))}
        onClick={() => toggle(liked)}
        modifiers={[SHEET_CONTROL_INTERACTION, RING]}>
        {[
          liked.pipe(
            map(on => (
              <Icon
                key={on ? 'liked' : 'unliked'}
                path={on ? ICONS.heart : ICONS.heartOutline}
                style={on ? 'fill' : 'stroke'}
                strokeWidth={1.8}
                size={22}
                color={on ? LIKED : FAINT}
              />
            ))
          )
        ]}
      </button>
    </row>
  );
}

function DetailScreen(_props: Inputs<OutletProps>, ctx: ComponentContext): UiChild {
  const router = ctx.inject(RouterService);
  const catalogue = ctx.channel(Catalogue);
  const params = router.params(Detail);
  const card = cardById(params?.id ?? '1');
  const playlist = playlistFor(ctx, card.id);

  /**
   * The background's corner radius, animated declaratively.
   *
   * The geometry morph carries the box; the corners are a separate
   * question, and the answer is already in the framework — a
   * `transition` on a property animates it whenever it changes, so
   * starting at the card's 32 and writing 0 once the screen is up is
   * the whole of it.
   */
  const radius = internalState(CARD_RADIUS);
  ctx.onMount(() => {
    radius.value = 0;
  });
  // Per screen rather than module-level like the others, because the
  // tint follows the playlist. A component body runs once, so this is
  // still one value for the life of the screen.
  const backInteraction = interactive({
    hover: true,
    press: true,
    hovered: { backgroundColor: alpha(card.text, 0.26) },
    pressed: { backgroundColor: alpha(card.text, 0.34) }
  });

  // A curator who wrote nothing gets no empty paragraph.
  const description = playlist.pipe(
    map(entry => entry.description),
    distinctUntilChanged(),
    map(text =>
      text === ''
        ? []
        : [
            <text
              key="description"
              color={card.secondaryText}
              fontSize={14}
              lineHeight={22}
              textAlign="center"
              textWrap="word"
              maxWidth={360}
              maxLines={4}
              textOverflow="ellipsis"
              selfX="center"
              selectable={false}
              modifiers={[motion({ initial: [fade, slideUp(10)], duration: 'slow' })]}>
              {text}
            </text>
          ]
    )
  );
  // The rows, keyed by track id, so a refreshed count on the playlist
  // does not rebuild them and a changed list rebuilds only what moved.
  const rows = catalogue.view.tracks.pipe(
    map(all => (all[card.id] ?? []).map(track => <TrackRow key={track.id} track={track} />))
  );

  return (
    // No background of its own: the app root paints the page, and a
    // screen that painted an opaque one would hide the screen it is
    // replacing while that one is still fading out.
    <scrollview width={percent(100)} height={percent(100)}>
      <column width={percent(100)} x="center">
        {/* The header region: the coloured area the card grows into. */}
        <column width={percent(100)} maxWidth={COLUMN_WIDTH} position="relative" x="center">
          <box
            position="absolute"
            left={0}
            top={0}
            width={percent(100)}
            height={percent(100)}
            backgroundColor={card.background}
            borderRadius={radius}
            transition={{ borderRadius: 420 }}
            modifiers={[sharedElement({ name: `playlist-background-${card.id}`, morph: 'geometry' })]}
          />
          <button
            position="absolute"
            left={20}
            top={26}
            width={40}
            height={40}
            borderRadius={20}
            // Above the positioned column that follows it in the tree,
            // which would otherwise paint over it and take its clicks.
            zIndex={1}
            // A tint of the playlist's own text colour, so the button
            // reads as a control on the black card and on the pink one
            // without being a third colour on either.
            backgroundColor={alpha(card.text, 0.14)}
            cursor="pointer"
            x="center"
            y="center"
            label="Back to playlists"
            onClick={() => router.go(Home)}
            // No `sharedElement`: there is no back button on the list, so
            // it would never pair with anything. It simply arrives.
            modifiers={[backInteraction, RING, motion({ initial: fade })]}>
            <Icon path={ICONS.back} size={24} color={card.text} style="stroke" strokeWidth={2.5} />
          </button>
          {/* One positioned column holds everything drawn over the
              background, because a positioned element paints above
              in-flow content and the background is one. The original
              marks each of these `position: relative` individually for
              the same reason. */}
          <column position="relative" width={percent(100)} x="center" paddingTop={40} gap={18}>
            <box position="relative" width={50} height={50}>
              <Avatar card={card} playlist={playlist} size={50} />
              <box position="absolute" right={-6} bottom={-6}>
                <SaveBadge card={card} size={24} iconSize={14} />
              </box>
            </box>
            <column gap={3} x="center">
              <text
                color={card.text}
                fontSize={14}
                fontWeight={700}
                selectable={false}
                modifiers={[sharedElement({ name: `playlist-user-${card.id}`, scale: 'uniform' })]}>
                {playlist.pipe(map(entry => entry.curator.name.toUpperCase()))}
              </text>
              <text
                color={card.secondaryText}
                fontSize={13}
                selectable={false}
                modifiers={[sharedElement({ name: `playlist-date-${card.id}`, scale: 'uniform' })]}>
                {playlist.pipe(map(entry => entry.date))}
              </text>
            </column>
            <text
              color={card.text}
              fontSize={44}
              fontWeight={700}
              textAlign="center"
              textWrap="word"
              maxWidth={COLUMN_WIDTH - 2 * GUTTER}
              selectable={false}
              modifiers={[sharedElement({ name: `playlist-title-${card.id}`, scale: 'uniform' })]}>
              {playlist.pipe(map(entry => entry.title))}
            </text>
            <box height={14} />
            <Stats card={card} playlist={playlist} />
            <box height={12} />
            {description}
            <box height={20} />
            <box position="relative" width={percent(100)} x="center">
              <Artwork card={card} playlist={playlist} height={PAGE_MEDIA_HEIGHT} />
              <PlayerControls card={card} playlist={playlist} full />
            </box>
          </column>
        </column>
        {/* The track list, which is new on this screen and enters as one. */}
        <column
          width={percent(100)}
          maxWidth={COLUMN_WIDTH}
          paddingTop={20}
          paddingBottom={40}
          x="center"
          modifiers={[motion({ initial: [fade, slideUp(24)], duration: 'slow' })]}>
          {rows}
        </column>
      </column>
    </scrollview>
  );
}

// ---------------------------------------------------------------------------
// The app
// ---------------------------------------------------------------------------

/**
 * The Gesso mark, drawn as `brand/gesso-mark.svg` draws it: one broad
 * coat of chalk pulled across a square of raw linen.
 *
 * Two nodes rather than one `Icon`, because the mark is two colours and
 * an `Icon` rasterises a single path in a single colour. The linen
 * square is this box's own background, and the stroke is the icon over
 * it. `overflow` does what the SVG's clip path does: the stroke runs
 * full bleed to both edges, so its ends have to be cut where the
 * rounded corners take the square away. The radius is 12 of the mark's
 * 64, so it stays proportional at whatever size the mark is asked for.
 */
function BrandMark(props: Inputs<{ size: number }>): UiChild {
  const size = props.size.value;
  return (
    <box
      width={size}
      height={size}
      borderRadius={(size * MARK_RADIUS) / MARK_VIEWBOX}
      backgroundColor={LINEN}
      overflow="hidden"
      flexShrink={0}>
      <Icon path={ICONS.gessoStroke} viewBox={MARK_VIEWBOX} size={size} color={CHALK} label="Gesso" />
    </box>
  );
}

/**
 * The bar across the top, which exists on the list and not on a
 * playlist.
 *
 * It is one `motion` on a state rather than an element that comes and
 * goes, because it is the same bar either way — it has simply moved
 * off the top of the screen. The original does the same thing with a
 * `slide-out` keyframe on its `::view-transition-old(app-header)`.
 */
function AppHeader(props: Inputs<{ hidden: boolean }>): UiChild {
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      right={0}
      height={HEADER_HEIGHT}
      backgroundColor={CARD}
      modifiers={[
        motion({
          state: props.hidden.pipe(map(hide => (hide ? slideDown(HEADER_HEIGHT + 6) : null))),
          duration: 250,
          easing: 'standard'
        })
      ]}>
      <row width={percent(100)} height={percent(100)} maxWidth={COLUMN_WIDTH} gap={16} x="center" y="center">
        <BrandMark size={26} />
        <text color={INK} fontSize={22} fontWeight={700} selectable={false}>
          Playlists
        </text>
      </row>
    </box>
  );
}

export function TransitionsExampleApp(_props: Inputs<Record<string, never>>, ctx: ComponentContext): UiChild {
  const router = ctx.inject(RouterService);
  const onDetail = router.match.pipe(map(match => match?.route === Detail));
  // Escape is Back. Keys go to the focused node and bubble; with nothing
  // focused they go to the app root, which is this box, so this one
  // handler covers a person who tabbed to a heart and one who never
  // touched the keyboard.
  const onKeyDown = (event: UiKeyboardEvent): void => {
    if (event.key === 'Escape' && router.match.value?.route === Detail) {
      event.preventDefault();
      router.go(Home);
    }
  };
  return (
    <box
      width={percent(100)}
      height={percent(100)}
      position="relative"
      backgroundColor={PAGE_BACKGROUND}
      onKeyDown={onKeyDown}>
      {/* An `exit` and no `enter`, deliberately. The arriving screen has
          to be at full opacity from its first frame, because the
          elements morphing across the change are *inside* it and a
          screen's opacity multiplies onto them — fade the screen in and
          the morph fades with it, which is a page-coloured flash where
          the card should be. The departing screen may fade, because
          nothing is morphing out of it: its shared elements have
          already handed over. Neither screen paints a background of its
          own (this box does), so there is nothing opaque to hide the
          other while it goes. See `RouteTransition`. */}
      <RouterOutlet
        transition={{
          mode: 'together',
          exit: fade,
          timing: { duration: 240, easing: 'standard' }
        }}
      />
      <AppHeader hidden={onDetail} />
    </box>
  );
}
