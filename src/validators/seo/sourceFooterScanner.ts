/**
 * Source-footer scanner (advisory).
 *
 * SPEC-AEO-EXPOSURE-2026 R1.
 *
 * 글 끝에 출처/근거/기준 한 줄이 있으면 신뢰도(E-E-A-T) 신호가 된다. 이 스캐너는
 * 결론(없으면 마지막 소제목 본문)에서 출처성 토큰의 존재만 확인한다. 측정만 하고
 * 수정/강제하지 않는다. 발행 파이프라인 미연결.
 */

import type { CheckableContent } from '../../contentQualityChecker.js';

export interface SourceFooterResult {
  hasSourceFooter: boolean;
  matchedTokens: string[];
  warnings: string[];
}

const SOURCE_TOKENS = ['출처', '참고', '근거', '기준', '자료', '작성'];

function lastSegment(content: CheckableContent): string {
  const conclusion = (content.conclusion ?? '').trim();
  if (conclusion) return conclusion;
  const headings = content.headings ?? [];
  for (let i = headings.length - 1; i >= 0; i -= 1) {
    const body = (headings[i].body ?? headings[i].content ?? '').trim();
    if (body) return body;
  }
  return '';
}

export function scanSourceFooter(content: CheckableContent): SourceFooterResult {
  const segment = lastSegment(content);
  const matchedTokens = SOURCE_TOKENS.filter((t) => segment.includes(t));
  const hasSourceFooter = matchedTokens.length > 0;

  const warnings: string[] = [];
  if (!hasSourceFooter) {
    warnings.push('글 끝에 출처/근거/기준 한 줄이 없습니다. 신뢰도 신호로 권장(선택)');
  }

  return { hasSourceFooter, matchedTokens, warnings };
}
