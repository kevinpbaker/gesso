import type { Size } from './LayoutTypes';

export interface TextMeasureRequest {
  text: string;
  fontSize: number;
  maxWidth?: number;
  /**
   * Font family for platforms that can shape text.
   *
   * Deterministic measurers may ignore every style field; they
   * are hints for platform-backed implementations only.
   */
  fontFamily?: string;
  fontWeight?: string | number;
  lineHeight?: number;
  letterSpacing?: number;
}

/**
 * Abstraction between layout and text platforms.
 *
 * Layout never measures text itself; a platform layer
 * (Canvas2D, WebGPU, tests) supplies an implementation.
 */
export interface TextMeasurer {
  measure(request: TextMeasureRequest): Size;
}

/**
 * Deterministic proxy measurer: each character is
 * fontSize * 0.6 wide and the line is fontSize * 1.2 tall.
 *
 * Intended for tests and headless environments until a
 * platform measurer is injected.
 */
export class CharacterCountTextMeasurer implements TextMeasurer {
  measure(request: TextMeasureRequest): Size {
    const fontSize = request.fontSize;
    let width = request.text.length * fontSize * 0.6;
    if (request.maxWidth !== undefined && request.maxWidth >= 0) {
      width = Math.min(width, request.maxWidth);
    }
    return { width, height: fontSize * 1.2 };
  }
}
