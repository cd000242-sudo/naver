import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { decideKeywordPrefix } from '../content/keywordTitlePrefixPolicy';

/**
 * [2026-08-26 사용자 실측 / app 로그]
 *
 *   [TitleSelect] 제목 교체(73점 → 100점): "나혼산 전현무 알마티 여행 논란, 렌터카 공증 절차와 제작진 입장 정리"
 *   [FinalQualityGate] ⚠️ 최종 제목 품질 미달 (3점): "전현무 즉흥여행 논란 나혼산 전현무 알마티 여행 논란, ..."
 *   [FinalQualityGate] 복구 후: (73점)
 *
 * 후보 재선택이 고른 100점 제목을 "키워드 앞배치" 옵션이 3점짜리로 만들었다. 중복 제거로
 * 73점까지 회복했지만 원래보다 나쁘다. 기존 중복 제거는 키워드가 제목에 **연속으로**
 * 들어 있을 때만 걷어내서, 전현무/논란처럼 흩어져 있으면 못 잡았다.
 *
 * 옵션 자체는 사용자가 켠 것이라 끄지 않는다. 이미 충분히 들어 있을 때만 건너뛴다.
 */
describe('키워드 앞배치 판정 — 실측 사례', () => {
  const 실측제목 = '나혼산 전현무 알마티 여행 논란, 렌터카 공증 절차와 제작진 입장 정리';

  it('흩어져 있어도 이미 커버된 것으로 보고 붙이지 않는다', () => {
    const d = decideKeywordPrefix('전현무 즉흥여행 논란', 실측제목);
    expect(d.shouldPrefix).toBe(false);
    expect(d.reason).toBe('already-covered');
    expect(d.coveredTokens).toBe(2);   // 전현무, 논란
    expect(d.totalTokens).toBe(3);
  });

  it('정말로 빠져 있으면 붙인다 (옵션을 무력화하지 않는다)', () => {
    const d = decideKeywordPrefix('제습기 전기세', '여름철 습도 관리하는 방법 세 가지');
    expect(d.shouldPrefix).toBe(true);
    expect(d.reason).toBe('absent');
  });

  it('이미 키워드로 시작하면 건너뛴다 (기존 동작 유지)', () => {
    const d = decideKeywordPrefix('제습기 전기세', '제습기 전기세 얼마나 나올까');
    expect(d.shouldPrefix).toBe(false);
    expect(d.reason).toBe('starts-with-keyword');
  });
});

describe('판정 경계', () => {
  it('3분의 2가 기준이다', () => {
    // 3토큰 중 2개 → 커버
    expect(decideKeywordPrefix('가나다 라마바 사아자', '가나다 사아자 이야기').shouldPrefix).toBe(false);
    // 3토큰 중 1개 → 부족
    expect(decideKeywordPrefix('가나다 라마바 사아자', '가나다 이야기').shouldPrefix).toBe(true);
  });

  it('한 글자 토큰은 우연히 겹치므로 세지 않는다', () => {
    const d = decideKeywordPrefix('그 제습기 전기세', '제습기 전기세 정리');
    expect(d.totalTokens).toBe(2);   // '그' 제외
    expect(d.shouldPrefix).toBe(false);
  });

  it('따옴표·구두점 차이는 흡수한다', () => {
    expect(decideKeywordPrefix('전현무 논란', "'전현무' 논란, 정리").shouldPrefix).toBe(false);
  });

  it('빈 입력에 터지지 않는다', () => {
    expect(decideKeywordPrefix('', '제목').reason).toBe('empty');
    expect(decideKeywordPrefix('키워드', '').reason).toBe('empty');
  });
});

describe('배선', () => {
  const src = readFileSync(new URL('../renderer/modules/contentGeneration.ts', import.meta.url), 'utf8');

  it('앞배치 직전에 판정을 부른다', () => {
    expect(src).toMatch(/import \{ decideKeywordPrefix \}/);
    const decisionAt = src.indexOf('const prefixDecision = decideKeywordPrefix(');
    const prefixAt = src.indexOf('structuredContent.selectedTitle = `${keyword} ${cleaned}`');
    expect(decisionAt).toBeGreaterThan(-1);
    expect(decisionAt).toBeLessThan(prefixAt);
  });

  it('건너뛴 이유를 로그로 남긴다', () => {
    expect(src).toMatch(/키워드 앞배치 건너뜀/);
    expect(src).toMatch(/토큰 이미 포함/);
  });
});
