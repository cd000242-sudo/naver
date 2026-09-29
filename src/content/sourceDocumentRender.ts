// src/content/sourceDocumentRender.ts
//
// Renders SourceDocument[] into the text block handed to the writer model.
// The old bundle preamble told the model the numbering was internal but not
// what to do instead, so attribution ended up either missing or copying the
// literal "[자료 3]" tag into prose. This preamble replaces that with an
// explicit instruction: cite the real outlet/institution name.
//
// [2026-09-30] "적극적으로 써라" over-corrected: the model narrated the
// documents themselves ("~라고 적혀 있습니다", "읽는 편이 맞겠습니다").
// The preamble now says: confirmed facts flat, attribution only for
// unconfirmed claims, and always with the actor as the subject — never
// the document.

import { extractHostname, type SourceDocument } from './sourceDocument.js';

const WRITER_PREAMBLE =
  "※ 아래 [자료 Sxx] 번호표는 내부 식별자다. 본문에 'S01', '[자료 3]' 같은 번호표를 옮겨 적지 마라. "
  + '자료를 읽고 쓴다는 티도 내지 마라 — 확인된 사실은 원래 알던 것처럼 근거 표현 없이 그냥 단정한다. '
  + "실제 출처 귀속은 확정 아닌 정보·수치·발언을 옮기는 곳(글 전체 1~2곳)에서만, "
  + "'보건복지부는 ~라고 발표했다', '기아 공식 가격표 기준', '소속사 측은 ~라고 밝혔다'처럼 "
  + '그 자료의 기관/매체/당사자를 주어로 세워 쓴다(base H6 정본). '
  + "문서를 화자로 세우는 말투('~라고 적혀 있습니다', '~라고 나와 있습니다', '해당 보도는 ~라고 전했다', '기사/자료에 따르면', "
  + "'원문을 읽어보면', '읽는 편이 맞겠습니다')은 금지다. "
  + "익명 전언('관계자에 따르면', '한 매체에 따르면')도 쓰지 않는다. "
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
