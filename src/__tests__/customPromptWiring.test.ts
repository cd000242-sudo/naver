import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-08 사용자 실측] "개인프롬프트 사용 체크하고 프롬프트를 넣었는데 적용이 안 된다."
 *
 * UI(체크박스 · 모달 · 모드별 localStorage)는 정상이었고, 값을 payload 에 싣는 뒷단이
 * 세 곳에서 끊겨 있었다.
 *   1) URL 경로(generateContentFromUrl)의 assembly 에 customPrompt 필드 자체가 없었다.
 *   2) renderer.ts 의 URL 생성이 #unified-custom-prompt 만 읽었다 — 그 textarea 는
 *      #custom-prompt-section(항상 display:none) 안에 있고 값을 쓰는 코드가 없는 죽은 입력이다.
 *   3) 다중계정·연속발행이 주입/전달을 custom 모드로 잠가, 다른 모드의 값은 버려졌다.
 */

describe('개인 프롬프트 — 생성 경로 배선', () => {
  const contentGeneration = read('renderer/modules/contentGeneration.ts');

  it('UI 를 읽는 창구가 하나로 모여 있다', () => {
    expect(contentGeneration).toMatch(/function readCustomPromptFromUi\(\): string \| undefined/);
    // hidden #custom-prompt-input 이 우선, 구버전 폴백이 그다음.
    const helper = contentGeneration.slice(
      contentGeneration.indexOf('function readCustomPromptFromUi'),
      contentGeneration.indexOf('function cleanKeywordFromTitle'),
    );
    expect(helper.indexOf("'custom-prompt-input'")).toBeGreaterThan(-1);
    expect(helper.indexOf("'custom-prompt-input'"))
      .toBeLessThan(helper.indexOf("'unified-custom-prompt'"));
  });

  it('URL 경로와 키워드 경로가 모두 customPrompt 를 싣는다', () => {
    const occurrences = contentGeneration.match(/customPrompt: readCustomPromptFromUi\(\)/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('URL 경로의 assembly 에서 customPrompt 가 다시 빠지지 않는다 (회귀 잠금)', () => {
    // generateContentFromUrl 의 assembly 블록 안에 있어야 한다.
    const start = contentGeneration.indexOf('export async function generateContentFromUrl');
    const end = contentGeneration.indexOf('export async function normalizeKeywordsForGeneration');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(contentGeneration.slice(start, end)).toMatch(/customPrompt: readCustomPromptFromUi\(\)/);
  });
});

describe('개인 프롬프트 — 죽은 입력만 읽지 않는다', () => {
  const html = read('../public/index.html');

  it('#unified-custom-prompt 는 여전히 숨겨진 죽은 입력이다 (전제 확인)', () => {
    // 이 전제가 깨지면(누군가 보이게 만들면) 아래 폴백 규칙을 다시 검토해야 한다.
    expect(html).toMatch(/id="custom-prompt-section" style="display: none;"/);
  });

  it('URL 생성 경로가 hidden #custom-prompt-input 을 먼저 읽는다', () => {
    const renderer = read('renderer/renderer.ts');
    const start = renderer.indexOf('URL 기반 자동 생성을 시작합니다');
    expect(start).toBeGreaterThan(-1);
    const block = renderer.slice(start, start + 2000);
    expect(block.indexOf("'custom-prompt-input'")).toBeGreaterThan(-1);
    expect(block.indexOf("'custom-prompt-input'"))
      .toBeLessThan(block.indexOf("'unified-custom-prompt'"));
  });
});

describe('개인 프롬프트 — 모드 게이트가 값을 버리지 않는다', () => {
  it('다중계정: custom 모드 조건 없이 전달한다', () => {
    const ma = read('renderer/modules/multiAccountManager.ts');
    expect(ma).toMatch(/if \(queueItem\.customPrompt\) \{\s*\n\s*contentPayload\.assembly\.customPrompt = queueItem\.customPrompt;/);
    expect(ma).not.toMatch(/queueItem\.contentMode === 'custom' && queueItem\.customPrompt/);
  });

  it('연속발행: 항목별 값을 파이프라인이 읽는 입력에 주입한다', () => {
    const continuous = read('renderer/modules/continuousPublishing.ts');
    expect(continuous).toMatch(/getElementById\('custom-prompt-input'\)/);
    expect(continuous).not.toMatch(/item\.contentMode === 'custom' && item\.customPrompt/);
  });
});
