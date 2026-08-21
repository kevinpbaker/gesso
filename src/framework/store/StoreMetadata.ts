export interface StoreMetadata {
  tag: string;
  states: Set<string>;
  actions: Set<string>;
  projections: Set<string>;
}

const storeMetadataStore = new WeakMap<Function, StoreMetadata>();

export function getStoreMetadata(constructor: Function): StoreMetadata {
  let metadata = storeMetadataStore.get(constructor);
  if (metadata === undefined) {
    metadata = { tag: constructor.name, states: new Set(), actions: new Set(), projections: new Set() };
    storeMetadataStore.set(constructor, metadata);
  }
  return metadata;
}

export function hasStoreMetadata(constructor: Function): boolean {
  return storeMetadataStore.has(constructor);
}
