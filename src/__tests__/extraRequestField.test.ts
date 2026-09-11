/**
 * [2026-09-12] "추가 요청사항" 입력창 — 사장님 요청("api한테 요청사항을 따로 작성하면
 * 반영하게끔, 경험을 반영하는 것과 동일하게").
 *
 * 배선은 이미 있었다. 제목 프롬프트(contentGenerator)와 본문 프롬프트(contentJsonPromptFormat)
 * 양쪽이 customPrompt 를 "추가 지시사항"으로 싣고, SEO·홈판·쇼핑·업체는 기본 프롬프트를
 * 유지한 채 더한다(사용자정의 모드만 완전 대체). 없던 것은 단일 생성 화면의 입력창뿐이다.
 *
 * 이 계열은 끊겨도 예외가 안 난다 — id 하나만 어긋나도 조용히 무시된다. 그래서 소스로 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('추가 요청사항 입력창', () => {
  it('화면에 입력창이 있다', () => {
    const html = read('../../public/index.html');
    expect(html).toMatch(/id="unified-extra-request"/);
    expect(html).toMatch(/추가 요청사항 \(선택\)/);
  });

  it('요청사항이 다른 규칙을 이긴다는 것을 화면에서 알린다', () => {
    const html = read('../../public/index.html');
    expect(html).toMatch(/다른 규칙보다 우선/);
  });

  it('프롬프트로 가는 단일 창구가 이 입력창을 읽는다', () => {
    const gen = read('../renderer/modules/contentGeneration.ts');
    const reader = gen.slice(gen.indexOf('function readCustomPromptFromUi'));
    expect(reader.slice(0, 1200)).toMatch(/unified-extra-request/);
  });

  it('연속발행 항목별 값이 먼저다 — 큐가 지정한 것을 화면 값이 덮지 않는다', () => {
    const gen = read('../renderer/modules/contentGeneration.ts');
    const reader = gen.slice(gen.indexOf('function readCustomPromptFromUi'), gen.indexOf('clearExtraRequestAfterGeneration'));
    expect(reader.indexOf('custom-prompt-input')).toBeLessThan(reader.indexOf('unified-extra-request'));
  });

  it('생성이 끝나면 비운다 — 지난 요청이 다음 글에 따라붙지 않는다', () => {
    const gen = read('../renderer/modules/contentGeneration.ts');
    expect(gen).toMatch(/export function clearExtraRequestAfterGeneration/);
    expect(gen).toMatch(/if \(source !== 'load'\) clearExtraRequestAfterGeneration\(\);/);
  });

  it('백엔드가 요청사항을 제목·본문 양쪽 프롬프트에 싣는다', () => {
    expect(read('../contentGenerator.ts')).toMatch(/\[사용자 추가 지시사항/);
    expect(read('../contentJsonPromptFormat.ts')).toMatch(/\[사용자 추가 지시사항/);
  });

  it('사용자정의 모드만 기본 프롬프트를 대체한다 — 다른 모드는 더한다', () => {
    const gen = read('../contentGenerator.ts');
    expect(gen).toMatch(/isCustomModeOverride = isUserPromptMode && contentMode === 'custom'/);
  });
});
