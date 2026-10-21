/** Sample documents for the editor's specs: a short bug report, and one about 5,000 lines long. */

export const SAMPLE = [
  '## Context',
  '',
  'Search results stop paging after **page 3** for workspaces with more than _10,000_ issues. Reported by @ada, see WEB-1042.',
  '',
  '## Steps',
  '',
  '1. Open the search page',
  '2. Search for `invoice`',
  '3. Press **Next** three times',
  '',
  '## Acceptance',
  '',
  '- [ ] Reproduced locally',
  '- [ ] Fix has a regression test',
  '- [x] Triaged',
  '',
  '> The cursor in the API response is ~~an offset~~ a token.',
  '',
  '```ts',
  'const pageSize = 50;',
  '```'
].join('\n');

/** About 5,000 lines of markdown: the size the editor was first held to, in the issue tracker. */
export function bigDocument(): string {
  const sections: string[] = [];
  for (let section = 1; sections.join('\n').split('\n').length < 5000; section += 1) {
    sections.push(SAMPLE.replace('## Context', `## Section ${section}`));
  }
  return sections.join('\n\n');
}
