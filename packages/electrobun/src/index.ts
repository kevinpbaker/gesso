/**
 * `@gesso/electrobun`: a Gesso application in a native window.
 *
 * The root entry is the wire format both halves share. The halves
 * themselves are separate entries, `./view` and `./main`, because they
 * have opposite dependencies and neither should be able to import the
 * other's.
 */
export { DEFAULT_CHUNK_BYTES, FrameAssembler, frameData, isGessoFrame, type GessoFrame } from './frames';
