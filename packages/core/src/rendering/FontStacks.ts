/**
 * The fallback stack behind a declared font family.
 *
 * An application declares a family once, with the families to try for
 * glyphs it lacks and to draw with until its file arrives
 * (`renderRoot(App).useFonts(...)` in the framework). Text then names
 * the family alone, `fontFamily: 'Inter'`, and every font string the
 * runtime builds, for measuring and for drawing, on either renderer,
 * carries the whole stack: `Inter, system-ui, sans-serif`. That is the
 * one place a family name becomes a CSS font-family list, so a
 * measurement and the glyphs drawn from it can never disagree about
 * which fonts they meant.
 *
 * A module-level registry, like the platform's own `FontFaceSet`: fonts
 * are a fact about the thread, not about one runtime, and two runtimes
 * in one worker (the playground has several) see the same faces.
 * A family nobody declared passes through unchanged, so a string that
 * is already a list, `'Georgia, serif'`, keeps working as it always
 * has.
 */
interface FontStack {
  readonly families: readonly string[];
  /** How many times a face of this family has arrived; see `bumpFontStack`. */
  generation: number;
  /** The list as last built, so a measure does not rebuild it. */
  list: string;
}

const stacks = new Map<string, FontStack>();

/** Declares the families tried after `family`, in order. */
export function registerFontStack(family: string, fallback: readonly string[]): void {
  const families = [family, ...fallback].map(cssFamilyName);
  stacks.set(family, { families, generation: 0, list: families.join(', ') });
}

/** The CSS font-family list for a family: its declared stack, or the name as given. */
export function fontStackFor(family: string): string {
  return stacks.get(family)?.list ?? family;
}

/**
 * Records that a face of `family` has arrived, and changes the family's
 * list so that every font string built from now on differs from every
 * one built before.
 *
 * That difference is the whole point. Chrome resolves a canvas font
 * string once per worker and keeps the answer: a string first used
 * while the face was still loading stays resolved to the fallback for
 * the worker's lifetime, however many faces load afterwards, and a
 * fresh context or a wait for `fonts.ready` does not help. A string it
 * has not seen resolves against the faces present now. (Measured in
 * Chrome 152, in a worker: `10px Ahem, monospace` kept measuring the
 * monospace fallback after Ahem loaded; `10px Ahem, serif`, never used
 * before, measured Ahem.) So the list gains a trailing family name
 * that exists nowhere, `gesso-reload-N`, which no glyph ever reaches
 * because the generic before it matches everything, and which makes
 * the string new.
 */
export function bumpFontStack(family: string): void {
  const stack = stacks.get(family);
  if (stack === undefined) {
    return;
  }
  stack.generation++;
  stack.list = [...stack.families, `gesso-reload-${stack.generation}`].join(', ');
}

/** Forgets every declared stack; for tests. */
export function clearFontStacks(): void {
  stacks.clear();
}

/**
 * Quotes a family name that needs it. Generic families (`sans-serif`,
 * `system-ui`) must stay bare, because a quoted one is a family called
 * that; a name with a space must be quoted or the shorthand parser reads
 * it as several.
 */
function cssFamilyName(name: string): string {
  const trimmed = name.trim();
  if (/^["']/.test(trimmed) || /^[a-zA-Z_-][\w-]*$/.test(trimmed)) {
    return trimmed;
  }
  return `"${trimmed.replace(/"/g, '\\"')}"`;
}
