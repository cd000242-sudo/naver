import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getImageDiversityHints } from '../image/imageStyles';

/**
 * [2026-09-01 라이브 로그] 두 가지가 한 화면에서 어긋났다.
 *
 *   [이미지생성] 🎨 선택된 AI 이미지 생성 엔진: OpenAI 덕트테이프 (gpt-image-2)
 *   [OpenAI-Image] 🎨 총 1개 이미지 생성 시작 (모델: gpt-image-1.5, ...)
 *
 * 설정을 열어보니 config.openaiImageModel 이 실제로 'gpt-image-1.5' 였다.
 * 시스템은 저장된 값을 정확히 쓰고 있었고, 거짓말을 한 것은 화면 표시였다.
 * providerDisplayNames 가 provider 만 보고 "덕트테이프 (gpt-image-2)" 라는 고정 문구를
 * 붙였기 때문에, 모델이 무엇이든 gpt-image-2 를 쓰는 것처럼 보였다.
 *
 * 그래서 사장님은 2를 골랐다고 믿었고, 쇼핑커넥트 검사는 정확히 옳게 막았다.
 * (이 진단 전에 넣은 config 폴백은 증상만 건드린 것이다 — config 값 자체가 1.5 였다.)
 *
 * 두 번째. 같은 로그에 이 줄이 있었다.
 *
 *   [OpenAI-Image] 🎲 다양성[0]: 📐bird-eye view | ...
 *
 * openaiImageGenerator 는 `for (let i = 0; i < items.length; i++)` 로 돌며
 * getImageDiversityHints(i) 를 쓴다. 그런데 호출자가 이미지를 한 장씩 넘긴다
 * ("총 1개 이미지 생성 시작"). i 는 언제나 0 이고, 0번 힌트가 bird-eye view 다.
 *
 * 사장님 실측 "왜 전부 다 위에서 내려다보는 전신샷만 나오니?" 의 진짜 원인이 이것이다.
 * 앞서 "아무도 각도를 안 넣는다" 고 진단했던 것은 틀렸다 — 넣고 있었고, 늘 같은 것을 넣었다.
 */
describe('엔진 라벨은 실제 모델을 말해야 한다', () => {
  const src = readFileSync(resolve(__dirname, '..', 'imageGenerator.ts'), 'utf-8');

  it('openai-image 라벨에 모델명을 고정으로 박지 않는다', () => {
    const labelLine = src.split('\n').find((l) => l.includes("'openai-image':")) ?? '';
    expect(labelLine).not.toMatch(/gpt-image-2/);
  });

  it('실제 모델을 로그에 함께 남긴다', () => {
    // 표현 형태는 자유롭게 두고, 실제 모델 값이 그 로그로 나가는지만 본다.
    expect(src).toMatch(/선택된 AI 이미지 생성 엔진[^\n]*modelSuffix/);
    expect(src).toMatch(/modelSuffix\s*=\s*options\.imageModel/);
  });
});

describe('다양성 힌트 — 인덱스마다 달라야 한다', () => {
  it('0번이 부감이다 — 한 장씩 생성하면 전부 이것만 나온다', () => {
    expect(getImageDiversityHints(0).angle).toMatch(/bird-eye|overhead|looking down/i);
  });

  it('인덱스가 다르면 각도도 다르다', () => {
    expect(getImageDiversityHints(1).angle).not.toBe(getImageDiversityHints(0).angle);
  });
});

describe('다양성 인덱스는 소제목 순번을 따라야 한다', () => {
  /*
   * 호출자가 이미지를 한 장씩 넘기므로 루프 인덱스 i 는 언제나 0 이다.
   * 소제목 순번을 item 에 실어 보내고, 생성기가 그것을 우선 쓰게 한다.
   * 없으면 기존대로 루프 인덱스를 쓴다 — 다른 호출 경로가 깨지지 않는다.
   */
  it('ImageRequestItem 이 소제목 순번을 실을 수 있다', () => {
    const types = readFileSync(resolve(__dirname, '..', 'image', 'types.ts'), 'utf-8');
    expect(types).toMatch(/diversityIndex\?\s*:\s*number/);
  });

  it('생성기가 그 순번을 우선 쓴다', () => {
    const gen = readFileSync(resolve(__dirname, '..', 'image', 'openaiImageGenerator.ts'), 'utf-8');
    expect(gen).toMatch(/getImageDiversityHints\(\s*(?:diversitySeed|item\.diversityIndex)/);
  });
});
