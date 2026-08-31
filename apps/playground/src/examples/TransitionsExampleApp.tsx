import { map } from 'rxjs';

import {
  type ComponentContext,
  type Inputs,
  internalState,
  input,
  type OutletProps,
  route,
  RouterOutlet,
  RouterService
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
  type UiChild
} from '@gesso/core';

import { ICONS, playlistById, PLAYLISTS, TRACKS, type Playlist } from './transitions/playlists';
import { CHALK, INK, LINEN } from './brand';

/**
 * A replica of Maxi Ferreira's `view-transitions-live` demo — three
 * playlist cards that expand into a full screen — built on Gesso's
 * motion layer instead of the browser's View Transitions API.
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
const MARK_VIEWBOX = 64;
const MARK_RADIUS = 12;

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
// Shared pieces
// ---------------------------------------------------------------------------

/** The play-count and duration line, which both screens show. */
function Stats(props: Inputs<{ playlist: Playlist }>): UiChild {
  const playlist = props.playlist.value;
  return (
    <row
      gap={8}
      x="center"
      y="center"
      modifiers={[sharedElement({ name: `playlist-stats-${playlist.id}`, scale: 'uniform' })]}>
      <row gap={4} y="center">
        <Icon path={ICONS.bars} size={14} color={playlist.secondaryText} />
        <text color={playlist.secondaryText} fontSize={13} selectable={false}>
          {playlist.stats.count}
        </text>
      </row>
      <text color={playlist.secondaryText} fontSize={13} selectable={false}>
        -
      </text>
      <row gap={4} y="center">
        <Icon path={ICONS.clock} size={14} color={playlist.secondaryText} fillRule="evenodd" />
        <text color={playlist.secondaryText} fontSize={13} selectable={false}>
          {playlist.stats.time}
        </text>
      </row>
    </row>
  );
}

/** A round control button, as the player row is made of. */
function Control(props: Inputs<{ path: string; big?: boolean; stroke?: boolean }>): UiChild {
  const big = input(props.big, false);
  const size = big.value ? 70 : 46;
  return (
    <box
      width={size}
      height={size}
      borderRadius={size / 2}
      backgroundColor={big.value ? CARD : 'rgba(0, 0, 0, 0.8)'}
      x="center"
      y="center">
      <Icon
        path={props.path.value}
        size={big.value ? 26 : 20}
        color={big.value ? INK : CHALK}
        style={props.stroke.value === true ? 'stroke' : 'fill'}
        strokeWidth={2}
        fillRule="evenodd"
      />
    </box>
  );
}

/**
 * The row of player controls over the artwork.
 *
 * The detail screen shows two more of them, which is the one place the
 * shared element genuinely changes shape rather than only size — and
 * it morphs anyway, because a translate and a scale do not care what
 * is inside.
 */
function PlayerControls(props: Inputs<{ playlist: Playlist; full?: boolean }>): UiChild {
  const playlist = props.playlist.value;
  const full = input(props.full, false).value;
  return (
    <box position="absolute" left={0} right={0} bottom={0} x="center">
      <row
        gap={20}
        y="center"
        paddingTop={28}
        paddingBottom={28}
        modifiers={[sharedElement({ name: `playlist-controls-${playlist.id}` })]}>
        {full ? [<Control path={ICONS.download} key="download" />] : []}
        <Control path={ICONS.ban} stroke />
        <Control path={ICONS.play} big />
        <Control path={ICONS.thumbsUp} />
        {full ? [<Control path={ICONS.ellipsis} key="more" />] : []}
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
function Artwork(props: Inputs<{ playlist: Playlist; height: number }>): UiChild {
  const playlist = props.playlist.value;
  const height = props.height.value;
  const media = playlist.media;
  const shared = [sharedElement({ name: `playlist-image-${playlist.id}` })];
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
        alt={playlist.title}
        width={percent(100)}
        height={height}
        objectFit="cover"
        borderRadius={CARD_RADIUS}
        rootModifiers={shared}
      />
    );
  }
  const width = Math.round((media.width / media.height) * height);
  return (
    <Image
      src={media.url}
      alt={playlist.title}
      width={width}
      height={height}
      objectFit="cover"
      rootModifiers={shared}
    />
  );
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
function Card(props: Inputs<{ playlist: Playlist; onOpen: (id: string) => void }>): UiChild {
  const playlist = props.playlist.value;
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
      label={playlist.title}
      onClick={() => props.onOpen.value(playlist.id)}
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
        backgroundColor={playlist.background}
        modifiers={[
          sharedElement({
            name: `playlist-background-${playlist.id}`,
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
          <Image
            src={playlist.user.avatar}
            alt={playlist.user.name}
            width={50}
            height={50}
            borderRadius={25}
            objectFit="cover"
            rootModifiers={[sharedElement({ name: `playlist-avatar-${playlist.id}` })]}
          />
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
              color={playlist.text}
              fontSize={14}
              fontWeight={700}
              selectable={false}
              modifiers={[sharedElement({ name: `playlist-user-${playlist.id}`, scale: 'uniform' })]}>
              {playlist.user.name.toUpperCase()}
            </text>
            <text
              color={playlist.secondaryText}
              fontSize={13}
              selectable={false}
              modifiers={[sharedElement({ name: `playlist-date-${playlist.id}`, scale: 'uniform' })]}>
              {playlist.user.date}
            </text>
          </column>
          <box
            width={40}
            height={40}
            borderRadius={20}
            backgroundColor={CARD}
            x="center"
            y="center"
            modifiers={[sharedElement({ name: `playlist-add-${playlist.id}` })]}>
            <Icon path={ICONS.plus} size={20} color={INK} style="stroke" strokeWidth={3} />
          </box>
        </row>
        <text
          color={playlist.text}
          fontSize={30}
          fontWeight={700}
          textAlign="center"
          selectable={false}
          modifiers={[sharedElement({ name: `playlist-title-${playlist.id}`, scale: 'uniform' })]}>
          {playlist.title}
        </text>
        <box height={10} />
        <Stats playlist={playlist} />
        {/* The slack lives here, so the artwork is flush with the bottom
            of the card whatever the title wrapped to. */}
        <box flexGrow={1} minHeight={20} />
        <box position="relative" width={percent(100)} x="center">
          <Artwork playlist={playlist} height={CARD_MEDIA_HEIGHT} />
          <PlayerControls playlist={playlist} />
        </box>
      </column>
    </button>
  );
}

function HomeScreen(_props: Inputs<OutletProps>, ctx: ComponentContext): UiChild {
  const router = ctx.inject(RouterService);
  const open = (id: string): void => router.go(Detail, { id });
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
        {PLAYLISTS.map(playlist => (
          <Card key={playlist.id} playlist={playlist} onOpen={open} />
        ))}
        <column width={percent(100)} maxWidth={CARD_WIDTH} gap={10} paddingTop={20} x="center">
          <text color={MUTED} fontSize={13} textAlign="center" textWrap="word" maxWidth={480}>
            A replica of Maxi Ferreira’s View Transitions demo, built on Gesso’s motion layer: shared elements are FLIP
            over the live scene graph rather than snapshots, and the video decodes in the render worker through
            WebCodecs.
          </text>
          <text color={FAINT} fontSize={12} textAlign="center" textWrap="word" maxWidth={480}>
            Original concept by Ehsan Rahimi. Photographs by Atikh Bana and Te NGuyen; video by Anna Shvets.
          </text>
        </column>
      </column>
    </scrollview>
  );
}

// ---------------------------------------------------------------------------
// The detail screen
// ---------------------------------------------------------------------------

function TrackRow(props: Inputs<{ index: number }>): UiChild {
  const track = TRACKS[props.index.value]!;
  return (
    <row width={percent(100)} gap={20} paddingLeft={20} paddingRight={20} paddingTop={10} paddingBottom={10} y="center">
      <Image src={track.art} alt={track.title} width={60} height={60} borderRadius={6} objectFit="cover" />
      <column flex={1} gap={4}>
        <text color={INK} fontSize={14} fontWeight={700} selectable={false}>
          {track.title}
        </text>
        <text color={MUTED} fontSize={13} selectable={false}>
          {track.artist}
        </text>
      </column>
      <row gap={8} y="center">
        <Icon path={ICONS.heart} size={22} color={FAINT} />
        <Icon path={ICONS.ellipsis} size={22} color={FAINT} fillRule="evenodd" />
      </row>
    </row>
  );
}

function DetailScreen(_props: Inputs<OutletProps>, ctx: ComponentContext): UiChild {
  const router = ctx.inject(RouterService);
  const params = router.params(Detail);
  const playlist = playlistById(params?.id ?? '1');

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
            backgroundColor={playlist.background}
            borderRadius={radius}
            transition={{ borderRadius: 420 }}
            modifiers={[sharedElement({ name: `playlist-background-${playlist.id}`, morph: 'geometry' })]}
          />
          <box
            position="absolute"
            left={24}
            top={30}
            width={34}
            height={34}
            cursor="pointer"
            x="center"
            y="center"
            onClick={() => router.go(Home)}
            // No `sharedElement`: there is no back button on the list, so
            // it would never pair with anything. It simply arrives.
            modifiers={[motion({ initial: fade })]}>
            <Icon path={ICONS.back} size={28} color={playlist.text} style="stroke" strokeWidth={2} />
          </box>
          {/* One positioned column holds everything drawn over the
              background, because a positioned element paints above
              in-flow content and the background is one. The original
              marks each of these `position: relative` individually for
              the same reason. */}
          <column position="relative" width={percent(100)} x="center" paddingTop={40} gap={18}>
            <box position="relative" width={50} height={50}>
              <Image
                src={playlist.user.avatar}
                alt={playlist.user.name}
                width={50}
                height={50}
                borderRadius={25}
                objectFit="cover"
                rootModifiers={[sharedElement({ name: `playlist-avatar-${playlist.id}` })]}
              />
              <box
                position="absolute"
                right={-6}
                bottom={-6}
                width={24}
                height={24}
                borderRadius={12}
                backgroundColor={CARD}
                x="center"
                y="center"
                modifiers={[sharedElement({ name: `playlist-add-${playlist.id}` })]}>
                <Icon path={ICONS.plus} size={14} color={INK} style="stroke" strokeWidth={3} />
              </box>
            </box>
            <column gap={3} x="center">
              <text
                color={playlist.text}
                fontSize={14}
                fontWeight={700}
                selectable={false}
                modifiers={[sharedElement({ name: `playlist-user-${playlist.id}`, scale: 'uniform' })]}>
                {playlist.user.name.toUpperCase()}
              </text>
              <text
                color={playlist.secondaryText}
                fontSize={13}
                selectable={false}
                modifiers={[sharedElement({ name: `playlist-date-${playlist.id}`, scale: 'uniform' })]}>
                {playlist.user.date}
              </text>
            </column>
            <text
              color={playlist.text}
              fontSize={44}
              fontWeight={700}
              textAlign="center"
              selectable={false}
              modifiers={[sharedElement({ name: `playlist-title-${playlist.id}`, scale: 'uniform' })]}>
              {playlist.title}
            </text>
            <box height={14} />
            <Stats playlist={playlist} />
            <box height={12} />
            <text
              color={playlist.secondaryText}
              fontSize={14}
              lineHeight={22}
              textAlign="center"
              textWrap="word"
              maxWidth={360}
              selfX="center"
              selectable={false}
              modifiers={[motion({ initial: [fade, slideUp(10)], duration: 'slow' })]}>
              {playlist.description}
            </text>
            <box height={20} />
            <box position="relative" width={percent(100)} x="center">
              <Artwork playlist={playlist} height={PAGE_MEDIA_HEIGHT} />
              <PlayerControls playlist={playlist} full />
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
          {TRACKS.map((_track, index) => (
            <TrackRow key={index} index={index} />
          ))}
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
  return (
    <box width={percent(100)} height={percent(100)} position="relative" backgroundColor={PAGE_BACKGROUND}>
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
