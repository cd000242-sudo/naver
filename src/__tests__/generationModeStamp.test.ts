import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  describeGenerationModeMismatch,
  stampGenerationMode,
  readGenerationMode,
} from '../content/generationModeStamp';

/**
 * [2026-08-26] 글은 자기가 어느 모드로 만들어졌는지 기억하지 못했다.
 *
 * 발행 시점의 해시태그 상한·제목 계약은 전부 runOptions.contentMode 를 본다 —
 * 그건 "지금 화면에 골라져 있는 모드"이지 "이 글을 만든 모드"가 아니다.
 * 홈판으로 뽑은 글(태그 3~7개)을 SEO(10~15개) 상태에서 불러와 발행하면
 * 상한이 조용히 어긋난다. 모드 상한이 생기기 전에는 드러나지 않던 구멍이다.
 *
 * 각인하고 어긋나면 알린다. 막지는 않는다 — 사장님이 일부러 바꿔 발행할 수 있다.
 */
describe('생성 모드 각인', () => {
  it('만들어진 모드를 글에 남긴다', () => {
    const content: any = { selectedTitle: '제목' };
    stampGenerationMode(content, 'homefeed');
    expect(readGenerationMode(content)).toBe('homefeed');
  });

  it('모드를 모르면 각인하지 않는다 — 없는 사실을 만들지 않는다', () => {
    const content: any = { selectedTitle: '제목' };
    stampGenerationMode(content, undefined);
    expect(readGenerationMode(content)).toBeUndefined();
  });

  it('이미 각인된 값을 덮어쓰지 않는다', () => {
    const content: any = {};
    stampGenerationMode(content, 'homefeed');
    stampGenerationMode(content, 'seo');
    expect(readGenerationMode(content)).toBe('homefeed');
  });

  it('어떤 입력에도 던지지 않는다', () => {
    expect(() => stampGenerationMode(null as never, 'seo')).not.toThrow();
    expect(() => readGenerationMode(undefined as never)).not.toThrow();
  });
});

describe('발행 모드 불일치 알림', () => {
  it('같으면 조용하다', () => {
    expect(describeGenerationModeMismatch('homefeed', 'homefeed')).toBe('');
  });

  it('한쪽을 모르면 조용하다 — 추측으로 경고하지 않는다', () => {
    expect(describeGenerationModeMismatch(undefined, 'seo')).toBe('');
    expect(describeGenerationModeMismatch('seo', undefined)).toBe('');
  });

  it('다르면 두 모드를 모두 이름으로 알린다', () => {
    const msg = describeGenerationModeMismatch('homefeed', 'seo');
    expect(msg).toContain('홈판');
    expect(msg).toContain('SEO');
  });
});

describe('본선 배선', () => {
  it('생성 최종본에 각인한다', () => {
    const source = readFileSync(resolve(__dirname, '../contentGenerator.ts'), 'utf-8');
    expect(source).toMatch(/stampGenerationMode\(/);
  });

  it('발행 옵션 해석이 불일치를 알린다', () => {
    const source = readFileSync(resolve(__dirname, '../automation/runOptionsPolicy.ts'), 'utf-8');
    expect(source).toMatch(/describeGenerationModeMismatch\(/);
    // 경고만 — 던지면 발행이 막힌다.
    expect(source).not.toMatch(/throw new Error\([^)]*모드/);
  });
});
