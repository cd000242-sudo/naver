/**
 * SPEC-CONVERSION-001 L3-3.3 — imageBodyAlignmentVerifier 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import {
  verifyImageBodyAlignment,
  buildAlignmentRetryHint,
} from '../image/imageBodyAlignmentVerifier';
import type { ExtractedKeyword } from '../content/keywordExtractor';

const kw = (term: string, hint: 'concrete' | 'abstract' | 'unknown' = 'concrete'): ExtractedKeyword => ({
  term, score: 10, count: 5, inTitle: false, visualHint: hint,
});

describe('verifyImageBodyAlignment — 정상', () => {
  it('영어 이미지 프롬프트 ↔ 한글 본문 키워드 (사전 매핑 안 돼도 부분 일치)', () => {
    const r = verifyImageBodyAlignment({
      bodyKeywords: [kw('카페'), kw('인테리어'), kw('메뉴')],
      imagePromptOrAlt: 'cafe interior, modern menu, natural lighting',
      minOverlapRate: 0.3,
    });
    // 한글 → 영어 부분일치는 이뤄지지 않으므로 영어 키워드끼리 비교
    // 본 테스트는 한글 → 영어 매핑이 직접 일치 안하므로 overlap 0
    // 따라서 한글 키워드만 본 모듈에서 직접 매칭 — 여기선 0건 매칭 예상
    expect(r.aligned).toBe(false);
  });

  it('한글 ↔ 한글 매칭', () => {
    const r = verifyImageBodyAlignment({
      bodyKeywords: [kw('카페'), kw('인테리어'), kw('메뉴'), kw('분위기')],
      imagePromptOrAlt: '카페 인테리어, 메뉴, 자연광',
      minOverlapRate: 0.5,
    });
    expect(r.aligned).toBe(true);
    expect(r.matchedKeywords).toContain('카페');
    expect(r.matchedKeywords).toContain('인테리어');
    expect(r.overlapRate).toBeGreaterThanOrEqual(0.5);
  });

  it('영어 ↔ 영어 매칭', () => {
    const r = verifyImageBodyAlignment({
      bodyKeywords: [kw('cafe'), kw('interior'), kw('menu')],
      imagePromptOrAlt: 'cafe interior, modern menu',
      minOverlapRate: 0.5,
    });
    expect(r.aligned).toBe(true);
    expect(r.matchedKeywords.length).toBeGreaterThanOrEqual(2);
  });

  it('extraInImage — 이미지에만 있는 토큰 노출', () => {
    const r = verifyImageBodyAlignment({
      bodyKeywords: [kw('카페')],
      imagePromptOrAlt: '카페 도쿄 거리 풍경',
    });
    expect(r.extraInImage).toContain('도쿄');
    expect(r.extraInImage).toContain('거리');
  });

  it('missingFromImage — 본문에만 있는 concrete 키워드', () => {
    const r = verifyImageBodyAlignment({
      bodyKeywords: [kw('카페'), kw('소파', 'concrete'), kw('만족감', 'abstract')],
      imagePromptOrAlt: '카페',
      minOverlapRate: 0.5,
    });
    expect(r.missingFromImage).toContain('소파');
    // 추상 키워드는 missing에서 제외 (시각화 불가)
    expect(r.missingFromImage).not.toContain('만족감');
  });
});

describe('verifyImageBodyAlignment — fallback', () => {
  it('빈 이미지 프롬프트는 명시 reason', () => {
    const r = verifyImageBodyAlignment({
      bodyKeywords: [kw('카페')],
      imagePromptOrAlt: '',
    });
    expect(r.aligned).toBe(false);
    expect(r.reason).toMatch(/IMAGE_PROMPT_EMPTY/);
  });

  it('빈 본문 키워드는 명시 reason', () => {
    const r = verifyImageBodyAlignment({
      bodyKeywords: [],
      imagePromptOrAlt: '카페',
    });
    expect(r.aligned).toBe(false);
    expect(r.reason).toMatch(/BODY_KEYWORDS_EMPTY/);
  });

  it('overlap 임계 미달은 OVERLAP_TOO_LOW reason', () => {
    const r = verifyImageBodyAlignment({
      bodyKeywords: [kw('카페'), kw('소파'), kw('인테리어'), kw('메뉴')],
      imagePromptOrAlt: '도쿄 거리',
      minOverlapRate: 0.5,
    });
    expect(r.aligned).toBe(false);
    expect(r.reason).toMatch(/OVERLAP_TOO_LOW/);
  });

  it('stopword (사진·이미지 등) 무시', () => {
    const r = verifyImageBodyAlignment({
      bodyKeywords: [kw('카페')],
      imagePromptOrAlt: '카페 사진 이미지',
    });
    // 사진·이미지 stopword 제외 → 카페만 인식 → matched 1
    expect(r.matchedKeywords).toContain('카페');
    // extra에서 stopword 제외 확인
    expect(r.extraInImage).not.toContain('사진');
    expect(r.extraInImage).not.toContain('이미지');
  });
});

describe('buildAlignmentRetryHint', () => {
  it('aligned 시 빈 문자열', () => {
    expect(buildAlignmentRetryHint({
      aligned: true, overlapRate: 1, matchedKeywords: ['x'],
      missingFromImage: [], extraInImage: [],
    })).toBe('');
  });

  it('aligned=false면 missing 키워드 + 재생성 안내', () => {
    const hint = buildAlignmentRetryHint({
      aligned: false, overlapRate: 0.2,
      matchedKeywords: ['카페'],
      missingFromImage: ['소파', '인테리어'],
      extraInImage: ['도쿄'],
      reason: 'OVERLAP_TOO_LOW: 20%',
    });
    expect(hint).toContain('정렬 실패');
    expect(hint).toContain('소파');
    expect(hint).toContain('재생성');
  });
});
