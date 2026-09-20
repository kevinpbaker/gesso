/**
 * Points the scaffold templates at the versions the packages are
 * actually at.
 *
 * The templates carry version ranges for the `gesso-*` packages they
 * install, and they are the one place in the repository a release does
 * not touch: `changeset version` moves each package's own manifest and
 * knows nothing about a `package.json` that is template data rather
 * than a workspace member. Release 0.2.0 shipped with both templates
 * still asking for `^0.1.0`, which is a scaffold built on the previous
 * framework for anyone installing from the registry.
 *
 * `check-scaffold.ts` already refuses a drifted template. That is the
 * gate, and a gate that fires after the release commit is written is a
 * gate somebody talks past — it fired on 0.2.0 and the release went out
 * regardless. This is the other half: `changeset:version` runs it, so
 * the ranges move in the same commit as the versions and the gate has
 * nothing left to catch.
 *
 * Deliberately the same rule the gate reads by: a dependency whose name
 * starts with `gesso-` is pinned to `^` plus the version in
 * `packages/<rest of the name>/package.json`, and a name with no such
 * directory is left alone.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const templatesDir = join(root, 'packages', 'create-gesso-app', 'templates');

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** The version a `gesso-*` dependency should be asked for, or null when it is not ours. */
function wantedRange(name: string): string | null {
  if (!name.startsWith('gesso-')) {
    return null;
  }
  const own = join(root, 'packages', name.slice('gesso-'.length), 'package.json');
  if (!existsSync(own)) {
    return null;
  }
  const { version } = JSON.parse(readFileSync(own, 'utf8')) as { version: string };
  return `^${version}`;
}

const changed: string[] = [];
for (const template of readdirSync(templatesDir)) {
  const manifestPath = join(templatesDir, template, 'package.json');
  if (!existsSync(manifestPath)) {
    continue;
  }
  const source = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(source) as Manifest;
  let touched = false;

  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = manifest[field];
    if (deps === undefined) {
      continue;
    }
    for (const [name, range] of Object.entries(deps)) {
      const wanted = wantedRange(name);
      if (wanted !== null && wanted !== range) {
        deps[name] = wanted;
        touched = true;
        changed.push(`  ${template}/package.json: ${name} ${range} → ${wanted}`);
      }
    }
  }

  if (touched) {
    // Two spaces and a trailing newline, which is what the templates are
    // written in and what oxfmt leaves them as.
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

console.log(
  changed.length === 0
    ? 'Scaffold templates already ask for the current versions.'
    : `Scaffold templates moved to the current versions:\n${changed.join('\n')}`
);
