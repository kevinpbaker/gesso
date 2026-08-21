export const COMPONENT_METADATA_KEY = Symbol('nodal:component:metadata');

export interface ComponentMetadata {
  tag: string;
  inputs: Set<string>;
  states: Set<string>;
}

const metadataStore = new WeakMap<Function, ComponentMetadata>();

export function getComponentMetadata(constructor: Function): ComponentMetadata {
  let metadata = metadataStore.get(constructor);
  if (metadata === undefined) {
    metadata = { tag: constructor.name, inputs: new Set(), states: new Set() };
    metadataStore.set(constructor, metadata);
  }
  return metadata;
}

export function hasComponentMetadata(constructor: Function): boolean {
  return metadataStore.has(constructor);
}
