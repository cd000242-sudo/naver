/**
 * keywordPlacementEnforce.test.ts
 *
 * 키워드 배치 helper의 하위 호환성과 실제 생성 경로의 비강제 정책을 함께 검증한다.
 * (1) 제목 앞3자: "토큰이 어디든 있으면 스킵" 조기탈출이 앞3자 요건을 뚫던 구멍을
 *     ensureFront3 옵션이 닫는다(SEO 모드). 기존(옵션 없음) 동작은 불변 잠금.
 * (2) 서론 첫100자·결론: 키워드 미배치 시 콤마 리드인 강제 + 멱등성.
 * (3) finalize 배선(SEO 게이트) 소스 잠금.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { applyKeywordPrefixToTitle, applyKeywordPrefixToStructuredContent } from '../contentKeywordPrefix';
import { enforceIntroConclusionKeyword } from '../content/keywordPlacementEnforcer';

describe('제목 앞3자 강제 (ensureFront3)', () => {
  it('[버그 케이스] 토큰이 흩어져 있고 선두가 아니면 — 기존은 스킵, ensureFront3는 선두로 재배치', () => {
    const title = '바꿨더니 효과 본 다이어트 식단';
    // 기존 동작(옵션 없음): 토큰 전부 존재 → 스킵(불변) — 회귀 잠금
    expect(applyKeywordPrefixToTitle(title, '다이어트 식단')).toBe(title);
    // ensureFront3: 선두 배치 강제
    const forced = applyKeywordPrefixToTitle(title, '다이어트 식단', { ensureFront3: true });
    expect(forced.toLowerCase().startsWith('다이어트 식단')).toBe(true);
  });

  it('키워드 정확 구절이 제목 중간에 있으면 선두로 이동(중복 없이)', () => {
    const forced = applyKeywordPrefixToTitle('올여름 전기세 절약 꿀팁 총정리', '전기세 절약', { ensureFront3: true });
    expect(forced.toLowerCase().startsWith('전기세 절약')).toBe(true);
    // split-join 재배치라 원 위치의 구절은 제거됨 → 정확 구절 1회만
    expect(forced.split('전기세 절약').length - 1).toBe(1);
  });

  it('이미 키워드로 시작하는 제목은 무변경 (멱등)', () => {
    const title = '다이어트 식단 바꿨더니 생긴 변화 3가지';
    expect(applyKeywordPrefixToTitle(title, '다이어트 식단', { ensureFront3: true })).toBe(title);
  });

  it('manualTitleLocked(사용자 지정 제목)는 건드리지 않는다', () => {
    const content: any = { selectedTitle: '내가 정한 제목 그대로', manualTitleLocked: true };
    applyKeywordPrefixToStructuredContent(content, '다이어트 식단', { ensureFront3: true });
    expect(content.selectedTitle).toBe('내가 정한 제목 그대로');
  });
});

describe('서론/결론 키워드 강제 (콤마 리드인)', () => {
  it('서론 첫 100자에 키워드 없으면 리드인 주입, 있으면 무변경(멱등)', () => {
    const content = {
      introduction: '요즘 부쩍 피곤하다는 분들이 많습니다. 오늘은 그 해결책을 정리했어요.',
      conclusion: '오늘 정리한 다이어트 식단이 도움이 되셨길 바랍니다.',
    };
    const r1 = enforceIntroConclusionKeyword(content, '다이어트 식단');
    expect(r1.introPatched).toBe(true);
    expect(content.introduction.startsWith('다이어트 식단, ')).toBe(true);
    expect(r1.conclusionPatched).toBe(false); // 결론엔 이미 있음
    // 멱등: 재실행해도 이중 주입 없음
    const r2 = enforceIntroConclusionKeyword(content, '다이어트 식단');
    expect(r2.introPatched).toBe(false);
    expect(content.introduction.split('다이어트 식단, ').length - 1).toBe(1);
  });

  it('결론에 키워드 없으면 리드인 주입', () => {
    const content = { introduction: '다이어트 식단 이야기입니다.', conclusion: '읽어주셔서 감사합니다.' };
    const r = enforceIntroConclusionKeyword(content, '다이어트 식단');
    expect(r.conclusionPatched).toBe(true);
    expect(content.conclusion.startsWith('다이어트 식단, ')).toBe(true);
  });

  it('빈 서론/결론·빈 키워드는 무변경', () => {
    const empty = { introduction: '', conclusion: '' };
    const r = enforceIntroConclusionKeyword(empty, '다이어트 식단');
    expect(r.introPatched).toBe(false);
    expect(r.conclusionPatched).toBe(false);
    const c2 = { introduction: '본문', conclusion: '결론' };
    expect(enforceIntroConclusionKeyword(c2, '').introPatched).toBe(false);
  });
});

describe('finalize 배선 잠금 (의도 우선 SEO)', () => {
  it('contentGenerator는 제목·서론·결론에 키워드를 강제 재배치하지 않는다', () => {
    const src = readFileSync(join(__dirname, '..', 'contentGenerator.ts'), 'utf8');
    expect(src).not.toContain('ensureFront3: _isSeoModeForKw');
    expect(src).not.toContain('enforceIntroConclusionKeyword(finalContent, primaryKeyword)');
    expect(src).toContain('applyKeywordPrefixToStructuredContent(finalContent, primaryKeyword);');
  });
});
