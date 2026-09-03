import { describe, expect, it } from 'vitest';

import { validateStructuredContent } from '../contentStructuredValidator';

/**
 * [2026-09-03 실측 3건] 구조 검증기가 "키워드"를 source.title 이나 원문 앞 50자에서 가져와,
 * 멀쩡한 제목을 "키워드와 무관"으로 찍고 그 쓰레기로 다시 지었다:
 *   "핵심 정보: 정의 주말에 떠나는 …" / "청년도약계좌 가입조건 관련 콘텐츠, 알아두면 좋은 핵심 정보 총정리"
 *   / "환절기 비염 관리법 === 사실 자료 (수치 조건 절차는 이 범위에서만 사용)"
 */
function content(selectedTitle: string, titleAlternatives: string[] = []) {
  return {
    selectedTitle,
    titleAlternatives,
    headings: [{ title: '코막힘이 잠을 깨우는 이유', content: '본문 '.repeat(120) }],
    bodyPlain: '본문 '.repeat(300),
    images: [],
    metadata: {},
  } as any;
}

const FACT_HEADER = '=== 사실 자료 (수치·조건·절차는 이 범위에서만 사용) ===';
const rawText = [FACT_HEADER, '환절기 비염은 낮과 밤 기온 차가 10도 이상 벌어질 때 심해집니다. '.repeat(3)].join('\n');

describe('구조 검증기 — 키워드는 사용자 키워드에서', () => {
  it('제목 없는 키워드 글: 자료 머리글이 키워드가 되지 않고 제목은 그대로', () => {
    const c = content('환절기 비염 관리법, 입으로 자는 사람이 먼저 손댈 곳');
    validateStructuredContent(c, { sourceType: 'custom_text', rawText, metadata: { keywords: ['환절기 비염 관리법'] } } as any);
    expect(c.selectedTitle).toBe('환절기 비염 관리법, 입으로 자는 사람이 먼저 손댈 곳');
  });

  it('자리표시 제목이 있어도 사용자 키워드가 이긴다', () => {
    const c = content('청년도약계좌 가입조건, 소득 경계에서 혜택이 갈리는 이유');
    validateStructuredContent(c, { sourceType: 'custom_text', rawText, title: '청년도약계좌 가입조건 관련 콘텐츠', metadata: { keywords: ['청년도약계좌 가입조건'] } } as any);
    expect(c.selectedTitle).toBe('청년도약계좌 가입조건, 소득 경계에서 혜택이 갈리는 이유');
  });

  it('키워드도 제목도 없으면 관련성 검사를 건너뛴다 — 원문 앞부분은 키워드가 아니다', () => {
    const c = content('입으로 자는 사람이 먼저 손댈 곳');
    validateStructuredContent(c, { sourceType: 'custom_text', rawText, metadata: {} } as any);
    expect(c.selectedTitle).toBe('입으로 자는 사람이 먼저 손댈 곳');
  });

  it('키워드 불일치만으로는 제목을 갈아엎지 않는다', () => {
    const c = content('입으로 자는 사람이 먼저 손댈 곳');
    validateStructuredContent(c, { sourceType: 'custom_text', rawText, metadata: { keywords: ['청년도약계좌'] } } as any);
    expect(c.selectedTitle).toBe('입으로 자는 사람이 먼저 손댈 곳');
    expect(c.selectedTitle).not.toContain('총정리');
  });

  it('진짜 지침 누출이면 여전히 대안 제목으로 바꾼다', () => {
    const c = content('검색 노출 극대화 비염 관리', ['환절기 비염 관리법, 코막힘부터 보는 순서']);
    validateStructuredContent(c, { sourceType: 'custom_text', rawText, metadata: { keywords: ['환절기 비염 관리법'] } } as any);
    expect(c.selectedTitle).toBe('환절기 비염 관리법, 코막힘부터 보는 순서');
  });
});
