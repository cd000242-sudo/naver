/**
 * Homefeed exposure guidance shared by every engine and publishing flow.
 * These tests keep the guidance evidence-first and prevent fixed viral templates.
 */

import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildHomefeedExposureSkeleton } from '../content/homefeedExposurePattern';

// [2026-09-22 P1 홈판 병합] 이 블록이 되풀이하던 첫 화면·주체 공개·팩트·CTA 규칙은 homefeed base 의
//   [GAMMA-7]/[TITLE]/[SECTION -2]/[RETENTION] 정본으로 옮겼다. 단언은 "문구가 이 블록에 있다"가 아니라
//   "규칙이 정본에 1회 존재하고 이 블록은 되풀이하지 않는다"로 바꿨다(semantic assertion).
const homefeedBase = readFileSync(resolve(__dirname, '../prompts/homefeed/base.prompt'), 'utf8');
const section = (name: string): string => {
  const start = homefeedBase.indexOf(name);
  const next = homefeedBase.indexOf('\n[', start + 1);
  return homefeedBase.slice(start, next < 0 ? undefined : next);
};

describe('buildHomefeedExposureSkeleton', () => {
  const block = buildHomefeedExposureSkeleton();

  it('keeps the opening useful without forcing a fixed viral structure (canonical rules live in base)', () => {
    expect(section('[GAMMA-7]')).toContain('독자가 실제로 겪는 상황');
    expect(section('[TITLE]')).toContain('도입 3~5줄 안에 주체를 공개한다');
    expect(block).toContain('2~3문장');
    expect(block).toContain('서로 다른 정보 단위');
    expect(section('[RETENTION]')).toContain('행동 유도가 필요 없는 글은');
    expect(block).not.toContain('도입 4단 구성');
    // 정본으로 옮긴 규칙을 이 블록이 다시 말하지 않는다
    expect(block).not.toContain('구체 상황과 핵심 답을 함께 보여준다');
    expect(block).not.toContain('주체를 생략했다면');
  });

  it('keeps the selected voice without quota-driven interjections', () => {
    expect(block).toContain('어미·문체는 유지');
    expect(block).toContain('표현 개수보다 문맥과 자연스러움');
    expect(block).not.toContain('3회 이하');
  });

  it('forbids unsupported facts and experience (canonical: base [SECTION -2] / [TITLE])', () => {
    expect(section('[SECTION -2]')).toContain('입력 원문, 사용자 메모, 확인된 검색 자료에 없는 숫자');
    expect(section('[TITLE]')).toContain('입력 근거가 있을 때만 제목에 쓴다');
    expect(block).not.toContain('날조');
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
