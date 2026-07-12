import { describe, expect, it } from 'vitest';

import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

describe('contentJsonPromptFormat', () => {
  const baseSource = {
    rawText: '원본 본문입니다.',
    title: '제목 참고',
    metadata: { keywords: ['메인키워드', '서브키워드'] },
  } as any;

  it('keeps mate-mode output contract including tables, FAQ, and no fake guide wording', () => {
    const prompt = buildContentJsonOutputFormat({
      contentMode: 'mate',
      mode: 'mate',
      source: baseSource,
      title: '제목 참고',
      rawText: '네이버 메이트 테스트 원문',
      primaryKeyword: '네이버 메이트',
      subKeywords: '선정 기준, 글 구조',
      minChars: 2000,
    });

    expect(prompt).toContain('[네이버 메이트 모드 필수 구조 규칙');
    expect(prompt).toContain('FAQ 4~6개');
    expect(prompt).toContain('출처 없는 "공식 가이드/최신 가이드" 표현은 절대 금지');
    expect(prompt).toContain('"introduction": "도입부 (첫 300자 안에 직접 답변)"');
    expect(prompt).toContain('최대 2열 마크다운');
    expect(prompt).toContain('목표 글자수: 2000자 안팎');
    expect(prompt).toContain('네이버 메이트 테스트 원문');
  });

  it('preserves business contact details without inventing values', () => {
    const prompt = buildContentJsonOutputFormat({
      contentMode: 'business',
      mode: 'business',
      source: {
        ...baseSource,
        businessInfo: {
          name: '리더상사',
          phone: '010-1234-5678',
          kakao: 'leader-kakao',
          serviceArea: 'nationwide',
          promoTarget: 'product',
        },
      },
      title: '',
      rawText: '업체 홍보 원문',
      primaryKeyword: '업체홍보',
      subKeywords: '',
    });

    expect(prompt).toContain('📛 업체명: 리더상사');
    expect(prompt).toContain('📞 전화번호: 010-1234-5678');
    expect(prompt).toContain('💬 카카오톡: leader-kakao');
    expect(prompt).toContain('서비스 범위: 전국');
    expect(prompt).toContain('가짜 전화번호');
    expect(prompt).toContain('업체 홍보 원문');
  });

  it('keeps keyword and previous-title constraints in the final JSON instruction block', () => {
    const prompt = buildContentJsonOutputFormat({
      contentMode: 'seo',
      mode: 'seo',
      source: {
        ...baseSource,
        previousTitles: ['반복되면 안 되는 제목'],
      },
      title: '원본 제목',
      rawText: 'SEO 원문',
      primaryKeyword: '제습기와 서큘레이터 같이 쓰면 빨래가 더 빨리 마를까',
      subKeywords: '빨래 건조, 장마철',
      metrics: { searchVolume: 12000, documentCount: 300 },
    });

    expect(prompt).toContain('이전 작성 제목');
    expect(prompt).toContain('반복되면 안 되는 제목');
    expect(prompt).toContain('메인 키워드');
    expect(prompt).toContain('서브 키워드: 빨래 건조, 장마철');
    expect(prompt).toContain('월간검색량 12,000건');
    expect(prompt).toContain('JSON 문자열 값 안의 마크다운 표');
  });
});
