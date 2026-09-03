import { bumpFontStack, registerFontStack } from '@gesso/core';

/**
 * One face of a family: where its bytes come from and what it covers.
 * The descriptors are CSS `@font-face` descriptors, in their CSS forms
 * (`weight: '100 900'` for a variable face).
 */
export interface FontFaceDeclaration {
  /** A URL the worker can fetch, or the bytes themselves. */
  source: string | ArrayBuffer;
  weight?: string | number;
  style?: 'normal' | 'italic' | 'oblique';
  stretch?: string;
  unicodeRange?: string;
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
}

/**
 * A family an application declares: its faces, and the families tried
 * for glyphs it lacks and drawn with until its files arrive.
 */
export interface FontFamilyDeclaration {
  family: string;
  faces: readonly FontFaceDeclaration[];
  /** Default `['sans-serif']`. */
  fallback?: readonly string[];
}

/** Where a family stands: `loading` until every face settled, then `loaded`, or `error` if any face failed. */
export type FontFamilyStatus = 'undeclared' | 'unavailable' | 'loading' | 'loaded' | 'error';

/** The part of a `FontFace` this service uses; a test passes a double. */
export interface FontFaceLike {
  readonly family: string;
  load(): Promise<unknown>;
}

/** The part of the platform this service needs: a font set to add faces to, and a way to make one. */
export interface FontHost {
  /** `self.fonts` in a worker, `document.fonts` in a window; undefined where there is neither. */
  readonly fonts: { add(face: FontFaceLike): unknown } | undefined;
  createFace(family: string, source: string | ArrayBuffer, descriptors: FontFaceDescriptors): FontFaceLike;
}

/**
 * Loads an application's declared fonts into the thread that draws.
 *
 * A web font used by the DOM is loaded by the document, and a worker
 * shares none of it: the render worker has its own `FontFaceSet`, and a
 * canvas in it draws with a fallback until a face is added there. This
 * service is where that happens. It creates a `FontFace` per declared
 * face, adds it to the thread's set, and tells the runtime as each one
 * arrives so that every measurement made with the fallback is thrown
 * away and the tree is laid out again in the face that was meant.
 *
 * The fallback stack is registered with `@gesso/core` at declaration,
 * before any face loads, so text names the family alone and draws in
 * the fallback meanwhile, as `font-display: swap` would. When a face
 * arrives the stack is bumped, which changes every font string built
 * from it: Chrome keeps a worker's resolution of a font string for
 * good, so only a string it has never seen picks the new face up.
 *
 * Faces are shared across runtimes on a thread, as the font set they
 * live in is: a face created once for a URL is reused by the next
 * runtime that declares it, and disposing a runtime never removes a
 * face, because another runtime in the same worker may be drawing with
 * it. Injected like any other runtime service, so a component can ask
 * `statusOf(family)` and hold its text until the face is in.
 */
export class FontService {
  private readonly statuses = new Map<string, FontFamilyStatus>();
  private readonly pending = new Map<string, number>();
  private readonly failed = new Set<string>();
  private readonly batches: Promise<void>[] = [];
  private listener: ((family: string) => void) | null = null;
  private disposed = false;

  /**
   * Declares families and starts loading their faces. Called by the
   * runtime with what `useFonts` was given; may be called again later
   * for more.
   */
  declare(families: readonly FontFamilyDeclaration[], host: FontHost = platformFontHost()): void {
    const loads: Promise<void>[] = [];
    for (const declaration of families) {
      registerFontStack(declaration.family, declaration.fallback ?? ['sans-serif']);
      if (host.fonts === undefined) {
        this.statuses.set(declaration.family, 'unavailable');
        continue;
      }
      this.statuses.set(declaration.family, 'loading');
      this.pending.set(declaration.family, (this.pending.get(declaration.family) ?? 0) + declaration.faces.length);
      if (declaration.faces.length === 0) {
        this.settle(declaration.family);
      }
      for (const face of declaration.faces) {
        loads.push(this.loadFace(declaration.family, face, host));
      }
    }
    this.batches.push(Promise.all(loads).then(() => undefined));
  }

  /** Resolves once every declared face has loaded or failed. */
  get ready(): Promise<void> {
    return Promise.all(this.batches).then(() => undefined);
  }

  statusOf(family: string): FontFamilyStatus {
    return this.statuses.get(family) ?? 'undeclared';
  }

  get families(): readonly string[] {
    return [...this.statuses.keys()];
  }

  /** Called with a family each time one of its faces finishes loading or failing. */
  setListener(listener: ((family: string) => void) | null): void {
    this.listener = listener;
  }

  /** Stops notifying. The faces stay in the thread's font set for whoever else draws with them. */
  dispose(): void {
    this.disposed = true;
    this.listener = null;
  }

  private async loadFace(family: string, declaration: FontFaceDeclaration, host: FontHost): Promise<void> {
    try {
      const face = faceFor(family, declaration, host);
      host.fonts!.add(face);
      await face.load();
      // The family's font strings must change now, or a worker that
      // measured in the fallback keeps doing so; see `bumpFontStack`.
      bumpFontStack(family);
    } catch {
      this.failed.add(family);
    }
    this.settle(family);
  }

  private settle(family: string): void {
    const left = (this.pending.get(family) ?? 1) - 1;
    this.pending.set(family, left);
    if (left <= 0) {
      this.statuses.set(family, this.failed.has(family) ? 'error' : 'loaded');
    }
    if (!this.disposed) {
      this.listener?.(family);
    }
  }
}

/**
 * Faces already created on this thread, by family and URL, so two
 * runtimes declaring the same font share one `FontFace` and the set
 * is not asked to hold it twice. Faces from bytes are not shared: two
 * buffers are two fonts.
 */
const createdFaces = new Map<string, FontFaceLike>();

function faceFor(family: string, declaration: FontFaceDeclaration, host: FontHost): FontFaceLike {
  const descriptors = descriptorsOf(declaration);
  if (typeof declaration.source !== 'string') {
    return host.createFace(family, declaration.source, descriptors);
  }
  const key = `${family}\0${declaration.source}\0${JSON.stringify(descriptors)}`;
  let face = createdFaces.get(key);
  if (face === undefined) {
    face = host.createFace(family, `url(${JSON.stringify(declaration.source)})`, descriptors);
    createdFaces.set(key, face);
  }
  return face;
}

function descriptorsOf(declaration: FontFaceDeclaration): FontFaceDescriptors {
  const descriptors: FontFaceDescriptors = {};
  if (declaration.weight !== undefined) {
    descriptors.weight = String(declaration.weight);
  }
  if (declaration.style !== undefined) {
    descriptors.style = declaration.style;
  }
  if (declaration.stretch !== undefined) {
    descriptors.stretch = declaration.stretch;
  }
  if (declaration.unicodeRange !== undefined) {
    descriptors.unicodeRange = declaration.unicodeRange;
  }
  if (declaration.display !== undefined) {
    descriptors.display = declaration.display;
  }
  return descriptors;
}

/** The thread's own font set and `FontFace`, where it has them. */
export function platformFontHost(): FontHost {
  const scope = globalThis as {
    fonts?: FontFaceSet;
    document?: { fonts?: FontFaceSet };
    FontFace?: typeof FontFace;
  };
  const fonts = scope.fonts ?? scope.document?.fonts;
  return {
    fonts: fonts !== undefined && typeof scope.FontFace === 'function' ? fonts : undefined,
    createFace: (family, source, descriptors) => new scope.FontFace!(family, source, descriptors)
  };
}
