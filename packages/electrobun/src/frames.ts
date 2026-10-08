/**
 * The wire format the two halves of the bridge share, which lives in
 * `gesso-framework/remote` with the bridge itself: it carries channels
 * over any transport, and Electrobun's RPC is one of them.
 */
export { DEFAULT_CHUNK_BYTES, FrameAssembler, frameData, isGessoFrame, type GessoFrame } from 'gesso-framework/remote';
