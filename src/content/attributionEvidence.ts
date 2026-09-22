// [2026-09-22 audit P0-4] Evidence for the attribution guard: which source names / institutions
// the writer was actually given. Built from the structured SourceDocument[] when present,
// otherwise from the legacy "[자료 N — 제목]" bundle plus the raw material text itself.

import type { AttributionEvidence } from './attributionGuard.js';
import { deriveSourceName, parseLegacyMaterialBundle, type SourceDocument } from './sourceDocument.js';

interface SourceLike {
  rawText?: string;
  blueprintMaterial?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v ?? '').trim()).filter(Boolean) : [];
}

export function buildAttributionEvidence(source: SourceLike | null | undefined): AttributionEvidence {
  if (!source) return { sourceNames: [], corpus: '' };
  const names = new Set<string>();
  const docs = (source.metadata?.sourceDocuments as SourceDocument[] | undefined) || [];
  for (const doc of docs) {
    if (doc?.sourceName) names.add(doc.sourceName);
    if (doc?.url) names.add(deriveSourceName(doc.url, doc.title));
  }
  const rawText = String(source.rawText || '');
  const bundle = docs.length === 0 ? parseLegacyMaterialBundle(rawText) : null;
  for (const doc of bundle?.documents || []) {
    if (doc.sourceName) names.add(doc.sourceName);
  }
  for (const url of [source.url, ...stringList(source.metadata?.rssUrl ? String(source.metadata.rssUrl).split(',') : [])]) {
    const trimmed = String(url || '').trim();
    if (/^https?:\/\//i.test(trimmed)) names.add(deriveSourceName(trimmed));
  }
  const corpus = [rawText, String(source.blueprintMaterial || '')].filter(Boolean).join('\n');
  return { sourceNames: [...names].filter((n) => n && n !== 'unknown'), corpus };
}
