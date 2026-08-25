/**
 * [2026-08-26] SEO 브리핑 골격 — 사장님 실제 검색 유입 글 4편에서 추출한 형태.
 *
 * 그 글들은 앱이 아니라 LLM 챗봇으로 쓴 것인데 공통 골격이 뚜렷했다.
 *   글 맨 앞 사실 요약 표 → 날짜 앵커 도입부 → 전개 순서 소제목(인용 활용)
 *   → 중간 구조 표 → 시사점 마무리. 그리고 FAQ 가 하나도 없었다.
 *
 * 우리 SEO 는 정반대였다 — 요약 표를 강제하지 않고, ES-3 으로 FAQ 3~6개를 강제했다.
 * 근거가 이슈형(연예·시사)에서 나왔으므로 같은 카테고리에만 먼저 건다. 절차·비용
 * 글까지 넓히는 것은 효과를 실측한 뒤 결정한다.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildSystemPrompt } from '../promptLoader';

const ROOT = path.resolve(__dirname, '..');

describe('issue-brief 골격 파일', () => {
  const prompt = fs.readFileSync(path.join(ROOT, 'prompts/shared/issue-brief-structure.prompt'), 'utf-8');

  it('실측 4편의 골격 다섯 요소를 담는다', () => {
    expect(prompt).toContain('[IB-1]');
    expect(prompt).toContain('사실 요약 표');
    expect(prompt).toContain('[IB-2]');
    expect(prompt).toContain('날짜 앵커');
    expect(prompt).toContain('[IB-3]');
    expect(prompt).toContain('발단 → 전개 → 반박·쟁점 → 현재·전망');
    expect(prompt).toContain('[IB-4]');
    expect(prompt).toContain('[IB-5]');
    expect(prompt).toContain('시사점');
  });

  it('요약 표의 형식을 예시로 못박는다 (모델이 형태를 흉내낼 수 있게)', () => {
    expect(prompt).toContain('| 구분 | 내용 |');
    expect(prompt).toContain('| --- | --- |');
    expect(prompt).toContain('기준일');
  });

  it('FAQ 를 이 골격에서 제외하고 그 근거를 남긴다', () => {
    expect(prompt).toContain('[IB-6]');
    expect(prompt).toContain('FAQ 섹션이 하나도 없다');
    expect(prompt).toContain('ES-3');
  });

  it('형태를 채우려고 사실을 만들지 말라고 못박는다', () => {
    expect(prompt).toContain('확인되지 않은 칸은 만들지 않는다');
    expect(prompt).toContain('형태보다 사실이 먼저다');
  });

  it('ES 와 충돌하면 이 절이 우선한다고 명시한다', () => {
    expect(prompt).toMatch(/exposure-structure\(ES\).*이 절이 우선/s);
  });
});

describe('배선 — 이슈형 SEO 에만 얹는다', () => {
  it('연예·시사 SEO 에는 브리핑 골격이 실린다', () => {
    for (const hint of ['entertainment', 'society']) {
      const prompt = buildSystemPrompt('seo', hint);
      expect(prompt, hint).toContain('[IB-1]');
      expect(prompt, hint).toContain('| 구분 | 내용 |');
    }
  });

  it('실용 카테고리 SEO 에는 얹지 않는다 (근거 범위 밖)', () => {
    for (const hint of ['tips', 'health', 'travel', 'general']) {
      expect(buildSystemPrompt('seo', hint), hint).not.toContain('[IB-1]');
    }
  });

  it('홈판에는 얹지 않는다 (홈판은 issue-story 골격이 따로 있다)', () => {
    const prompt = buildSystemPrompt('homefeed', 'entertainment');
    expect(prompt).not.toContain('[IB-1]');
    expect(prompt).toContain('[ISSUE-STORY]'); // 홈판은 자기 골격 유지
  });

  it('소제목 스펙 뒤에 와서 전개 순서 규칙이 마지막 말을 갖는다', () => {
    const prompt = buildSystemPrompt('seo', 'entertainment');
    const headingSpecAt = prompt.indexOf('[HEADINGS: SEO]');
    const briefAt = prompt.indexOf('[IB-3]');
    expect(headingSpecAt).toBeGreaterThan(-1);
    expect(briefAt).toBeGreaterThan(headingSpecAt);
  });

  it('FAQ 를 강제하던 ES-3 보다 뒤에 온다 (IB-6 가 이겨야 한다)', () => {
    const prompt = buildSystemPrompt('seo', 'entertainment');
    expect(prompt.indexOf('[IB-6]')).toBeGreaterThan(prompt.indexOf('[ES-3]'));
  });
});
