import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import {
  Column,
  DefaultImageResolver,
  type IconRasterizer,
  type IconSpec,
  type UiChild,
  type UiImage,
  type UiNode
} from '@gesso/core';
import { Avatar, deriveInitials } from './Avatar';

/**
 * `Avatar` (`COMPONENTS_ROADMAP.md` C7's media tier, the account
 * shaped hole in it).
 *
 * The three things worth pinning are the fallback chain, the initials
 * and the semantics, in that order of how easy they are to get wrong.
 * The chain is asserted by what is actually in the tree rather than by
 * a status flag, because "in the tree" is what a person sees. The
 * initials are a pure function and are tested as one, including the
 * grapheme case, which is the one a code-unit slice gets wrong
 * silently. The semantics are asserted by role and name, the way an
 * assistive technology reaches the control.
 */

/** A bitmap-shaped stand-in; nothing here reads a pixel. */
function fakeBitmap(width = 40, height = 40): UiImage {
  return { width, height, close: vi.fn() } as unknown as UiImage;
}

/**
 * A rasterizer that records the specs it is handed instead of drawing
 * them.
 *
 * Lighter than `Media.spec`'s recording canvas because the question
 * here is not what was painted but *whether the glyph layer is the one
 * in the tree, and which path it drew*. A glyph has no semantics
 * record and no text, so the spec it asked for is the only honest
 * evidence that it is there.
 */
function recordingIcons(): { rasterizer: IconRasterizer; specs: IconSpec[] } {
  const specs: IconSpec[] = [];
  const rasterizer = {
    raster: (spec: IconSpec) => {
      specs.push(spec);
      return Promise.resolve(fakeBitmap(16, 16));
    }
  } as unknown as IconRasterizer;
  return { rasterizer, specs };
}

/** A resolver that answers every source with one bitmap, off the network. */
function stubImages(bitmap: UiImage) {
  return new DefaultImageResolver({
    fetch: () => Promise.resolve(new Blob()),
    decode: () => Promise.resolve(bitmap)
  });
}

interface MountOptions {
  readonly bitmap?: UiImage;
  readonly rasterizer?: IconRasterizer;
}

/**
 * The harness `Structure.spec` uses, plus the two media seams an
 * avatar reaches for. Both go in through the `media` option rather
 * than being installed afterwards, because the tree is built inside
 * the runtime's constructor and the `Image` and `Icon` in it ask for
 * their bitmaps right then.
 */
function mount(root: UiChild, options: MountOptions = {}) {
  const bitmap = options.bitmap ?? fakeBitmap();
  return renderTest(Column({}, root), {
    width: 400,
    height: 300,
    media: { resolver: stubImages(bitmap), rasterizer: options.rasterizer }
  });
}

/** The node the avatar *is*, through its ref. */
function avatarOf(build: (ref: (node: UiNode | null) => void) => UiChild, options: MountOptions = {}) {
  let node: UiNode | null = null;
  const ui = mount(
    build(n => {
      node = n;
    }),
    options
  );
  return { ui, node: () => node as unknown as UiNode };
}

describe('Avatar: the fallback chain', () => {
  it('draws the picture when there is a src, and nothing else', async () => {
    const bitmap = fakeBitmap();
    const { ui } = avatarOf(ref => createComponent(Avatar, { ref, src: 'ada.png', name: 'Ada Lovelace' }), { bitmap });
    await ui.settle();

    expect(ui.allNodes().some(node => node.properties.get('image') === bitmap)).toBe(true);
    // The initials are not drawn behind the picture: the layer that is
    // not showing is not in the tree at all.
    expect(ui.queryByText('AL')).toBeNull();
  });

  it('draws the initials derived from the name when there is no src', () => {
    const ui = mount(createComponent(Avatar, { name: 'Ada Lovelace' }));

    expect(ui.getByText('AL')).toBeTruthy();
  });

  it('treats an empty src as no src, which is the guard it exists to absorb', () => {
    const ui = mount(createComponent(Avatar, { src: '', name: 'Ada Lovelace' }));

    expect(ui.getByText('AL')).toBeTruthy();
  });

  it('draws the generic glyph when there is neither, and the given one when there is', async () => {
    const generic = recordingIcons();
    const genericUi = mount(createComponent(Avatar, {}), { rasterizer: generic.rasterizer });
    await genericUi.settle();

    expect(generic.specs).toHaveLength(1);
    expect(generic.specs[0].path.startsWith('M12 12c2.21')).toBe(true);

    const custom = recordingIcons();
    const customUi = mount(createComponent(Avatar, { icon: 'M0 0h24v24H0z' }), { rasterizer: custom.rasterizer });
    await customUi.settle();

    expect(custom.specs.map(spec => spec.path)).toEqual(['M0 0h24v24H0z']);
  });

  it('swaps layers as the src arrives, without rebuilding the node that is the avatar', async () => {
    const src = new BehaviorSubject('');
    const bitmap = fakeBitmap();
    const { ui, node } = avatarOf(ref => createComponent(Avatar, { ref, src, name: 'Ada Lovelace' }), { bitmap });
    const before = node();
    expect(ui.getByText('AL')).toBeTruthy();

    src.next('ada.png');
    ui.frame();
    await ui.settle();

    expect(ui.queryByText('AL')).toBeNull();
    expect(ui.allNodes().some(entry => entry.properties.get('image') === bitmap)).toBe(true);
    // The avatar itself is the same node: only what is inside it moved.
    expect(node()).toBe(before);
  });

  it('prefers explicit initials over the ones derived from the name', () => {
    const ui = mount(createComponent(Avatar, { name: 'Ada Lovelace', initials: 'GS' }));

    expect(ui.getByText('GS')).toBeTruthy();
    expect(ui.queryByText('AL')).toBeNull();
  });
});

describe('deriveInitials', () => {
  it('takes the given and the family name, and one letter from a single name', () => {
    expect(deriveInitials('Ada Lovelace')).toBe('AL');
    expect(deriveInitials('Ada')).toBe('A');
    // The pair a reader expects is the first and the last, not the
    // first two: a middle initial is neither.
    expect(deriveInitials('Ada B. Lovelace')).toBe('AL');
    expect(deriveInitials('  ada   lovelace  ')).toBe('AL');
  });

  it('has nothing to say about an empty name, which is what makes the glyph the last link', () => {
    expect(deriveInitials('')).toBe('');
    expect(deriveInitials('   ')).toBe('');
  });

  it('never cuts a grapheme in half', () => {
    // A base letter and its combining ring: one visible character made
    // of two code units, so `name[0]` would draw a bare "A".
    expect(deriveInitials('Ålesund Kommune')).toBe('ÅK');
    // A surrogate pair: half of one is U+FFFD on screen.
    expect(deriveInitials('\u{1D538}da Lovelace')).toBe('\u{1D538}L');
    // An emoji joined with U+200D is one cluster and stays whole.
    expect(deriveInitials('\u{1F469}‍\u{1F680} Naoko')).toBe('\u{1F469}‍\u{1F680}N');
  });

  it('leaves a script that has no case alone', () => {
    expect(deriveInitials('村上 春樹')).toBe('村春');
  });
});

describe('Avatar: semantics', () => {
  it('is an image named by the person when it stands alone', () => {
    const ui = mount(createComponent(Avatar, { name: 'Ada Lovelace' }));

    expect(ui.getSemantics(ui.getByRole('image'))).toMatchObject({ role: 'image', label: 'Ada Lovelace' });
  });

  it('says nothing at all when label is empty, because the name is already beside it', () => {
    const { ui, node } = avatarOf(ref => createComponent(Avatar, { ref, name: 'Ada Lovelace', label: '' }));

    expect(node().properties.get('role')).toBeUndefined();
    expect(node().properties.get('label')).toBeUndefined();
    expect(ui.queryByRole('image')).toBeNull();
    // Still drawn: decorative means unannounced, not absent.
    expect(ui.getByText('AL')).toBeTruthy();
  });

  it('lets label say more than the name does', () => {
    const ui = mount(createComponent(Avatar, { name: 'Ada Lovelace', label: 'Ada Lovelace, the author' }));

    expect(ui.getByRole('image', { name: 'Ada Lovelace, the author' })).toBeTruthy();
  });

  it('is decorative when it has no name to announce', () => {
    const { ui, node } = avatarOf(ref => createComponent(Avatar, { ref }), {
      rasterizer: recordingIcons().rasterizer
    });

    expect(node().properties.get('role')).toBeUndefined();
    expect(ui.queryByRole('image')).toBeNull();
  });

  it('keeps the picture out of the semantics tree, so the person is announced once', async () => {
    const ui = mount(createComponent(Avatar, { src: 'ada.png', name: 'Ada Lovelace' }));
    await ui.settle();

    expect(ui.getAllByRole('image')).toHaveLength(1);
  });
});

describe('Avatar: size and shape', () => {
  it('draws each named step at its own side', () => {
    for (const [size, side] of [
      ['small', 24],
      ['medium', 40],
      ['large', 64]
    ] as const) {
      const { node } = avatarOf(ref => createComponent(Avatar, { ref, size, name: 'Ada' }));
      expect(node().properties.get('width')).toBe(side);
      expect(node().properties.get('height')).toBe(side);
    }
  });

  it('is medium when nothing says otherwise, and takes a number for anything else', () => {
    const plain = avatarOf(ref => createComponent(Avatar, { ref, name: 'Ada' }));
    expect(plain.node().properties.get('width')).toBe(40);

    // The 128 at the top of Segue's artist page, which is a hero
    // rather than a step every caller should choose between.
    const hero = avatarOf(ref => createComponent(Avatar, { ref, size: 128, name: 'Ada' }));
    expect(hero.node().properties.get('width')).toBe(128);
    expect(hero.node().properties.get('borderRadius')).toBe(64);
  });

  it('follows a size that changes rather than freezing it at the first frame', () => {
    const size = new BehaviorSubject<number>(40);
    const { ui, node } = avatarOf(ref => createComponent(Avatar, { ref, size, name: 'Ada' }));
    expect(node().properties.get('width')).toBe(40);

    size.next(96);
    ui.frame();

    expect(node().properties.get('width')).toBe(96);
    expect(node().properties.get('borderRadius')).toBe(48);
  });

  it('is a disc by default and a rounded square when asked, at a radius that follows the side', () => {
    const circle = avatarOf(ref => createComponent(Avatar, { ref, size: 64, name: 'Ada' }));
    expect(circle.node().properties.get('borderRadius')).toBe(32);

    const square = avatarOf(ref => createComponent(Avatar, { ref, size: 64, shape: 'square', name: 'Ada' }));
    // A sixth of the side: one fixed radius would be a blob at 24 and
    // a sharp corner at 128.
    expect(square.node().properties.get('borderRadius')).toBe(11);
  });
});

describe('Avatar: colour', () => {
  it('stands on the placeholder token, and names no colour of its own', () => {
    const { node } = avatarOf(ref => createComponent(Avatar, { ref, name: 'Ada Lovelace' }));

    // A palette name, resolved at paint against whatever theme the
    // avatar inherits. Not `border` and not `controlBackgroundPressed`.
    expect(node().properties.get('backgroundColor')).toBe('placeholder');
  });
});
