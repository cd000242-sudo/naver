// src/content/sourceDocumentRender.ts
//
// Renders SourceDocument[] into the text block handed to the writer model.
// The old bundle preamble told the model the numbering was internal but not
// what to do instead, so attribution ended up either missing or copying the
// literal "[자료 3]" tag into prose. This preamble replaces that with an
// explicit instruction: cite the real outlet/institution name.

import { extractHostname, type SourceDocument } from './sourceDocument.js';

const WRITER_PREAMBLE =
  "※ 아래 [자료 Sxx] 번호표는 내부 식별자다. 본문에 'S01', '[자료 3]' 같은 번호표를 옮겨 적지 마라. "
  + "대신 실제 출처 귀속은 적극적으로 써라 — 확정 아닌 정보·수치·발언을 옮기는 곳(글 전체 1~3곳)에서 "
  + "'보건복지부 발표에 따르면', '기아 공식 가격표 기준', '소속사 입장에 따르면', 'OO일보 보도에 따르면'처럼 "
  + "그 자료의 기관/매체 이름을 그대로 쓴다(base H6 정본). 익명 전언('관계자에 따르면', '한 매체에 따르면')은 쓰지 않는다. "
  + '자료에 없는 기관·매체를 지어내지 않는다. '
  + "UNKNOWN_DATE 자료의 시점을 '오늘/최근'으로 단정하지 않는다.";

/** [P1 relevance v2] Best-effort domain when doc.domain wasn't populated at collection time. */
function domainFor(doc: SourceDocument): string {
  if (doc.domain) return doc.domain;
  return extractHostname(doc.url).replace(/^www\./, '');
}

function renderOneDocument(doc: SourceDocument, opts: { includeUrl: boolean; maxBodyChars?: number }): string {
  const body = doc.cleanedBody ?? doc.body ?? '';
  const trimmedBody = opts.maxBodyChars && body.length > opts.maxBodyChars
    ? body.slice(0, opts.maxBodyChars)
    : body;

  // [P1 relevance v2] Never invent a publisher/organization name — show "(미확인)" instead.
  const sourceNameDisplay = doc.sourceName && doc.sourceName.trim() ? doc.sourceName : '(미확인)';
  const staleLabel = doc.stale ? ' (과거 자료 — 현재 정보로 취급 금지)' : '';

  const lines = [
    `[자료 ${doc.id}]`,
    `제목: ${doc.title}`,
    `출처: ${doc.sourceName}`,
    `기관/매체: ${sourceNameDisplay}`,
    `도메인: ${domainFor(doc)}`,
  ];
  if (opts.includeUrl) lines.push(`URL: ${doc.url}`);
  lines.push(
    `게시일: ${doc.pubDate ?? '모름'} | ${doc.dateStatus}${staleLabel}`,
    `자료 유형: ${doc.sourceType} · 신뢰 등급: ${doc.sourceTier}`,
    '본문:',
    trimmedBody,
  );
  return lines.join('\n');
}

export function renderSourceDocumentsForWriter(
  docs: SourceDocument[],
  opts: { includeUrl?: boolean; maxBodyChars?: number } = {},
): string {
  const includeUrl = opts.includeUrl ?? true;
  const blocks = docs.map((doc) => renderOneDocument(doc, { includeUrl, maxBodyChars: opts.maxBodyChars }));
  return `${WRITER_PREAMBLE}\n\n${blocks.join('\n\n')}`;
}

export interface SourceDocumentSummary {
  total: number;
  byType: Record<string, number>;
  byTier: Record<string, number>;
  unknownDate: number;
  accepted: number;
  rejected: number;
  chars: number;
}

export function summarizeSourceDocuments(docs: SourceDocument[]): SourceDocumentSummary {
  const byType: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  let unknownDate = 0;
  let accepted = 0;
  let rejected = 0;
  let chars = 0;

  for (const doc of docs) {
    byType[doc.sourceType] = (byType[doc.sourceType] ?? 0) + 1;
    byTier[doc.sourceTier] = (byTier[doc.sourceTier] ?? 0) + 1;
    if (doc.dateStatus === 'UNKNOWN_DATE') unknownDate += 1;
    if (doc.relevance) {
      if (doc.relevance.accepted) accepted += 1;
      else rejected += 1;
    }
    chars += (doc.cleanedBody ?? doc.body ?? '').length;
  }

  return { total: docs.length, byType, byTier, unknownDate, accepted, rejected, chars };
}
