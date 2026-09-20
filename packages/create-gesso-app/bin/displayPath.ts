import { relative } from 'node:path';

/**
 * The new project's directory, written the way the reader should type it.
 *
 * This used to slice `process.cwd()` off the front of the target when
 * the target started with it, which is a string test standing in for a
 * path one. A sibling whose name extends the current directory's —
 * `../gessosheet` scaffolded from inside `gesso` — passes that test
 * without ever having been inside it, and the message printed the last
 * four characters of the name: "Created gessosheet in heet."
 *
 * `relative` answers the question that was being asked. Which of the
 * two to print is then a readability choice rather than a correctness
 * one: a child or a sibling is shorter said relatively and is what the
 * caller typed, while a target on the far side of the tree is a run of
 * `..` segments that the absolute path beats. Shorter wins, and the
 * tie goes to the absolute path because it is unambiguous.
 */
export function displayPath(from: string, target: string): string {
  const fromHere = relative(from, target);
  if (fromHere === '') {
    return target;
  }
  return fromHere.length < target.length ? fromHere : target;
}
