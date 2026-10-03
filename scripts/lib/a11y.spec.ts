import { describe, expect, it } from 'vitest';

import { describeProperty, type AxNode } from './a11y';

describe('the accessibility report', () => {
  const option: AxNode = {
    nodeId: '7',
    backendDOMNodeId: 42,
    role: { value: 'option' },
    name: { value: 'WEB-27 Refactor image uploads' }
  };

  it('prints a state as its value', () => {
    expect(describeProperty({ name: 'selected', value: { value: false } }, [])).toBe('selected=false');
  });

  it('prints a relation as the name of the node it points at', () => {
    const property = {
      name: 'activedescendant',
      value: { relatedNodes: [{ backendDOMNodeId: 42, idref: 'gesso-0-row' }] }
    };
    expect(describeProperty(property, [option])).toBe('activedescendant=WEB-27 Refactor image uploads');
  });

  it('says so when a relation points at nothing in the tree', () => {
    const property = { name: 'activedescendant', value: { relatedNodes: [{ backendDOMNodeId: 99 }] } };
    expect(describeProperty(property, [option])).toBe('activedescendant=missing');
  });
});
