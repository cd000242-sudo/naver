/**
 * Pulls the two harmony fields out of a freshly parsed article (Release C1, 2026-11-04).
 *
 * Contract: after extractHarmonyPacket(parsed) the article has NEITHER field, so neither can reach bodyPlain, the
 * headings, the title review or the publish payload. A malformed field never throws — it comes back as a rejected
 * field plus an issue string, because in observe mode a dishonest packet is a measurement, not an error.
 */
import { titleCandidateKeys } from '../../main/services/dailyPublishingTitleReviewContract.js';
import {
  COMPLEMENT_KINDS, COMPLEMENT_RULES, HARMONY_LIMITS,
  type ComplementItem, type ComplementKind, type ComplementReport, type ComplementRule,
  type DailyTitleCandidate, type HarmonyExtraction, type HarmonyPacket,
} from './harmonyPacketTypes.js';

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u;

/** Thrown only inside this module; every public function catches it. */
class Invalid extends Error {}
const bad = (path: string, why: string): never => { throw new Invalid(`${path}: ${why}`); };

function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad(path, 'object expected');
  const entry = value as Record<string, unknown>;
  const actual = Object.keys(entry);
  const extra = actual.filter(key => !keys.includes(key));
  const missing = keys.filter(key => !actual.includes(key));
  if (extra.length) bad(path, `unexpected key ${extra[0]}`);
  if (missing.length) bad(path, `missing key ${missing[0]}`);
  return entry;
}

function str(value: unknown, path: string, max: number, min = 1): string {
  if (typeof value !== 'string') return bad(path, 'string expected');
  const text = value.trim();
  if (text.length < min || text.length > max) return bad(path, `length ${text.length} outside ${min}-${max}`);
  if (CONTROL_CHARS.test(text)) return bad(path, 'control character');
  return text;
}

function strings(value: unknown, path: string, minItems: number, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) return bad(path, `array of ${minItems}-${maxItems} expected`);
  return value.map((item, index) => str(item, `${path}[${index}]`, maxChars));
}

function candidate(value: unknown, path: string): DailyTitleCandidate {
  const entry = record(value, titleCandidateKeys, path);
  return {
    id: str(entry.id, `${path}.id`, 30), title: str(entry.title, `${path}.title`, 100),
    readerQuestion: str(entry.readerQuestion, `${path}.readerQuestion`, 600), expectedBelief: str(entry.expectedBelief, `${path}.expectedBelief`, 600),
    surprisingFact: str(entry.surprisingFact, `${path}.surprisingFact`, 600), clickReason: str(entry.clickReason, `${path}.clickReason`, 600),
    sourceAnchors: strings(entry.sourceAnchors, `${path}.sourceAnchors`, 1, 6, 900), bodyAnchors: strings(entry.bodyAnchors, `${path}.bodyAnchors`, 1, 6, 900),
  };
}

function sizeOf(value: unknown, max: number, path: string): void {
  let json: string | undefined;
  try { json = JSON.stringify(value); } catch { bad(path, 'not serialisable'); }
  if (typeof json !== 'string' || json.length > max) bad(path, `larger than ${max} chars`);
}

function parsePacket(value: unknown): HarmonyPacket {
  const L = HARMONY_LIMITS;
  sizeOf(value, L.packetJsonChars, 'harmonyPacket');
  const top = record(value, ['version', 'material', 'strategy', 'titles', 'payoff'], 'harmonyPacket');
  if (top.version !== 1) bad('harmonyPacket.version', '1 expected');
  const material = record(top.material, ['centralEvent', 'readerSituation', 'notInSource'], 'harmonyPacket.material');
  const strategy = record(top.strategy, ['readerQuestion', 'angle', 'exposureNote'], 'harmonyPacket.strategy');
  const titles = record(top.titles, ['chosenId', 'candidates', 'comparison'], 'harmonyPacket.titles');
  const payoff = record(top.payoff, ['promise', 'answerSentence'], 'harmonyPacket.payoff');
  if (!Array.isArray(titles.candidates) || titles.candidates.length < L.candidatesMin || titles.candidates.length > L.candidatesMax) {
    bad('harmonyPacket.titles.candidates', `${L.candidatesMin}-${L.candidatesMax} candidates expected`);
  }
  return {
    version: 1,
    material: {
      centralEvent: str(material.centralEvent, 'harmonyPacket.material.centralEvent', L.short),
      readerSituation: str(material.readerSituation, 'harmonyPacket.material.readerSituation', L.short),
      notInSource: strings(material.notInSource, 'harmonyPacket.material.notInSource', 0, L.notInSourceItems, L.notInSourceChars),
    },
    strategy: {
      readerQuestion: str(strategy.readerQuestion, 'harmonyPacket.strategy.readerQuestion', L.short),
      angle: str(strategy.angle, 'harmonyPacket.strategy.angle', L.short),
      exposureNote: str(strategy.exposureNote, 'harmonyPacket.strategy.exposureNote', L.short),
    },
    titles: {
      chosenId: str(titles.chosenId, 'harmonyPacket.titles.chosenId', 30),
      candidates: (titles.candidates as unknown[]).map((item, index) => candidate(item, `harmonyPacket.titles.candidates[${index}]`)),
      comparison: str(titles.comparison, 'harmonyPacket.titles.comparison', L.note),
    },
    payoff: {
      promise: str(payoff.promise, 'harmonyPacket.payoff.promise', L.short),
      answerSentence: str(payoff.answerSentence, 'harmonyPacket.payoff.answerSentence', L.answerSentenceChars, 8),
    },
  };
}

const ITEM_KEYS = ['kind', 'instructionQuote', 'otherQuote', 'resolution', 'rule', 'affected'] as const;

function parseItem(value: unknown, path: string): ComplementItem {
  const L = HARMONY_LIMITS;
  const entry = record(value, ITEM_KEYS, path);
  if (!COMPLEMENT_KINDS.includes(entry.kind as ComplementKind)) bad(`${path}.kind`, 'unknown kind');
  if (!COMPLEMENT_RULES.includes(entry.rule as ComplementRule)) bad(`${path}.rule`, 'unknown rule');
  const other = typeof entry.otherQuote === 'string' && !entry.otherQuote.trim() ? '' : str(entry.otherQuote, `${path}.otherQuote`, L.quoteMax, L.quoteMin);
  return {
    kind: entry.kind as ComplementKind,
    instructionQuote: str(entry.instructionQuote, `${path}.instructionQuote`, L.quoteMax, L.quoteMin),
    otherQuote: other,
    resolution: str(entry.resolution, `${path}.resolution`, L.resolutionChars),
    rule: entry.rule as ComplementRule,
    affected: strings(entry.affected, `${path}.affected`, 0, L.affectedItems, L.affectedChars),
  };
}

/** The report is item-tolerant: one bad item is dropped with an issue, the rest survive. Too many items rejects the report. */
function parseReport(value: unknown, issues: string[]): ComplementReport {
  const L = HARMONY_LIMITS;
  sizeOf(value, L.reportJsonChars, 'complementReport');
  const top = record(value, ['version', 'items'], 'complementReport');
  if (top.version !== 1) bad('complementReport.version', '1 expected');
  if (!Array.isArray(top.items) || top.items.length > L.reportItemsMax) bad('complementReport.items', `at most ${L.reportItemsMax} items expected`);
  const items: ComplementItem[] = [];
  (top.items as unknown[]).forEach((raw, index) => {
    try { items.push(parseItem(raw, `complementReport.items[${index}]`)); }
    catch (error) { issues.push(`dropped item: ${(error as Error).message}`); }
  });
  return { version: 1, items };
}

/**
 * Remove harmonyPacket / complementReport from `parsed` (in place — the generator keeps working on the same object)
 * and return them validated. Never throws.
 */
export function extractHarmonyPacket(parsed: unknown): HarmonyExtraction {
  const issues: string[] = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { present: false, packet: null, report: null, issues };
  const article = parsed as Record<string, unknown>;
  const hasPacket = Object.prototype.hasOwnProperty.call(article, 'harmonyPacket');
  const hasReport = Object.prototype.hasOwnProperty.call(article, 'complementReport');
  const rawPacket = article.harmonyPacket;
  const rawReport = article.complementReport;
  // Strip first: whatever happens below, the article must never keep these fields.
  if (hasPacket) delete article.harmonyPacket;
  if (hasReport) delete article.complementReport;
  let packet: HarmonyPacket | null = null;
  let report: ComplementReport | null = null;
  if (hasPacket) {
    try { packet = parsePacket(rawPacket); } catch (error) { issues.push(`packet rejected: ${(error as Error).message}`); }
  }
  if (hasReport) {
    try { report = parseReport(rawReport, issues); } catch (error) { issues.push(`report rejected: ${(error as Error).message}`); }
  }
  return { present: hasPacket || hasReport, packet, report, issues };
}
