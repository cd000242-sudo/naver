/**
 * Agent harmony packet — public entry (Release C1, 2026-11-04).
 *   extractHarmonyPacket : strips + validates the two harmony fields of a parsed article (harmonyPacketExtract.ts)
 *   verifyHarmonyPacket  : checks the packet against the real material (harmonyPacketVerify.ts)
 * Split into three files to stay under the 300-line limit; import from here.
 */
export { extractHarmonyPacket } from './harmonyPacketExtract.js';
export { verifyHarmonyPacket, measureAnswerPosition, payoffWindows, type HarmonyVerifyContext } from './harmonyPacketVerify.js';
export * from './harmonyPacketTypes.js';
