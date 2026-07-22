import { describe, expect, it } from 'vitest';
import { isSentenceStyleHeadingTitle } from '../contentBodyTransforms';
import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

/**
 * [v2.11.140] 문장형 소제목 생성측 가드.
 *
 * 실측 사고(7/22): AI가 소제목 4개를 전부 "...보도됐습니다" 문장형으로 생성 →
 * 발행 구조 해석이 0개 추출 → 소제목/이미지 전멸 발행. 발행측은 위치 재분할로
 * 방어했고(34fa6be9), 여기는 생성측 계약: 프롬프트에 스타일 규칙을 명시하고
 * 위반을 감지기로 관측한다.
 */
describe('heading title style guard (v2.11.140)', () => {
  it('detects the exact incident titles as sentence-style', () => {
    expect(isSentenceStyleHeadingTitle('올다르크 잠실 개표소 출입을 막았다는 사건으로 보도됐습니다')).toBe(true);
    expect(isSentenceStyleHeadingTitle('법원은 증거인멸과 도주 우려가 없다고 판단했습니다')).toBe(true);
    expect(isSentenceStyleHeadingTitle('이번 결정이 알려지자 반응이 갈렸어요.')).toBe(false); // 갈렸어요는 목록 외 — 보수적 감지
    expect(isSentenceStyleHeadingTitle('구속영장이 기각됐다')).toBe(true);
  });

  it('keeps noun/phrase-style titles (정상 소제목) out of the detector', () => {
    expect(isSentenceStyleHeadingTitle('출입·진입·봉쇄라는 표현이 함께 보인 이유')).toBe(false);
    expect(isSentenceStyleHeadingTitle('결국 남는 질문')).toBe(false);
    expect(isSentenceStyleHeadingTitle('아이폰16 디자인 변경점 정리')).toBe(false);
    expect(isSentenceStyleHeadingTitle('')).toBe(false);
  });

  it('prompt contract: 모든 모드 공통 소제목 스타일 규칙이 출력 형식에 포함된다', () => {
    for (const mode of ['seo', 'homefeed', 'mate'] as const) {
      const prompt = buildContentJsonOutputFormat({
        contentMode: mode === 'seo' ? 'seo' : mode,
        mode,
        source: { rawText: '원본', title: '제목', metadata: {} } as any,
        title: '제목',
        rawText: '원본',
        primaryKeyword: '키워드',
        subKeywords: '',
      });
      expect(prompt).toContain('[소제목 스타일 — 모든 모드 공통]');
      expect(prompt).toContain('완결 문장으로 끝나는 소제목 금지');
    }
  });
});
