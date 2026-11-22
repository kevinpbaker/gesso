import { island } from 'gesso-framework';

/**
 * The islands example's own kind of island, beside the native field:
 * a solid block over a box the canvas paints in another colour, so any
 * distance between the element and its box shows as a strip of the
 * canvas's colour. The scroll-lag check measures that strip.
 *
 * Shared by the shell, which makes the element, and the render worker,
 * which places it; it carries no props and says nothing back.
 */
export const LagProbe = island('playground:lag-probe');

/** The probe's element colour, and the colour the canvas paints under it. */
export const PROBE_ELEMENT = '#ff0000';
export const PROBE_CANVAS = '#0000ff';
