/**
 * [Phase 3-15/v2.10.161] contentGenerator god file decomposition — homefeed/seo body hooks.
 *
 * 본문 작성 후 품질 게이트/훅 적용 — 도입부 길이, 서브키워드 밀도, 스크롤 트리거,
 * AI 표현 검출 등. 모두 pure (StructuredContent 변환 + console.log).
 */

import type { StructuredContent, ContentSource } from './contentGenerator';
import type { PromptMode } from './promptLoader.js';

export function buildHomefeedDebateHookSummaryBlock(params: {
  title: string;
  primaryKeyword?: string;
}): string {
  const t = String(params.title || '').trim();
  const kw = String(params.primaryKeyword || '').trim();
  const topic = kw || t;
  if (!topic) return '';

  // ⚠️ 특정 문구(제목처럼 보이는 라벨) 없이, 자연스러운 서술로만 구성
  // - 홈피드 초반 체류/스크롤 신호용: 6~9줄 짧게, 구어체
  // - emoji 제거 로직이 있으므로 텍스트만으로 구성
  const line1 = kw
    ? `댓글창이 ${kw} 얘기만 나오면 진짜 둘로 갈려요.`
    : `댓글창이 이 주제만 나오면 진짜 둘로 갈려요.`;
  const line2 = `같은 걸 보고도 어떤 사람은 "별거 없다"고 하고, 어떤 사람은 "왜 나만 다르지?"라고 하더라고요.`;
  const line3 = `근데 가만 보면 갈리는 지점이 딱 세 가지예요.`;
  const line4 = kw ? `내 상황이 ${kw}랑 맞는지.` : `내 상황이 이 주제랑 맞는지.`;
  const line5 = `기대하는 결과가 "바로"인지, 아니면 "천천히"인지.`;
  const line6 = `지금 당장 해도 되는 타입인지, 잠깐 멈추는 게 나은 타입인지.`;
  const line7 = `아래에서 3분 안에 체크하고 바로 결론 내릴 수 있게 정리해둘게요.`;

  return [line1, line2, line3, line4, line5, line6, line7].join('\n');
}

export function insertSummaryBlockAfterIntroBeforeFirstHeading(bodyPlain: string, headings: any[] | undefined, block: string): string {
  const text = String(bodyPlain || '');
  const b = String(block || '').trim();
  if (!text.trim() || !b) return text;
  if (text.includes('갈리는 지점이 딱 세 가지예요') || text.includes('3분 안에 체크하고 바로 결론')) return text;

  const firstHeadingTitle = String(headings?.[0]?.title || '').trim();
  if (!firstHeadingTitle) {
    return `${b}\n\n${text}`.trim();
  }

  const idx = text.indexOf(firstHeadingTitle);
  if (idx === -1) {
    return `${b}\n\n${text}`.trim();
  }

  const before = text.slice(0, idx).trimEnd();
  const after = text.slice(idx).trimStart();
  return `${before}\n\n${b}\n\n${after}`.trim();
}

export function applyHomefeedNarrativeHookBlock(content: StructuredContent, source: ContentSource): StructuredContent {
  const mode = (source.contentMode || 'seo') as PromptMode;
  if (mode !== 'homefeed') return content;

  // 도입부는 관찰만 한다. 생성 후 문장을 잘라내면 의미와 순서가 손상될 수 있다.
  if (content.introduction) {
    const intro = String(content.introduction).trim();
    const lines = intro.split(/\n+/).filter(l => l.trim());

    // 도입부 첫 줄이 25자 초과 → 지나치게 기므로 경고 로깅
    if (lines.length > 0 && lines[0].length > 25) {
      console.log(`[HomefeedHook] ⚠️ 도입부 첫줄 ${lines[0].length}자 — 모바일 스크롤 없이 핵심 노출 위험`);
    }

    // 도입부가 길면 경고만 남기고 원문은 보존한다.
    if (lines.length > 5) {
      console.log(`[HomefeedHook] ⚠️ 도입부 ${lines.length}줄 — 핵심 답을 앞쪽에 배치했는지 확인 필요`);
    }
  }

  // ✅ [2026-03-06] 소제목 본문에 서브키워드 밀도 보강 — 네이버 AI 토픽 매칭 신호
  const subKwArr = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k))).slice(0, 3)
    : [];
  if (subKwArr.length > 0 && Array.isArray(content.headings) && content.headings.length > 0) {
    let subKwFoundCount = 0;
    for (const heading of content.headings) {
      const body = String((heading as any).body || (heading as any).content || '');
      const title = String(heading.title || '');
      for (const kw of subKwArr) {
        if (body.includes(String(kw)) || title.includes(String(kw))) {
          subKwFoundCount++;
          break;
        }
      }
    }
    const ratio = subKwFoundCount / content.headings.length;
    if (ratio < 0.5) {
      console.log(`[HomefeedHook] ⚠️ 서브키워드 본문 밀도 부족 (${Math.round(ratio * 100)}% — 소제목 ${subKwFoundCount}/${content.headings.length}개에만 포함)`);
    } else {
      console.log(`[HomefeedHook] ✅ 서브키워드 본문 밀도 양호 (${Math.round(ratio * 100)}% — ${subKwFoundCount}/${content.headings.length}개 소제목에 포함)`);
    }
  }

  // ✅ [2026-03-06] 스크롤 트리거 검증 — 3개 이상 의무
  if (Array.isArray(content.headings) && content.headings.length > 0) {
    const scrollTriggers = [
      '근데', '여기서', '반전', '사실은', '그런데', '놀라운',
      '중요한', '궁금하', '이쯤', '끝이 아니', '더 놀라운',
      '비밀이', '핵심은', '진짜는', '알고보니', '솔직히',
      '있잖아', '그게 아니', '잠깐', '여기서부터'
    ];
    let triggerCount = 0;
    const fullBodyText = content.headings.map(
      (h: any) => String(h.title || '') + ' ' + String((h as any).body || (h as any).content || '')
    ).join(' ');
    for (const trigger of scrollTriggers) {
      if (fullBodyText.includes(trigger)) triggerCount++;
    }
    if (triggerCount < 3) {
      console.log(`[HomefeedHook] ⚠️ 스크롤 트리거 부족 (${triggerCount}/3개 — 이탈률 상승 위험)`);
    } else {
      console.log(`[HomefeedHook] ✅ 스크롤 트리거 양호 (${triggerCount}개 발견)`);
    }

    // ✅ [2026-03-06] AI 특유 표현 차단 — 발견 시 경고
    const aiBanned = [
      '알아보겠습니다', '소개해드리', '살펴보았습니다', '종합적으로',
      '귀추가 주목', '많은 관심이 모이고', '주목할 만한 행보',
      '정리하자면', '요약하면', '핵심:', '요약:', '정리:'
    ];
    let aiCount = 0;
    for (const ban of aiBanned) {
      if (fullBodyText.includes(ban)) {
        aiCount++;
        console.log(`[HomefeedHook] 🚨 AI 특유 표현 발견: "${ban}" — 홈판 노출 패널티 위험`);
      }
    }
    if (aiCount === 0) {
      console.log(`[HomefeedHook] ✅ AI 표현 0개 — 사람 냄새 양호`);
    }

    // ✅ [2026-03-06] 소제목 수 검증 — 3~8개가 최적 (구조 변동 엔진 대응)
    const headingCount = content.headings.length;
    if (headingCount < 3) {
      console.log(`[HomefeedHook] ⚠️ 소제목 ${headingCount}개 — 최소 3개 필요`);
    } else if (headingCount > 8) {
      console.log(`[HomefeedHook] ⚠️ 소제목 ${headingCount}개 — 너무 많음 (8개 이하 권장)`);
    } else {
      console.log(`[HomefeedHook] ✅ 소제목 ${headingCount}개 — 구조 변동 엔진 허용 범위`);
    }

    // ✅ [2026-03-06] 본문 품질 종합 점수 로깅
    let bodyScore = 100;
    if (triggerCount < 3) bodyScore -= 15;
    if (aiCount > 0) bodyScore -= (aiCount * 10);
    if (headingCount < 3) bodyScore -= 20;
    if (headingCount > 8) bodyScore -= 10;
    // 서브키워드 밀도 반영
    if (subKwArr.length > 0) {
      let kwHitCount = 0;
      for (const heading of content.headings) {
        const hBody = String((heading as any).body || (heading as any).content || '');
        const hTitle = String(heading.title || '');
        for (const kw of subKwArr) {
          if (hBody.includes(String(kw)) || hTitle.includes(String(kw))) { kwHitCount++; break; }
        }
      }
      const kwRatio = kwHitCount / content.headings.length;
      if (kwRatio < 0.5) bodyScore -= 15;
      else bodyScore += 10;
    }
    bodyScore = Math.max(0, Math.min(100, bodyScore));
    console.log(`[HomefeedBodyQuality] 📊 홈판 본문 품질 점수: ${bodyScore}/100`);
  }

  return content;
}

// ✅ [2026-03-06] SEO 전용 품질 Hook 블록 — 홈피드 Hook과 동급 런타임 품질 게이트
export function applySeoQualityHookBlock(content: StructuredContent, source: ContentSource): StructuredContent {
  const mode = (source.contentMode || 'seo') as PromptMode;
  if (mode !== 'seo') return content;

  // ✅ 서브키워드 본문 밀도 체크 (DIA 검색의도 매칭)
  const seoSubKwArr = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k))).slice(0, 3)
    : [];
  if (seoSubKwArr.length > 0 && Array.isArray(content.headings) && content.headings.length > 0) {
    let subKwFoundCount = 0;
    for (const heading of content.headings) {
      const body = String((heading as any).body || (heading as any).content || '');
      const htitle = String(heading.title || '');
      for (const kw of seoSubKwArr) {
        if (body.includes(String(kw)) || htitle.includes(String(kw))) {
          subKwFoundCount++;
          break;
        }
      }
    }
    const ratio = subKwFoundCount / content.headings.length;
    if (ratio < 0.5) {
      console.log(`[SeoHook] ⚠️ 서브키워드 본문 밀도 부족 (${Math.round(ratio * 100)}% — ${subKwFoundCount}/${content.headings.length}개 소제목)`);
    } else {
      console.log(`[SeoHook] ✅ 서브키워드 본문 밀도 양호 (${Math.round(ratio * 100)}%)`);
    }
  }

  // ✅ 스크롤 트리거 검증 (체류시간 ↑)
  if (Array.isArray(content.headings) && content.headings.length > 0) {
    const seoScrollTriggers = [
      '근데', '사실은', '여기서', '중요한', '핵심은', '솔직히',
      '의외로', '반전', '바로', '결론', '이게', '알고보니',
      '참고로', '한 가지 더', '잠깐', '조심할'
    ];
    let triggerCount = 0;
    const fullBodyText = content.headings.map(
      (h: any) => String(h.title || '') + ' ' + String((h as any).body || (h as any).content || '')
    ).join(' ');
    for (const trigger of seoScrollTriggers) {
      if (fullBodyText.includes(trigger)) triggerCount++;
    }
    if (triggerCount < 3) {
      console.log(`[SeoHook] ⚠️ 스크롤 트리거 부족 (${triggerCount}/3개)`);
    } else {
      console.log(`[SeoHook] ✅ 스크롤 트리거 양호 (${triggerCount}개)`);
    }

    // ✅ 소제목 수 검증 (3~8개 — 구조 변동 엔진 대응)
    const hCount = content.headings.length;
    if (hCount < 3) {
      console.log(`[SeoHook] ⚠️ 소제목 ${hCount}개 — 최소 3개 필요`);
    } else if (hCount > 8) {
      console.log(`[SeoHook] ⚠️ 소제목 ${hCount}개 — 8개 이하 권장`);
    } else {
      console.log(`[SeoHook] ✅ 소제목 ${hCount}개 — 구조 변동 엔진 허용 범위`);
    }

    // ✅ SEO 본문 품질 종합 점수
    let seoBodyScore = 100;
    if (triggerCount < 3) seoBodyScore -= 10;
    if (hCount < 3) seoBodyScore -= 15;
    if (hCount > 8) seoBodyScore -= 5;

    // AI 표현 체크
    const seoBanned = [
      '알아보겠습니다', '소개해드리', '살펴보았습니다', '종합적으로',
      '정리하자면', '요약하면', '물론', '확실히', '것입니다', '하겠습니다'
    ];
    let seoAiCount = 0;
    for (const ban of seoBanned) {
      if (fullBodyText.includes(ban)) {
        seoAiCount++;
        console.log(`[SeoHook] 🚨 AI 표현: "${ban}"`);
      }
    }
    if (seoAiCount === 0) {
      console.log(`[SeoHook] ✅ AI 표현 0개`);
    }
    seoBodyScore -= (seoAiCount * 8);

    // 서브키워드 밀도 반영
    if (seoSubKwArr.length > 0) {
      let kwHitCount = 0;
      for (const heading of content.headings) {
        const hBody = String((heading as any).body || (heading as any).content || '');
        const hTitle = String(heading.title || '');
        for (const kw of seoSubKwArr) {
          if (hBody.includes(String(kw)) || hTitle.includes(String(kw))) { kwHitCount++; break; }
        }
      }
      const kwRatio = kwHitCount / content.headings.length;
      if (kwRatio < 0.5) seoBodyScore -= 10;
      else seoBodyScore += 10;
    }

    seoBodyScore = Math.max(0, Math.min(100, seoBodyScore));
    console.log(`[SeoBodyQuality] 📊 SEO 본문 품질 점수: ${seoBodyScore}/100`);
  }

  return content;
}
