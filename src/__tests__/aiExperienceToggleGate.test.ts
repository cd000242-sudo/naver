import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AI_EXPERIENCE_ELIGIBLE_MODES,
  describeAiExperienceBlock,
  isAiExperienceEligibleMode,
} from '../renderer/modules/aiExperienceToggleGate.js';

/**
 * [2026-09-02] 체크해도 아무 일도 안 하는 체크박스.
 *
 * 사장님 지적: "체크해도 안 되는거 왜 활성화시켜놓니".
 * 홈피드·이슈·업체 모드에서 AI 경험 생성 체크박스는 클릭이 됐지만
 * contentGenerator 가 오버레이를 붙이지 않았다. 그런데 main.ts 는
 * 그때도 "AI 경험 생성 ON — 제약·유보·비교 3요소 계약 적용" 을 찍었다.
 * 사장님은 켰다고 믿고, 로그도 켰다고 하고, 글에는 안 들어갔다.
 *
 * 이 파일은 UI 게이트와 생성기 게이트가 갈라지지 않게 둘을 함께 잠근다.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) =>
  readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

describe('UI 게이트와 생성기 게이트가 같은 목록을 본다', () => {
  it('생성기가 오버레이를 붙이는 모드와 UI가 허용하는 모드가 일치한다', () => {
    const generator = read('contentGenerator.ts');
    const line = generator
      .split('\n')
      .find((l) => l.includes('const experienceEligibleMode ='));
    expect(line, 'experienceEligibleMode 선언을 찾지 못했다 — 이름이 바뀌었으면 이 테스트도 고쳐야 한다').toBeTruthy();

    const modesInGenerator = [...(line as string).matchAll(/contentMode === '([a-z]+)'/gu)].map((m) => m[1]);
    expect(modesInGenerator.length).toBeGreaterThan(0);
    expect([...modesInGenerator].sort()).toEqual([...AI_EXPERIENCE_ELIGIBLE_MODES].sort());
  });
});

describe('모드 판정', () => {
  it.each([['seo'], ['affiliate'], ['mate'], ['custom']])('%s 는 적용 대상이다', (mode) => {
    expect(isAiExperienceEligibleMode(mode)).toBe(true);
  });

  it.each([['homefeed'], ['issue'], ['business']])('%s 는 적용 대상이 아니다', (mode) => {
    expect(isAiExperienceEligibleMode(mode)).toBe(false);
  });

  it('빈 값·공백·undefined 는 적용 대상이 아니다', () => {
    expect(isAiExperienceEligibleMode('')).toBe(false);
    expect(isAiExperienceEligibleMode('   ')).toBe(false);
    expect(isAiExperienceEligibleMode(undefined)).toBe(false);
  });

  it('차단 모드는 왜 막혔는지 이유를 준다 — 빈 회색 상자만 두지 않는다', () => {
    expect(describeAiExperienceBlock('homefeed')).toContain('실존 인물');
    expect(describeAiExperienceBlock('business')).toContain('사내 사실');
    expect(describeAiExperienceBlock('알수없음')).toBeTruthy();
  });
});

describe('배선: 렌더러가 모드 전환과 초기화 양쪽에서 동기화한다', () => {
  const renderer = read('renderer/renderer.ts');

  it('모듈을 임포트한다', () => {
    expect(renderer).toMatch(/import \{ syncAiExperienceToggleForMode \} from '\.\/modules\/aiExperienceToggleGate\.js'/u);
  });

  it('모드 버튼을 누를 때 동기화한다', () => {
    expect(renderer).toMatch(/syncAiExperienceToggleForMode\(mode\)/u);
  });

  it('첫 화면에서도 동기화한다 — 기본 모드가 차단 모드일 수 있다', () => {
    expect(renderer).toMatch(/syncAiExperienceToggleForMode\(initialMode\)/u);
  });

  it('인라인 번들 목록에 등록돼 있다 — 빠지면 런타임에만 터진다', () => {
    const copyStatic = readFileSync(resolve(ROOT, '..', 'scripts', 'copy-static.mjs'), 'utf-8');
    expect(copyStatic).toContain("'aiExperienceToggleGate.js'");
  });

  it('사유를 띄울 자리가 HTML에 있다', () => {
    const html = readFileSync(resolve(ROOT, '..', 'public', 'index.html'), 'utf-8');
    expect(html).toContain('id="ai-experience-mode-note"');
  });
});
