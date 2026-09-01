import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

/**
 * [2026-09-01] 두 조사 팀이 공통으로 지목한 것 — 우리 규칙이 우리 정답을 금지한다.
 *
 *   contentJsonPromptFormat:478
 *     "headings[].title은 명사형·구 단위로 끝낸다 … '…습니다/…해요' 로 끝나는 소제목 금지"
 *   headings-homefeed.prompt:17
 *     ✅ "이 조건에서 갈립니다"        <- 모범 예시가 금지 대상이다
 *   headings-homefeed.prompt:11
 *     "명사형만 이어 붙여 무슨 말인지 모르게 하지 않는다. 판단이 안 보이면 서술형으로 쓴다"
 *   headings-seo.prompt:40~41 (오늘 내가 넣은 것)
 *     "최소 하나는 서술형으로 끝낸다", "전부 명사로 끝내지 않는다"
 *
 * JSON 출력 형식은 조립 순서상 맨 뒤에 온다(contentGenerator 가 시스템 프롬프트 뒤에 붙인다).
 * 이 저장소가 exposure-structure.prompt:17 에 "뒤에 오는 절이 이겨 base 의 의도를 죽인다" 고
 * 적어 놨는데, 정확히 그 일이 벌어졌다.
 *
 * 그래서 실측 글의 소제목이 전부 같은 명사형으로 끝났다 —
 * "…구간", "…이유", "…지점", "…조건", "…사람", "…길이".
 * 소제목 골격 균일은 오늘 감지기를 만들어 잡기로 한 바로 그 증상인데,
 * 우리가 지시로 만들고 있었다.
 *
 * 원래 목적(발행 구조 파싱 보호)은 이미 해소됐다 —
 * contentBodyTransforms:314 주석 "Publish-side now survives via position-slicing".
 */
const prompt = (mode: string) => buildContentJsonOutputFormat({
  contentMode: mode,
  mode,
  source: { rawText: '', title: '' },
  title: '제목',
  rawText: '자료',
  primaryKeyword: '키워드',
  subKeywords: '서브',
} as never);

describe('소제목 종결형을 하나로 강제하지 않는다', () => {
  it('서술형 종결을 금지하지 않는다', () => {
    expect(prompt('seo')).not.toMatch(/완결 문장으로 끝나는 소제목 금지/u);
    expect(prompt('homefeed')).not.toMatch(/완결 문장으로 끝나는 소제목 금지/u);
  });

  it('대신 섞으라고 한다 — 균일이 문제였다', () => {
    expect(prompt('seo')).toMatch(/같은 종결형으로 통일하지 않는다|섞는다/u);
  });

  it('길이 상한은 유지한다 — 그건 사고 방지다', () => {
    expect(prompt('seo')).toMatch(/30자/u);
  });

  it('만능 라벨 예시를 정답으로 제시하지 않는다', () => {
    // "…가 갈린 이유", "…확인 포인트" 는 아무 글에나 붙는 라벨이라 예시로 부적절하다.
    expect(prompt('seo')).not.toMatch(/확인 포인트/u);
  });
});

describe('홈피드 프롬프트의 모범 예시와 충돌하지 않는다', () => {
  it('"이 조건에서 갈립니다" 가 금지되지 않는다', () => {
    const homefeedPrompt = readFileSync(
      resolve(__dirname, '..', 'prompts', 'shared', 'headings-homefeed.prompt'),
      'utf-8',
    );
    // 그 예시는 프롬프트에 그대로 남아 있어야 하고
    expect(homefeedPrompt).toContain('이 조건에서 갈립니다');
    // 출력 형식이 그것을 막지 않아야 한다
    expect(prompt('homefeed')).not.toMatch(/…습니다[^\n]*금지/u);
  });
});
