import { afterEach, describe, expect, it } from 'vitest';

import { bumpFontStack, clearFontStacks, fontStackFor, registerFontStack } from './FontStacks';
import { buildFontString } from './TextRenderer';

describe('font stacks', () => {
  afterEach(() => {
    clearFontStacks();
  });

  it('passes an undeclared family through unchanged', () => {
    expect(fontStackFor('Georgia, serif')).toBe('Georgia, serif');
    expect(buildFontString({ fontWeight: 'normal', fontSize: 14, fontFamily: 'sans-serif' })).toBe(
      'normal 14px sans-serif'
    );
  });

  it('expands a declared family to its stack, quoting names with spaces and leaving generics bare', () => {
    registerFontStack('Inter', ['system-ui', 'Segoe UI', 'sans-serif']);
    expect(fontStackFor('Inter')).toBe('Inter, system-ui, "Segoe UI", sans-serif');
    expect(buildFontString({ fontWeight: 600, fontSize: 16, fontFamily: 'Inter' })).toBe(
      '600 16px Inter, system-ui, "Segoe UI", sans-serif'
    );
  });

  it('quotes the declared family itself when it has a space', () => {
    registerFontStack('Noto Sans', ['sans-serif']);
    expect(fontStackFor('Noto Sans')).toBe('"Noto Sans", sans-serif');
  });

  it('makes the list a new string each time a face arrives', () => {
    registerFontStack('Inter', ['sans-serif']);
    bumpFontStack('Inter');
    expect(fontStackFor('Inter')).toBe('Inter, sans-serif, gesso-reload-1');
    bumpFontStack('Inter');
    expect(fontStackFor('Inter')).toBe('Inter, sans-serif, gesso-reload-2');
    bumpFontStack('Undeclared');
    expect(fontStackFor('Undeclared')).toBe('Undeclared');
  });

  it('is the family alone when nothing falls back', () => {
    registerFontStack('Inter', []);
    expect(fontStackFor('Inter')).toBe('Inter');
  });
});
