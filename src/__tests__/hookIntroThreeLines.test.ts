import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import {
  HOOK_INTRO_MAX_LINE_CHARS,
  HOOK_INTRO_MAX_LINES,
  normalizeHookIntroLines,
} from '../contentHookIntroPolicy';
import { buildFullPrompt } from '../promptLoader';
import {
  buildContentQualityV3Prompt,
  createContentQualityV3InitialPromptOptions,
} from '../contentQualityV3/prompt';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-25] 후킹 도입부 3줄 지정 (사용자 요청: "홈판모드 후킹 도입부는 3줄을
 * 정할수있게해줘").
 *
 * 계약: 1줄 = 기존 "자연스럽게 녹임" 유지, 2~3줄 = 도입부를 그 줄들로 순서대로
 * 구성. legacy(buildFullPrompt)와 V3(user_brief.hookIntroLines) 양쪽 주입 +
 * 키워드 생성 플로우에서 입력이 조용히 무시되던 전달 갭도 함께 잠근다.
 */
describe('hook intro up to three lines', () => {
  it('normalizes lines: trim, per-line cap, max 3 lines, CRLF tolerated', () => {
    expect(normalizeHookIntroLines('한 줄')).toEqual(['한 줄']);
    expect(normalizeHookIntroLines('1줄\n2줄\n3줄')).toEqual(['1줄', '2줄', '3줄']);
    expect(normalizeHookIntroLines('1줄\r\n2줄')).toEqual(['1줄', '2줄']);
    expect(normalizeHookIntroLines('a\nb\nc\nd\ne')).toEqual(['a', 'b', 'c']);
    expect(normalizeHookIntroLines('  \n\t \n')).toEqual([]);
    expect(normalizeHookIntroLines(undefined)).toEqual([]);
    // [2026-08-04] 줄당 40자 스타일 제한 폐지 (사용자: "도입부를 미리 정할 수
    // 있는 게 메리트") — 사용자가 쓴 문장은 그대로 보존한다. 남은 건 폭주 입력
    // 방어용 하드캡뿐이다.
    const long = 'A'.repeat(80);
    expect(normalizeHookIntroLines(long)).toEqual([long]);
    expect(HOOK_INTRO_MAX_LINE_CHARS).toBeGreaterThanOrEqual(500);
    const runaway = 'B'.repeat(HOOK_INTRO_MAX_LINE_CHARS + 100);
    expect(normalizeHookIntroLines(runaway)).toEqual(['B'.repeat(HOOK_INTRO_MAX_LINE_CHARS)]);
    expect(HOOK_INTRO_MAX_LINES).toBe(3);
  });

  it('legacy prompt: 3 lines produce an ordered intro-pinning block', () => {
    const prompt = buildFullPrompt(
      'homefeed', 'it', false, 'friendly', undefined,
      '전기요금 고지서 보고 손이 떨렸어요\n450kWh가 뭐길래 싶었죠\n기준만 알면 피할 수 있습니다',
    );
    expect(prompt).toContain('[사용자 후킹 도입부');
    expect(prompt).toContain('1) 전기요금 고지서 보고 손이 떨렸어요');
    expect(prompt).toContain('2) 450kWh가 뭐길래 싶었죠');
    expect(prompt).toContain('3) 기준만 알면 피할 수 있습니다');
    expect(prompt).toContain('같은 순서');
    // 다줄 입력 시 1문장 블록으로 오인 주입 금지
    expect(prompt).not.toContain('[사용자 후킹 1문장');
  });

  it('legacy prompt: a single line keeps the original weave-in contract', () => {
    const prompt = buildFullPrompt(
      'homefeed', 'it', false, 'friendly', undefined, '3주 써보니 아이 코막힘이 사라졌어요',
    );
    expect(prompt).toContain('[사용자 후킹 1문장');
    expect(prompt).not.toContain('[사용자 후킹 도입부');
  });

  it('V3 prompt: hookHint lines land in user_brief.hookIntroLines', () => {
    const source = Object.freeze({
      contentMode: 'homefeed',
      rawText: '고정된 평가 근거 텍스트',
      metadata: Object.freeze({ keywords: Object.freeze(['전기요금 폭탄']) }),
      hookHint: '첫줄 후킹입니다\n둘째줄 상황입니다\n셋째줄 유도입니다',
    });
    const prompt = buildContentQualityV3Prompt(createContentQualityV3InitialPromptOptions({
      mode: 'homefeed',
      source,
      minChars: 2_500,
    }));
    expect(prompt).toMatch(/"hookIntroLines"\s*:/);
    expect(prompt).toContain('첫줄 후킹입니다');
    expect(prompt).toContain('둘째줄 상황입니다');
    expect(prompt).toContain('셋째줄 유도입니다');
    // OUTPUT_CONTRACT 규칙이 순서 보존을 지시한다
    expect(prompt).toContain('hookIntroLines가 있으면 introduction은 그 줄들을 같은 순서로');
  });

  it('V3 prompt: no hookHint → no hookIntroLines key in user_brief', () => {
    const source = Object.freeze({
      contentMode: 'homefeed',
      rawText: '고정된 평가 근거 텍스트',
      metadata: Object.freeze({ keywords: Object.freeze(['전기요금 폭탄']) }),
    });
    const prompt = buildContentQualityV3Prompt(createContentQualityV3InitialPromptOptions({
      mode: 'homefeed',
      source,
      minChars: 2_500,
    }));
    expect(prompt).not.toMatch(/"hookIntroLines"\s*:/);
  });

  it('renderer wires the hook field into BOTH url and keyword flows (gap fix)', () => {
    const renderer = read('renderer/modules/contentGeneration.ts');
    const reads = renderer.match(/unified-hook-sentence/g) || [];
    expect(reads.length).toBeGreaterThanOrEqual(2);
    // 키워드 플로우 payload에 hookHint가 실린다
    expect(renderer).toMatch(/keywordForTitle:[\s\S]{0,400}hookHint:/);
  });

  it('UI field is a 3-row textarea with the widened cap', () => {
    const html = read('../public/index.html');
    // [2026-08-04] 줄당 40자 제한 폐지 — maxlength는 폭주 방어용 1500만 남김.
    expect(html).toContain('<textarea id="unified-hook-sentence" rows="3" maxlength="1500"');
    expect(html).not.toContain('<input type="text" id="unified-hook-sentence"');
  });
});
