import { describe, expect, it } from 'vitest';

import { describeProperty, tabReach, type AxNode } from './a11y';

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

describe('what Tab has to reach', () => {
  const button = (nodeId: string, name: string): AxNode => ({
    nodeId,
    role: { value: 'button' },
    name: { value: name }
  });
  const nodes = [button('1', 'New issue'), button('2', 'Previous issue'), button('3', 'Next issue')];
  const tabOrder = ["button 'New issue'"];

  it('fails a control Tab misses', () => {
    expect(tabReach({}, nodes, tabOrder).unreachable).toEqual(["button 'Previous issue'", "button 'Next issue'"]);
  });

  it('excuses one left out on purpose, and says what reaches it instead', () => {
    const reach = tabReach(
      { outOfTabOrder: [{ role: 'button', name: 'Previous issue', keyboard: 'k' }] },
      nodes,
      tabOrder
    );
    expect(reach.unreachable).toEqual(["button 'Next issue'"]);
    expect(reach.excused).toEqual(["button 'Previous issue' (k)"]);
    expect(reach.stale).toEqual([]);
  });

  it('fails an excuse that no longer excuses anything', () => {
    const reach = tabReach(
      {
        outOfTabOrder: [
          { role: 'button', name: 'New issue', keyboard: 'c' },
          { role: 'button', name: 'Gone', keyboard: 'g' }
        ]
      },
      nodes,
      tabOrder
    );
    expect(reach.stale).toEqual(["button 'New issue'", "button 'Gone'"]);
  });
});
