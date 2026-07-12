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
    expect(block).toContain('1~3문장');
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
});
