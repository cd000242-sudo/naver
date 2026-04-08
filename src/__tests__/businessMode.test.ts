import { describe, it, expect } from 'vitest';
import { buildModeBasedPrompt, validateBusinessContent } from '../contentGenerator';
import { buildBusinessAngleDirective, TONE_PERSONAS } from '../promptLoader';
import type { ContentSource } from '../contentGenerator';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 헬퍼: 기본 ContentSource 만들기
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeSource(overrides: Partial<ContentSource> = {}): ContentSource {
  return {
    sourceType: 'custom_text',
    rawText: '부산 인테리어 시공 사례 및 견적 안내',
    title: '부산 인테리어 견적',
    contentMode: 'business',
    toneStyle: 'professional',
    metadata: { keywords: ['부산 인테리어', '철거', '도배', '욕실'] } as any,
    ...overrides,
  };
}

const REGIONAL_INFO = {
  name: 'ABC인테리어',
  phone: '051-123-4567',
  kakao: 'abc_interior',
  address: '부산광역시 해운대구 ○○로 123',
  hours: '09:00~19:00',
  region: '부산, 울산',
  serviceArea: 'regional' as const,
  extra: '시공 15년차, A/S 1년 보장',
};

const NATIONWIDE_INFO = {
  name: '한국인테리어',
  phone: '1588-1234',
  kakao: 'korea_interior',
  address: '서울 본사',
  hours: '24시간 상담 가능',
  serviceArea: 'nationwide' as const,
  extra: '전국 50개 거점, 누적 시공 5,000건',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 1: businessInfo 주입 검증
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Business 모드 — businessInfo 주입', () => {
  it('지역구: 모든 필드가 프롬프트에 포함', () => {
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);

    expect(prompt).toContain('ABC인테리어');
    expect(prompt).toContain('051-123-4567');
    expect(prompt).toContain('abc_interior');
    expect(prompt).toContain('부산광역시 해운대구 ○○로 123');
    expect(prompt).toContain('09:00~19:00');
    expect(prompt).toContain('부산, 울산');
    expect(prompt).toContain('시공 15년차, A/S 1년 보장');
  });

  it('지역구: "절대 변경 금지" 강제 지시 포함', () => {
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).toContain('한 글자도 변경하지 말고 그대로 사용');
    expect(prompt).toContain('절대 가짜 전화번호');
    expect(prompt).toContain('업체명을 본문에 8~12회 자연 반복');
  });

  it('지역구: 첫 지역명을 제목 맨 앞에 배치하라는 지시 포함', () => {
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).toContain('제목 맨 앞에 위 지역명 중 1개 필수 배치');
    expect(prompt).toContain('부산'); // 첫 번째 지역
  });

  it('전국구: 지역명 강제 삽입 금지 지시 포함', () => {
    const source = makeSource({ businessInfo: NATIONWIDE_INFO });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).toContain('전국 (지역 제한 없음)');
    expect(prompt).toContain('특정 지역명 강제 삽입 금지');
    expect(prompt).toContain('전국 어디든');
    expect(prompt).toContain('한국인테리어');
    expect(prompt).toContain('1588-1234');
  });

  it('전국구: region 필드 미포함', () => {
    const source = makeSource({ businessInfo: NATIONWIDE_INFO });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    // 전국구는 region 필드 가이드 대신 nationwide 가이드만
    expect(prompt).not.toContain('🗺️ 서비스 지역:');
  });

  it('businessInfo 없으면 업체 정보 블록 미포함', () => {
    const source = makeSource({ businessInfo: undefined });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).not.toContain('[업체 정보 — 절대 변경/조작 금지');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 2: 다양성 엔진
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Business 모드 — 다양성 엔진 (Angle)', () => {
  it('buildBusinessAngleDirective는 8가지 각도 중 하나 반환', () => {
    const expected = ['가격 투명성', '시공 사례', 'A/S 보장', '빠른 견적', '무료 상담', '전문성', '친절', '최신 트렌드'];
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const directive = buildBusinessAngleDirective();
      const matched = expected.some(e => directive.includes(e));
      expect(matched).toBe(true);
      // 강조 포인트 라인 추출
      const m = directive.match(/■ 강조 포인트: ([^\n]+)/);
      if (m) results.add(m[1]);
    }
    // 100번 시도 시 최소 4가지 이상 다른 각도가 나와야 정상 (랜덤성 확인)
    expect(results.size).toBeGreaterThanOrEqual(4);
  });

  it('directive에 후킹 스타일과 PASTOR 변형 모두 포함', () => {
    const directive = buildBusinessAngleDirective();
    expect(directive).toContain('강조 포인트');
    expect(directive).toContain('본문 초점');
    expect(directive).toContain('도입부 후킹 스타일');
    expect(directive).toContain('PASTOR 변형');
  });

  it('Business 모드 프롬프트에 angle directive 포함', () => {
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).toContain('BUSINESS ANGLE OVERRIDE');
  });

  it('SEO 모드는 angle directive 미포함', () => {
    const source = makeSource({ contentMode: 'seo' });
    const prompt = buildModeBasedPrompt(source, 'seo', undefined, 1800);
    expect(prompt).not.toContain('BUSINESS ANGLE OVERRIDE');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 3: previousTitles
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Business 모드 — previousTitles 회피', () => {
  it('previousTitles가 있으면 프롬프트에 포함', () => {
    const source = makeSource({
      businessInfo: REGIONAL_INFO,
      previousTitles: [
        '부산 인테리어 ABC인테리어 합리적 견적',
        '부산 30평 인테리어 시공 후기',
        '부산 인테리어 잘하는 곳 ABC',
      ],
    });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).toContain('이전 작성 제목');
    expect(prompt).toContain('부산 인테리어 ABC인테리어 합리적 견적');
    expect(prompt).toContain('비슷한 패턴 반복 금지');
  });

  it('previousTitles 없으면 블록 미포함', () => {
    const source = makeSource({ businessInfo: REGIONAL_INFO, previousTitles: undefined });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).not.toContain('[이전 작성 제목');
  });

  it('5개 초과 시 마지막 5개만 표시', () => {
    const titles = Array.from({ length: 8 }, (_, i) => `이전 글 ${i + 1}`);
    const source = makeSource({ businessInfo: REGIONAL_INFO, previousTitles: titles });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).not.toContain('이전 글 1');
    expect(prompt).not.toContain('이전 글 3');
    expect(prompt).toContain('이전 글 4');
    expect(prompt).toContain('이전 글 8');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 4: 키워드/소제목 강제 지시
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Business 모드 — 키워드/소제목 강제 지시', () => {
  it('메인 키워드 강제 지시 포함', () => {
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).toContain('필수 키워드 정보');
    expect(prompt).toContain('메인 키워드');
  });

  it('서브 키워드가 있으면 포함', () => {
    const source = makeSource({
      businessInfo: REGIONAL_INFO,
      metadata: { keywords: ['부산 인테리어', '철거', '도배', '욕실'] } as any,
    });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).toContain('서브 키워드');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 5: 최종 강제 조건
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Business 모드 — 최종 강제 조건', () => {
  it('마지막에 [최종 강제 조건] 블록 포함', () => {
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).toContain('최종 강제 조건');
    expect(prompt).toContain('이제 위 모든 정보를 종합하여 즉시 JSON으로 출력하라');
  });

  it('글자수 지침 포함 (minChars 전달 시)', () => {
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const prompt = buildModeBasedPrompt(source, 'business', undefined, 1800);
    expect(prompt).toContain('1800자');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 6: 캐시 적중률 (system 부분 정적)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Business 모드 — 캐시 적중률', () => {
  it('같은 모드/카테고리, 다른 businessInfo: system 부분 동일', () => {
    const source1 = makeSource({ businessInfo: REGIONAL_INFO });
    const source2 = makeSource({ businessInfo: NATIONWIDE_INFO });
    const prompt1 = buildModeBasedPrompt(source1, 'business', undefined, 1800);
    const prompt2 = buildModeBasedPrompt(source2, 'business', undefined, 1800);

    // [원본 텍스트] 마커로 분리
    const sys1 = prompt1.split('[원본 텍스트]')[0];
    const sys2 = prompt2.split('[원본 텍스트]')[0];

    // system 부분 (마커 이전)이 동일해야 캐시 적중
    expect(sys1).toBe(sys2);
  });

  it('다른 minChars: system 부분 동일 (글자수는 user 파트로 이동됨)', () => {
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const prompt1 = buildModeBasedPrompt(source, 'business', undefined, 1500);
    const prompt2 = buildModeBasedPrompt(source, 'business', undefined, 2500);

    const sys1 = prompt1.split('[원본 텍스트]')[0];
    const sys2 = prompt2.split('[원본 텍스트]')[0];

    expect(sys1).toBe(sys2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 7: TONE_PERSONAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 8: validateBusinessContent (가짜 번호/광고법/CTA 검증)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('validateBusinessContent — 가짜 번호 + 광고법 검증', () => {
  function makeContent(overrides: any = {}): any {
    return {
      selectedTitle: '부산 인테리어 ABC인테리어 합리적 견적',
      bodyPlain: 'ABC인테리어는 부산 시공 200건 이상의 경험. 전화 051-123-4567로 문의하세요. ABC인테리어가 책임집니다.',
      headings: [
        { title: '부산 인테리어 고민', content: 'ABC인테리어 소개' },
        { title: '부산 인테리어 견적', content: '평수별 가격' },
        { title: '부산 시공 사례', content: 'ABC인테리어 사례' },
        { title: 'A/S 보장', content: 'ABC인테리어 1년 보장' },
        { title: '부산 인테리어 견적 문의 안내', content: '051-123-4567' },
      ],
      ...overrides,
    };
  }

  it('정상 케이스: 모든 정보 일치 → critical 없음', () => {
    const content = makeContent();
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const result = validateBusinessContent(content, source);
    expect(result.hasCritical).toBe(false);
  });

  it('업체명 누락 → critical violation', () => {
    const content = makeContent({
      selectedTitle: '부산 인테리어 합리적 견적', // 업체명 제거
      bodyPlain: '부산 인테리어 시공. 전화 051-123-4567.',
      headings: [
        { title: '부산 인테리어 1', content: '시공' },
        { title: '부산 인테리어 2', content: '견적' },
        { title: '부산 인테리어 3', content: '사례' },
        { title: '부산 인테리어 4', content: 'A/S' },
        { title: '부산 인테리어 견적 문의 안내', content: '051-123-4567' },
      ],
    });
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const result = validateBusinessContent(content, source);
    expect(result.hasCritical).toBe(true);
    expect(result.violations.some(v => v.includes('업체명'))).toBe(true);
  });

  it('전화번호 누락 → critical violation', () => {
    const content = makeContent({
      bodyPlain: 'ABC인테리어 시공 안내. 부산 지역.',
      headings: [
        { title: '부산 인테리어 1', content: 'ABC인테리어' },
        { title: '부산 인테리어 2', content: 'ABC인테리어' },
        { title: '부산 인테리어 3', content: 'ABC인테리어' },
        { title: '부산 인테리어 4', content: 'ABC인테리어' },
        { title: '부산 인테리어 견적 문의 안내', content: '카톡' },
      ],
    });
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const result = validateBusinessContent(content, source);
    expect(result.hasCritical).toBe(true);
    expect(result.violations.some(v => v.includes('전화번호'))).toBe(true);
  });

  it('가짜 전화번호 감지 → critical violation', () => {
    const content = makeContent({
      bodyPlain: 'ABC인테리어 부산. 전화 010-9999-0000으로 문의하세요. 진짜 번호 051-123-4567도 있어요.',
    });
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const result = validateBusinessContent(content, source);
    expect(result.hasCritical).toBe(true);
    expect(result.violations.some(v => v.includes('가짜 전화번호'))).toBe(true);
  });

  it('지역구인데 지역명 누락 → critical violation', () => {
    const content = makeContent({
      selectedTitle: 'ABC인테리어 합리적 견적',
      bodyPlain: 'ABC인테리어 시공. 전화 051-123-4567.',
      headings: [
        { title: '인테리어 1', content: 'ABC인테리어' },
        { title: '인테리어 2', content: 'ABC인테리어' },
        { title: '인테리어 3', content: 'ABC인테리어' },
        { title: '인테리어 4', content: 'ABC인테리어' },
        { title: '견적 문의 안내', content: '051-123-4567' },
      ],
    });
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const result = validateBusinessContent(content, source);
    expect(result.hasCritical).toBe(true);
    expect(result.violations.some(v => v.includes('지역명'))).toBe(true);
  });

  it('소제목 5개 미만 → critical violation', () => {
    const content = makeContent({
      headings: [
        { title: '부산 인테리어 1', content: 'ABC인테리어' },
        { title: '부산 인테리어 2', content: 'ABC인테리어' },
      ],
    });
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const result = validateBusinessContent(content, source);
    expect(result.hasCritical).toBe(true);
    expect(result.violations.some(v => v.includes('소제목'))).toBe(true);
  });

  it('마지막 소제목 CTA 아니면 warning', () => {
    const content = makeContent({
      headings: [
        { title: '부산 인테리어 1', content: 'ABC인테리어' },
        { title: '부산 인테리어 2', content: 'ABC인테리어' },
        { title: '부산 인테리어 3', content: 'ABC인테리어' },
        { title: '부산 인테리어 4', content: 'ABC인테리어' },
        { title: '부산 인테리어 5', content: 'ABC인테리어 끝' }, // CTA 아님
      ],
    });
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const result = validateBusinessContent(content, source);
    expect(result.warnings.some(w => w.includes('CTA'))).toBe(true);
  });

  it('광고법 단정 표현 감지 → critical violation', () => {
    const content = makeContent({
      bodyPlain: 'ABC인테리어는 100% 만족 보장. 부산 최저가 시공. 전화 051-123-4567.',
    });
    const source = makeSource({ businessInfo: REGIONAL_INFO });
    const result = validateBusinessContent(content, source);
    expect(result.hasCritical).toBe(true);
    expect(result.violations.some(v => v.includes('광고법'))).toBe(true);
  });

  it('전국구인데 특정 지역명 발견 → warning', () => {
    const content = makeContent({
      selectedTitle: '한국인테리어 전국 시공 사례',
      bodyPlain: '한국인테리어는 전국 거점 50개. 강남, 송파에서도 시공. 1588-1234로 문의하세요.',
      headings: [
        { title: '한국인테리어 1', content: '한국인테리어' },
        { title: '한국인테리어 2', content: '한국인테리어' },
        { title: '한국인테리어 3', content: '한국인테리어' },
        { title: '한국인테리어 4', content: '한국인테리어' },
        { title: '문의 안내', content: '1588-1234' },
      ],
    });
    const source = makeSource({ businessInfo: NATIONWIDE_INFO });
    const result = validateBusinessContent(content, source);
    expect(result.warnings.some(w => w.includes('전국구인데 특정 지역'))).toBe(true);
  });

  it('non-business 모드는 검증 스킵', () => {
    const content = makeContent();
    const source = makeSource({ contentMode: 'seo', businessInfo: undefined });
    const result = validateBusinessContent(content, source);
    expect(result.hasCritical).toBe(false);
    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 9: category prompt 파일
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Business 모드 — 카테고리 prompt 파일', () => {
  it('4개 카테고리 prompt 파일 모두 존재', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'prompts', 'business');
    const expected = ['base.prompt', 'construction.prompt', 'professional.prompt', 'medical.prompt', 'local.prompt'];
    for (const file of expected) {
      const fullPath = path.join(dir, file);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it('의료 카테고리는 의료광고법 56조 강력 명시', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'business', 'medical.prompt'), 'utf-8');
    expect(content).toContain('의료광고법 56조');
    expect(content).toContain('환자 후기/체험담');
    expect(content).toContain('절대 금지');
  });

  it('construction 카테고리는 평수별 가격 가이드 포함', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'business', 'construction.prompt'), 'utf-8');
    expect(content).toContain('평수별');
    expect(content).toContain('A/S');
  });
});

describe('TONE_PERSONAS — 단일 소스 진실', () => {
  it('10개 톤 모두 정의됨', () => {
    const expected = ['friendly', 'professional', 'casual', 'humorous', 'community_fan', 'mom_cafe', 'formal', 'storyteller', 'expert_review', 'calm_info'];
    for (const t of expected) {
      expect(TONE_PERSONAS[t]).toBeDefined();
      expect(TONE_PERSONAS[t].label).toBeTruthy();
      expect(TONE_PERSONAS[t].persona).toBeTruthy();
      expect(TONE_PERSONAS[t].forbidden).toBeTruthy();
      expect(TONE_PERSONAS[t].rule).toBeTruthy();
    }
  });
});
