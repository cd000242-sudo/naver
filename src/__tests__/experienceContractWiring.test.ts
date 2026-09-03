import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-08-31] 경험 계약 배선.
 *
 * human-writing-anti-pattern.prompt:35 는 체험 문장을 "작성자 메모에 있을 때만 쓴다" 고
 * 걸어뒀는데, 코드베이스 어디에도 작성자 메모를 입력할 UI 경로가 없다.
 * 그래서 체험 문장은 사실상 영구 차단 상태였다.
 *
 * 사장님 요청은 그 문을 여는 것이다.
 *   "리빙이나 후기 같은 경험이 필요한 글은 AI 로 경험을 생성해도 사용자가 책임지게끔
 *    하면 안 되니? 사용자마저 경험이 없다면 어중이떠중이 글이 되는 것보다는 낫다고 보는데."
 *
 * 다만 조건이 붙는다.
 *   "말도 안 되는 경험 말고 공감이 가는 경험 (…) 과한 과장은 티가 나고
 *    누가 봐도 AI 가 적었구나라고 티가 확실히 나. 네이버 봇도 그걸 알 테고."
 *
 * 그래서 문을 열되 3요소 계약(제약 · 유보 · 비교)을 같이 건다.
 * 기본은 OFF 다 — 켜는 것은 사장님 판단이고, 켠 뒤의 책임도 사용자에게 있다.
 */
const root = (...parts: string[]) => resolve(__dirname, '..', ...parts);
const read = (...parts: string[]) => readFileSync(root(...parts), 'utf-8');

describe('경험 계약 프롬프트', () => {
  const prompt = read('prompts', 'shared', 'experience-contract.prompt');

  it('세 요소를 모두 이름과 예시로 가르친다', () => {
    expect(prompt).toContain('제약');
    expect(prompt).toContain('유보');
    expect(prompt).toContain('비교');
    expect(prompt).toContain('내성발톱');
  });

  it('검증 가능한 사실은 경험으로 지어내지 못하게 막는다', () => {
    expect(prompt).toMatch(/가격/);
    expect(prompt).toMatch(/의료|효능/);
    expect(prompt).toMatch(/실존\s*인물/);
  });

  it('분량 상한을 명시한다 — 많을수록 지어낸 티가 난다', () => {
    expect(prompt).toMatch(/최대\s*6개/);
  });
});

describe('요청 단위 옵션 — 전역 설정이 아니다', () => {
  const generator = read('contentGenerator.ts');
  const renderer = read('renderer', 'modules', 'contentGeneration.ts');

  /*
   * 처음에는 설정 모달에 전역 토글로 넣었는데, 사장님 지적으로 옮겼다.
   *   "글 생성이나 발행 옵션에 경험 생성을 넣어야 되는 거 아니니?"
   * 맞다. 리빙 글에는 필요하고 정보 글에는 아니다 — 글마다 갈리는 판단이라
   * 매번 설정 창을 열게 만들면 안 된다. personalExperience 와 같은 자리로 옮긴다.
   */
  it('ContentSource 에 실려 요청마다 전달된다', () => {
    expect(generator).toMatch(/aiExperienceGeneration\?\s*:\s*boolean/);
  });

  it('렌더러가 생성 옵션에서 값을 읽어 넘긴다', () => {
    expect(renderer).toMatch(/ai-experience-generation/);
  });
});

describe('프롬프트 주입', () => {
  const generator = read('contentGenerator.ts');

  it('기본 OFF 다 — 명시적으로 켰을 때만 붙는다', () => {
    // geoOptimization 은 `!== false` (기본 ON) 인데, 경험 생성은 반대다.
    expect(generator).toMatch(/source\.aiExperienceGeneration\s*===\s*true/);
  });

  it('실존 인물이 오가는 홈피드·이슈 모드에는 붙이지 않는다', () => {
    const block = generator.slice(generator.indexOf('experience-contract'));
    const guard = block.slice(0, 1200);
    expect(guard).not.toMatch(/contentMode\s*===\s*'homefeed'/);
  });
});

describe('감사 로그', () => {
  it('계약 위반을 경고로 알린다 — 발행을 막지는 않는다', () => {
    const generator = read('contentGenerator.ts');
    expect(generator).toMatch(/auditExperienceSentences|describeExperienceAudit/);
  });
});

describe('UI 배선 — 토글이 화면에 있고, 저장되고, 다시 읽힌다', () => {
  const html = readFileSync(resolve(__dirname, '..', '..', 'public', 'index.html'), 'utf-8');


  // [2026-09-03 사장님] 기본 켬 — "왜 3인칭이냐"는 물음의 절반은 이 체크가 꺼져 있어서였다. 끄는 건 여전히 사용자 몫.
  it('체크박스가 존재하고 기본은 켜져 있다', () => {
    const tag = html.match(/<input[^>]*id="ai-experience-generation"[^>]*>/u)?.[0] ?? '';
    expect(tag).toBeTruthy();
    expect(tag).toContain('checked');
  });

  it('책임 소재를 화면에 밝힌다 — 켜는 것이 곧 동의다', () => {
    expect(html).toMatch(/생성된 경험의 사실 여부는 작성자 책임/);
  });

  it('세 요소를 화면에서도 설명한다', () => {
    expect(html).toMatch(/제약 · 유보 · 비교/);
  });

  it('경험 메모 바로 아래에 있다 — 메모가 비었을 때의 대안이라는 뜻이 자리로 드러난다', () => {
    const memoAt = html.indexOf('unified-personal-experience');
    const toggleAt = html.indexOf('ai-experience-generation');
    expect(memoAt).toBeGreaterThan(0);
    expect(toggleAt).toBeGreaterThan(memoAt);
    // 사이에 다른 입력 블록이 끼지 않는다.
    expect(html.slice(memoAt, toggleAt)).not.toMatch(/unified-realtime-crawl|keyword-as-title/);
  });
});

describe('메모가 있으면 AI 경험 생성은 물러난다', () => {
  const main = readFileSync(resolve(__dirname, '..', 'main.ts'), 'utf-8');

  /*
   * 두 기능이 겹치면 안 된다. 작성자가 실제 경험을 적었으면 그 범위 안에서 1인칭을 쓰므로
   * 지어낼 이유가 없다. AI 생성은 "메모가 비었을 때의 대안" 이라는 자리에만 있어야 한다.
   */
  it('메모가 비었을 때만 켜진다', () => {
    expect(main).toMatch(/aiExperienceGeneration\s*&&\s*!personalExperience/);
  });

  it('메모가 있으면 무시했다고 로그로 알린다 — 조용히 삼키지 않는다', () => {
    expect(main).toMatch(/AI 경험 생성 무시/);
  });
});
