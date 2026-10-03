#!/usr/bin/env node
/**
 * `gesso-channels`: describes channel contracts for a bundle Vite does
 * not build.
 *
 *   gesso-channels src/shared/Counter.ts --out src/shared/channels.described.ts
 *   gesso-channels src/shared/*.ts --out src/shared/channels.described.ts --check
 *
 * `gesso-vite-plugin` describes a contract as Vite bundles it. An
 * Electrobun main process is bundled by Electrobun's own build, which
 * takes no plugins, so its channels would reach an agent undescribed:
 * no descriptions, and arguments as a positional list. This reads the
 * same contracts with the same checker and writes a module that
 * describes them when imported; the main process imports it once.
 *
 * `--check` writes nothing and fails when the module on disk is not
 * what it would write, for a gate that wants to know a contract
 * changed without the module following.
 *
 * It needs TypeScript 7 in the project, whose checker does the reading.
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { ContractReader, describedModule, type TypeScriptApi } from '../src/contracts.ts';

const USAGE = `Usage: gesso-channels <contract.ts>... --out <file> [--check]

Writes a module that attaches a JSON Schema to every channel the
contracts export, for a bundle gesso-vite-plugin does not build, such as
an Electrobun main process. Import the module once from that bundle.

  --out <file>  Where to write the module.
  --check       Write nothing; fail if the module is out of date.
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const files: string[] = [];
  let out: string | undefined;
  let check = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out') {
      out = args[++i];
    } else if (arg === '--check') {
      check = true;
    } else if (arg === '-h' || arg === '--help') {
      console.log(USAGE);
      return;
    } else if (arg.startsWith('-')) {
      fail(`Unknown option ${arg}.\n\n${USAGE}`);
    } else {
      files.push(arg);
    }
  }
  if (out === undefined || files.length === 0) {
    fail(USAGE);
  }

  let ts: TypeScriptApi;
  try {
    ts = (await import('typescript/unstable/sync')) as TypeScriptApi;
  } catch {
    fail('gesso-channels needs TypeScript 7 or later in the project: npm install --save-dev typescript@^7.');
  }

  // Real paths, because the checker knows files by where they really
  // are, and a symlinked temporary directory would otherwise read as a
  // file no project includes.
  const cwd = realpathSync(process.cwd());
  const outFile = resolve(realpathSync(dirname(resolve(cwd, out))), out.split(/[\\/]/).pop()!);
  const reader = new ContractReader(ts, cwd);
  const contracts = [];
  let warned = false;
  try {
    for (const file of files) {
      const path = realpathSync(resolve(cwd, file));
      const reading = reader.read(path);
      for (const warning of reading.warnings) {
        console.warn(`gesso-channels: ${warning}`);
        warned = true;
      }
      contracts.push({ file: path, channels: reading.channels });
    }
  } finally {
    reader.close();
  }

  const described = contracts.reduce((count, contract) => count + contract.channels.size, 0);
  if (described === 0) {
    fail(`None of ${files.join(', ')} exports a channel.`);
  }
  const module = describedModule(contracts, outFile);
  if (check) {
    const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : null;
    if (current !== module) {
      fail(`${out} is out of date. Run gesso-channels without --check to write it.`);
    }
    console.log(`${out} describes ${described} channel${described === 1 ? '' : 's'} and is current.`);
    return;
  }
  writeFileSync(outFile, module);
  console.log(
    `Wrote ${out}: ${described} channel${described === 1 ? '' : 's'} described${warned ? ', with warnings above' : ''}.`
  );
}

void main();
