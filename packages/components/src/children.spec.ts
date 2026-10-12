import { describe, expect, it } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';

import { Column, Text } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Alert } from './Alert';
import { Button } from './Button';
import { Link } from './Link';
import { Card, Toolbar } from './Structure';
import { Tooltip } from './Tooltip';

/**
 * A component drawn again in place, as a list's row is when its data
 * changes: the same component, given new children. It runs once, so it
 * must follow them rather than keep the first.
 */
describe('a component given new children in place', () => {
  const wrappers = {
    Tooltip: (child: ReturnType<typeof Text>) => createComponent(Tooltip, { text: 'Tip', children: child }),
    Button: (child: ReturnType<typeof Text>) => createComponent(Button, { label: 'Press', children: child }),
    Link: (child: ReturnType<typeof Text>) => createComponent(Link, { href: '#', children: child }),
    Card: (child: ReturnType<typeof Text>) => createComponent(Card, { title: 'Card', children: child }),
    Toolbar: (child: ReturnType<typeof Text>) => createComponent(Toolbar, { label: 'Tools', children: child }),
    Alert: (child: ReturnType<typeof Text>) => createComponent(Alert, { title: 'Note', children: child })
  };

  for (const [name, wrap] of Object.entries(wrappers)) {
    it(`${name} shows them`, () => {
      const count = new BehaviorSubject(0);
      const ui = renderTest(Column({}, count.pipe(map(n => [wrap(Text({ text: `${n} files` }))]))), {
        width: 400,
        height: 200
      });
      ui.frame();
      expect(ui.getByText('0 files')).toBeDefined();
      count.next(18);
      ui.frame();
      expect(ui.getByText('18 files')).toBeDefined();
    });
  }
});
