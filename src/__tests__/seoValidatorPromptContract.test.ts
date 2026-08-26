import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * [2026-08-26 하네스 충돌 정리]
 * 검증기가 프롬프트 계약과 반대되는 것을 권하던 문제를 잠근다.
 * 프롬프트가 "맞추지 마라"고 한 축을 검증기가 "맞춰라"고 경고하면,
 * 로그를 읽는 사람이 정상 동작을 문제로 오판하고 없는 버그를 쫓게 된다.
 */
const root = join(__dirname, '..');
const validator = readFileSync(join(root, 'contentSeoValidator.ts'), 'utf-8');
const seoBase = readFileSync(join(root, 'prompts', 'seo', 'base.prompt'), 'utf-8');

describe('SeoValidator ↔ 프롬프트 계약', () => {
  it('seo/base R0-6은 여전히 키워드 밀도 맞추기를 금지한다', () => {
    expect(seoBase).toMatch(/키워드 횟수와 밀도를 맞추지 않는다/);
  });

  it('검증기는 키워드 밀도 하한을 권하지 않는다 (R0-6 위반)', () => {
    expect(validator).not.toMatch(/SEO 권장 1\.5~3%/);
    expect(validator).not.toMatch(/density < 1\.0/);
  });

  it('검증기는 소제목 개수를 독자적으로 고정하지 않는다', () => {
    expect(validator).not.toMatch(/SEO 권장: 5~7개/);
    expect(validator).toMatch(/resolveHeadingCountRange/);
  });

  it('검증기는 질문형 소제목이 0개라고 경고하지 않는다', () => {
    expect(validator).not.toMatch(/질문형 소제목 0개/);
    expect(validator).not.toMatch(/1개\+ 권장/);
  });

  it('검증기는 분량 하한으로 경고하지 않는다 (글자수보다 내용)', () => {
    expect(validator).not.toMatch(/C-Rank 권장 2500자/);
  });
});
