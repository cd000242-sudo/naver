/**
 * SPEC-CONVERSION-001 L2-1.3 — 페르소나 빌더 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import {
  buildPersona,
  buildPersonaPromptBlock,
  type PersonaCategory,
} from '../content/personaBuilder';

describe('buildPersona — 결정론', () => {
  it('같은 입력은 같은 페르소나 (캐싱·테스트 안정성)', () => {
    const a = buildPersona({ category: 'food', productHint: '김치찌개' });
    const b = buildPersona({ category: 'food', productHint: '김치찌개' });
    expect(a.name).toBe(b.name);
    expect(a.tone).toBe(b.tone);
    expect(a.occupation).toBe(b.occupation);
    expect(a.experienceYears).toBe(b.experienceYears);
  });

  it('다른 productHint는 다른 이름 가능성', () => {
    const a = buildPersona({ category: 'food', productHint: '한식' });
    const b = buildPersona({ category: 'food', productHint: '양식' });
    // 결정론적이지만 이름은 다를 수 있음
    expect(a.category).toBe(b.category);
  });
});

describe('buildPersona — 카테고리별 톤·어휘', () => {
  const categories: PersonaCategory[] = [
    'food', 'parenting', 'beauty', 'health', 'travel',
    'tech', 'lifestyle', 'entertainment', 'finance', 'general',
  ];
  for (const c of categories) {
    it(`${c} 카테고리 페르소나 정상 생성`, () => {
      const p = buildPersona({ category: c });
      expect(p.category).toBe(c);
      expect(p.vocabularyHints.length).toBeGreaterThan(0);
      expect(p.forbiddenPhrases.length).toBeGreaterThan(0);
      expect(p.experienceYears).toBeGreaterThan(0);
    });
  }

  it('parenting은 mom_cafe 톤', () => {
    expect(buildPersona({ category: 'parenting' }).tone).toBe('mom_cafe');
  });

  it('health는 expert_review 톤', () => {
    expect(buildPersona({ category: 'health' }).tone).toBe('expert_review');
  });
});

describe('buildPersona — 폴백 + silent 금지', () => {
  it('알 수 없는 카테고리는 general로 폴백 (warn 출력)', () => {
    const p = buildPersona({ category: 'unknown_xyz' });
    expect(p.category).toBe('general');
  });

  it('빈 입력도 동작', () => {
    const p = buildPersona({});
    expect(p.category).toBe('general');
    expect(p.tone).toBeDefined();
  });
});

describe('buildPersona — REVIEW-001 userVoice 통합', () => {
  it('userVoice가 vocabularyHints에 추가됨', () => {
    const p = buildPersona({
      category: 'beauty',
      userVoice: ['진짜 발색 좋아요', '제 인생 립스틱'],
    });
    expect(p.vocabularyHints.some((v) => v.includes('발색') || v.includes('인생 립스틱'))).toBe(true);
  });

  it('userVoice 60자 초과는 제외', () => {
    const long = 'X'.repeat(80);
    const p = buildPersona({ category: 'food', userVoice: [long] });
    expect(p.vocabularyHints.includes(long)).toBe(false);
  });

  it('userVoice 5개 초과는 잘림', () => {
    const voices = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱'];
    const p = buildPersona({ category: 'food', userVoice: voices });
    const added = p.vocabularyHints.filter((v) => voices.includes(v));
    expect(added.length).toBeLessThanOrEqual(5);
  });
});

describe('buildPersonaPromptBlock', () => {
  it('프롬프트 블록 필수 필드 포함', () => {
    const p = buildPersona({ category: 'tech', productHint: '갤럭시' });
    const block = buildPersonaPromptBlock(p);
    expect(block).toContain('이름');
    expect(block).toContain('연령대');
    expect(block).toContain('직업');
    expect(block).toContain('톤');
    expect(block).toContain('자주 쓰는 어휘');
    expect(block).toContain('절대 쓰지 않는');
  });

  it('forbiddenPhrases가 프롬프트에 노출됨', () => {
    const p = buildPersona({ category: 'finance' });
    const block = buildPersonaPromptBlock(p);
    expect(block).toContain('확실한 수익');
  });
});

describe('SPEC 메모리 원칙 — silent 폴백 부재', () => {
  it('결과 객체에 imageSource·subWorkProvider 단어 없음', () => {
    const p = buildPersona({ category: 'food' });
    const blob = JSON.stringify(p);
    expect(blob).not.toContain('imageSource');
    expect(blob).not.toContain('subWorkProvider');
  });
});
