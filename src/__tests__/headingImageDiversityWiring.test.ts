// src/__tests__/headingImageDiversityWiring.test.ts
//
// [2026-09-08 사장님 실측] "같은 각도로 전부 비슷하게 나오잖아" — gpt-image 로 뽑은
// 6장이 전부 부감(bird-eye) 이었다. 로그가 그대로 말한다:
//   [OpenAI-Image] 🎲 다양성[0]: 📐bird-eye view ... × 6
//
// 2026-09-01 에 생성기(openaiImageGenerator)가 item.diversityIndex 를 우선 쓰도록
// 고쳤지만, 실제 호출자인 regenerateSingleImageForHeading 이 그 값을 안 실었다.
// 생성기만 잠그고 호출자를 안 잠근 탓에 같은 증상이 그대로 남았다.
// 여기서는 호출자를 잠근다.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '..', 'renderer', 'modules', 'headingImageGen.ts'),
  'utf-8',
);

/** regenerateSingleImageForHeading 본문만 잘라낸다. */
function regenerateFunctionBody(): string {
  const lines = SOURCE.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('async function regenerateSingleImageForHeading('));
  expect(start).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((l, i) => i > start && l === '}');
  expect(end).toBeGreaterThan(start);
  return lines.slice(start, end + 1).join('\n');
}

describe('개별 소제목 이미지 생성은 다양성 순번을 실어 보낸다', () => {
  const body = regenerateFunctionBody();

  it('생성 요청 items 가 하나 이상 있다', () => {
    const count = (body.match(/items:\s*\[/g) || []).length;
    expect(count).toBeGreaterThan(0);
  });

  it('모든 생성 요청이 같은 재료 묶음을 싣는다', () => {
    const chunks = body.split(/items:\s*\[/).slice(1);
    expect(chunks.length).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const chunk of chunks) {
      const closing = chunk.indexOf('}]');
      const itemsBlock = closing >= 0 ? chunk.slice(0, closing) : chunk.slice(0, 400);
      if (!/\.\.\.imageContextFields/.test(itemsBlock)) missing.push(itemsBlock.slice(0, 120));
    }
    expect(missing).toEqual([]);
  });

  it('그 묶음이 순번과 본문 근거를 모두 담는다', () => {
    const block = body.slice(body.indexOf('const imageContextFields'));
    expect(block).toMatch(/diversityIndex:\s*headingIndex/);
    for (const field of ['articleTitle', 'globalSubject', 'articleContext', 'sectionContent']) {
      expect(block.slice(0, 600)).toContain(field);
    }
  });

  it('프롬프트를 본문 근거 기반 LLM 으로 만든다 — 사전 치환 휴리스틱 단독 사용 금지', () => {
    expect(body).toMatch(/await generateEnglishPromptForHeading\(/);
    // 실패 시 종전 값으로 되돌아가는 안전망이 있어야 한다.
    expect(body).toMatch(/const syncPrompt = generateImagePromptByIndex\(/);
    expect(body).toMatch(/looksLikeUntranslatedPrompt\(/);
  });
});

describe('빈 소제목 일괄 생성은 -1 을 시드로 흘리지 않는다', () => {
  /**
   * 생성 루프만 본다 — 같은 파일의 "수집" 루프도 findIndex 를 쓰지만 그쪽은 배치 슬롯이지
   * 다양성 시드가 아니다.
   */
  function generateLoopBody(): string {
    const marker = SOURCE.indexOf('regenerateSingleImageForHeading(originalIndex');
    expect(marker).toBeGreaterThan(0);
    const loopStart = SOURCE.lastIndexOf('for (let i = 0;', marker);
    expect(loopStart).toBeGreaterThan(0);
    return SOURCE.slice(loopStart, marker);
  }

  it('findIndex 결과를 그대로 시드로 넘기지 않는다', () => {
    // -1 이 그대로 흘러가면 생성기가 Math.abs 로 1번 각도를 집어 순번이 엉킨다.
    const body = generateLoopBody();
    expect(body).not.toMatch(
      /const originalIndex = headings\.findIndex\(\(h: any\) => h\.title === heading\.title\);/,
    );
    expect(body).toMatch(/foundIndex >= 0 \? foundIndex : i/);
  });
});
