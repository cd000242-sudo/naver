/**
 * Homefeed exposure guidance shared by every engine and publishing flow.
 * These tests keep the guidance evidence-first and prevent fixed viral templates.
 */

import { describe, expect, it } from 'vitest';

import { buildHomefeedExposureSkeleton } from '../content/homefeedExposurePattern';

describe('buildHomefeedExposureSkeleton', () => {
  const block = buildHomefeedExposureSkeleton();

  it('keeps the opening useful without forcing a fixed viral structure', () => {
    expect(block).toContain('구체 상황과 핵심 답');
    expect(block).toContain('주체를 생략했다면');
    expect(block).toContain('2~3문장');
    expect(block).toContain('서로 다른 정보 단위');
    expect(block).toContain('필요 없으면 넣지 않는다');
    expect(block).not.toContain('도입 4단 구성');
  });

  it('keeps the selected voice without quota-driven interjections', () => {
    expect(block).toContain('어미·문체는 유지');
    expect(block).toContain('표현 개수보다 문맥과 자연스러움');
    expect(block).not.toContain('3회 이하');
  });

  it('forbids unsupported facts and experience', () => {
    expect(block).toContain('날조');
    expect(block).toContain('입력 자료와 정확히 일치');
  });

  it('exposes the marker that buildFullPrompt gates on for homefeed', () => {
    expect(block).toContain('홈판 상위노출 본문 원칙');
  });

  /**
   * 실측 반영 (2026-08-12, 홈판 노출 글 40편).
   *   문단당 중앙 36자·평균 47자 — 옛 규칙 "1~3문장"은 실제의 두 배 길이를 허용했다.
   *   문단 종결은 명사형 42% > 구두점 38% — 완결 서술문만 허용하면 보고서처럼 읽힌다.
   * 리듬만 가져오고 소재·제목 전략(주체 은닉 48%, 사생활 소재 23%)은 가져오지 않는다.
   */
  it('짧은 문단 실측값을 담고 옛 상한으로 되돌아가지 않는다', () => {
    // [2026-09-02 사장님 결정] 실측(35~50자·1~2문장)은 참고였고 기본값은 2~3문장(화면 2~3줄)이다.
    //   4편이 전부 문장 하나 = 문단 하나로 나와 "차라리 2~3줄이 낫지 않나" 하셨고, 오늘 결정으로 확정.
    expect(block).toContain('2~3문장');
    expect(block).toContain('잘게 끊지 않는다');
    expect(block).not.toContain('1~2문장이다');
    expect(block).not.toContain('1~3문장');
  });

  it('명사형 문단 종결을 허용하되 정보 회피 수단이 되지 않게 막는다', () => {
    expect(block).toContain('명사형');
    expect(block).toContain('나열이 되지 않게');
  });
});
